import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  classOptions,
  currentSchoolId,
  gradeOptions,
  requireClass,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const uuid = z.string().uuid('ID tidak valid.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.');
const optionalDate = z.union([z.literal(''), date]);
const status = z.enum([
  'draft',
  'submitted',
  'needs_revision',
  'verified',
  'selection',
  'accepted',
  'waitlisted',
  'rejected',
  'reregistered',
  'converted',
]);
type ApplicationStatus = z.infer<typeof status>;

const periodSchema = z
  .object({
    academic_year_id: uuid,
    name: z.string().trim().min(3, 'Nama periode minimal 3 karakter.').max(100),
    start_date: date,
    end_date: date,
    quota: z.coerce.number().int().min(0).max(100000),
    status: z.enum(['draft', 'open', 'closed']),
    registration_prefix: z
      .string()
      .trim()
      .min(2)
      .max(12)
      .regex(/^[A-Za-z0-9-]+$/, 'Prefix hanya boleh berisi huruf, angka, dan tanda hubung.')
      .transform((value) => value.toUpperCase()),
  })
  .refine((value) => value.start_date <= value.end_date, {
    message: 'Tanggal selesai tidak boleh mendahului tanggal mulai.',
    path: ['end_date'],
  });

const guardianSchema = z.object({
  name: z.string().trim().min(2).max(100),
  nik: z.union([z.literal(''), z.string().regex(/^\d{16}$/, 'NIK wali harus 16 digit.')]),
  relation: z.string().trim().min(1).max(50),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(''), z.email('Email wali tidak valid.')]),
  address: z.string().trim().max(500),
  is_primary: z.boolean(),
});
const documentSchema = z.object({
  type: z.string().trim().min(1).max(100),
  file_url: z.string().trim().refine(Boolean, 'File dokumen wajib diisi.'),
  description: z.string().trim().max(500).default(''),
});
export const applicationSchema = z
  .object({
    admission_period_id: uuid,
    nik: z.union([z.literal(''), z.string().regex(/^\d{16}$/, 'NIK harus 16 digit.')]),
    nisn: z.string().trim().max(30),
    name: z.string().trim().min(2).max(100),
    gender: z.enum(['male', 'female']),
    birth_date: optionalDate,
    birth_place: z.string().trim().max(100),
    address: z.string().trim().max(500),
    phone: z.string().trim().max(30),
    email: z.union([z.literal(''), z.email('Email tidak valid.')]),
    previous_school_name: z.string().trim().max(150),
    previous_school_npsn: z.string().trim().max(20),
    previous_school_address: z.string().trim().max(500),
    previous_school_last_grade: z.string().trim().max(50),
    previous_school_graduation_year: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]),
    target_grade_id: uuid,
    admission_path: z.string().trim().min(1).max(80),
    guardians: z.array(guardianSchema).min(1, 'Minimal satu data orang tua/wali.').max(5),
    documents: z.array(documentSchema).max(12).default([]),
  })
  .superRefine((value, context) => {
    if (value.guardians.filter((guardian) => guardian.is_primary).length !== 1)
      context.addIssue({
        code: 'custom',
        path: ['guardians'],
        message: 'Tentukan tepat satu wali utama.',
      });
  });

type ApplicationRow = Record<string, unknown> & { id: string };

function applicationRelations(rows: ApplicationRow[]) {
  if (!rows.length) return rows;
  const marks = rows.map(() => '?').join(',');
  const ids = rows.map((row) => row.id);
  const guardians = db()
    .prepare(
      `SELECT * FROM application_guardians WHERE application_id IN (${marks}) ORDER BY is_primary DESC,name`,
    )
    .all(...ids) as Array<Record<string, unknown> & { application_id: string }>;
  const documents = db()
    .prepare(
      `SELECT * FROM application_documents WHERE application_id IN (${marks}) ORDER BY created_at`,
    )
    .all(...ids) as Array<Record<string, unknown> & { application_id: string }>;
  const history = db()
    .prepare(
      `SELECT * FROM application_status_history WHERE application_id IN (${marks}) ORDER BY created_at DESC`,
    )
    .all(...ids) as Array<Record<string, unknown> & { application_id: string }>;
  return rows.map((row) => ({
    ...row,
    guardians: guardians.filter((item) => item.application_id === row.id),
    documents: documents.filter((item) => item.application_id === row.id),
    history: history.filter((item) => item.application_id === row.id),
  }));
}

function getApplication(schoolId: string, id: string) {
  const row = db()
    .prepare('SELECT * FROM student_applications WHERE id=? AND school_id=?')
    .get(id, schoolId) as (ApplicationRow & { status: ApplicationStatus }) | undefined;
  if (!row) throw new HttpError(404, 'Pendaftaran tidak ditemukan.');
  return row;
}

function recordStatus(
  applicationId: string,
  from: ApplicationStatus | null,
  to: ApplicationStatus,
  notes: string,
  actor: string,
) {
  db()
    .prepare(
      'INSERT INTO application_status_history(id,application_id,from_status,to_status,notes,actor) VALUES(?,?,?,?,?,?)',
    )
    .run(randomUUID(), applicationId, from, to, notes, actor);
}

function nextRegistrationNumber(period: {
  id: string;
  registration_prefix: string;
  start_date: string;
}) {
  const count = (
    db()
      .prepare('SELECT count(*) AS n FROM student_applications WHERE admission_period_id=?')
      .get(period.id) as { n: number }
  ).n;
  return `${period.registration_prefix}-${period.start_date.slice(0, 4)}-${String(count + 1).padStart(4, '0')}`;
}

function nextTrackingToken() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!db().prepare('SELECT id FROM student_applications WHERE tracking_token=?').get(token))
      return token;
  }
  throw new HttpError(503, 'Token pelacakan gagal dibuat. Silakan coba kembali.');
}

export function createApplication(
  schoolId: string,
  raw: unknown,
  actor: string,
  initialStatus: 'draft' | 'submitted' = 'submitted',
) {
  const data = applicationSchema.parse(raw);
  const period = db()
    .prepare('SELECT * FROM admission_periods WHERE id=? AND school_id=?')
    .get(data.admission_period_id, schoolId) as
    { id: string; status: string; registration_prefix: string; start_date: string } | undefined;
  if (!period) throw new HttpError(400, 'Periode penerimaan tidak valid.');
  if (
    !db()
      .prepare('SELECT id FROM grades WHERE id=? AND school_id=? AND is_active=1')
      .get(data.target_grade_id, schoolId)
  )
    throw new HttpError(400, 'Tingkat tujuan tidak valid.');
  if (
    data.nik &&
    db().prepare('SELECT id FROM students WHERE school_id=? AND nik=?').get(schoolId, data.nik)
  )
    throw new HttpError(409, 'NIK sudah terdaftar sebagai murid.');
  for (const document of data.documents) {
    const uploadId = uploadIdFromUrl(document.file_url);
    if (
      !uploadId ||
      !db()
        .prepare("SELECT id FROM uploads WHERE id=? AND scope='admission.document'")
        .get(uploadId)
    )
      throw new HttpError(400, 'Dokumen hasil upload tidak valid.');
  }
  const id = randomUUID();
  const trackingToken = nextTrackingToken();
  const number = nextRegistrationNumber(period);
  db()
    .prepare(
      `INSERT INTO student_applications(id,school_id,admission_period_id,registration_number,tracking_token,nik,nisn,name,gender,birth_date,birth_place,address,phone,email,previous_school_name,previous_school_npsn,previous_school_address,previous_school_last_grade,previous_school_graduation_year,target_grade_id,admission_path,status,submitted_at,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='submitted' THEN datetime('now') ELSE NULL END,?)`,
    )
    .run(
      id,
      schoolId,
      data.admission_period_id,
      number,
      trackingToken,
      data.nik,
      data.nisn,
      data.name,
      data.gender,
      data.birth_date || null,
      data.birth_place,
      data.address,
      data.phone,
      data.email,
      data.previous_school_name,
      data.previous_school_npsn,
      data.previous_school_address,
      data.previous_school_last_grade,
      data.previous_school_graduation_year,
      data.target_grade_id,
      data.admission_path,
      initialStatus,
      initialStatus,
      actor,
    );
  const insertGuardian = db().prepare(
    'INSERT INTO application_guardians(id,application_id,name,nik,relation,phone,email,address,is_primary) VALUES(?,?,?,?,?,?,?,?,?)',
  );
  for (const guardian of data.guardians)
    insertGuardian.run(
      randomUUID(),
      id,
      guardian.name,
      guardian.nik,
      guardian.relation,
      guardian.phone,
      guardian.email,
      guardian.address,
      Number(guardian.is_primary),
    );
  const insertDocument = db().prepare(
    'INSERT INTO application_documents(id,application_id,type,file_url,description) VALUES(?,?,?,?,?)',
  );
  for (const document of data.documents)
    insertDocument.run(randomUUID(), id, document.type, document.file_url, document.description);
  recordStatus(
    id,
    null,
    initialStatus,
    initialStatus === 'submitted' ? 'Pendaftaran dikirim.' : 'Draft dibuat.',
    actor,
  );
  return { id, registration_number: number, tracking_token: trackingToken };
}

export async function GET(request: Request) {
  try {
    await requireUser('admissions.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get('id');
    if (requestedId) {
      const id = uuid.parse(requestedId);
      const row = db()
        .prepare(
          `SELECT a.*,p.name AS period_name,p.academic_year_id,g.name AS target_grade_name,
           CASE a.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label
           FROM student_applications a JOIN admission_periods p ON p.id=a.admission_period_id
           JOIN grades g ON g.id=a.target_grade_id WHERE a.id=? AND a.school_id=?`,
        )
        .get(id, schoolId) as ApplicationRow | undefined;
      if (!row) throw new HttpError(404, 'Pendaftaran tidak ditemukan.');
      return Response.json(
        { application: applicationRelations([row])[0] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const selectedStatus = z
      .union([z.literal(''), status])
      .parse(url.searchParams.get('status') || '');
    const periodId = z.union([z.literal(''), uuid]).parse(url.searchParams.get('period_id') || '');
    const { filter, offset } = listParams(request);
    const conditions = [
      'a.school_id=?',
      '(a.registration_number LIKE ? OR a.nik LIKE ? OR a.nisn LIKE ? OR a.name LIKE ? OR a.phone LIKE ?)',
    ];
    const args: Array<string | number> = [schoolId, filter, filter, filter, filter, filter];
    if (selectedStatus) {
      conditions.push('a.status=?');
      args.push(selectedStatus);
    }
    if (periodId) {
      conditions.push('a.admission_period_id=?');
      args.push(periodId);
    }
    const where = conditions.join(' AND ');
    const rows = db()
      .prepare(
        `SELECT a.*,p.name AS period_name,p.academic_year_id,g.name AS target_grade_name,
       CASE a.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label
       FROM student_applications a JOIN admission_periods p ON p.id=a.admission_period_id
       JOIN grades g ON g.id=a.target_grade_id WHERE ${where}
       ORDER BY a.created_at DESC LIMIT 10 OFFSET ?`,
      )
      .all(...args, offset) as ApplicationRow[];
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM student_applications a WHERE ${where}`)
        .get(...args) as { n: number }
    ).n;
    const periods = db()
      .prepare(
        `SELECT p.*,ay.name AS academic_year_name,
       count(a.id) AS application_count,
       sum(CASE WHEN a.status IN ('accepted','reregistered','converted') THEN 1 ELSE 0 END) AS accepted_count
       FROM admission_periods p JOIN academic_years ay ON ay.id=p.academic_year_id
       LEFT JOIN student_applications a ON a.admission_period_id=p.id
       WHERE p.school_id=? GROUP BY p.id ORDER BY p.start_date DESC`,
      )
      .all(schoolId);
    return Response.json(
      {
        rows: applicationRelations(rows),
        total,
        periods,
        options: {
          period_id: (periods as Array<{ id: string; name: string }>).map((p) => ({
            value: p.id,
            label: p.name,
          })),
          academic_year_id: academicYearOptions(schoolId),
          target_grade_id: gradeOptions(schoolId),
          class_id: classOptions(schoolId),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('admissions.write');
    const input = await request.json();
    const entity = z.enum(['period', 'application', 'convert']).parse(input.entity);
    const schoolId = currentSchoolId();
    let result: Record<string, unknown> = {};
    db().transaction(() => {
      if (entity === 'period') {
        const data = periodSchema.parse(input);
        if (
          !db()
            .prepare('SELECT id FROM academic_years WHERE id=? AND school_id=?')
            .get(data.academic_year_id, schoolId)
        )
          throw new HttpError(400, 'Tahun ajaran tidak valid.');
        const id = randomUUID();
        db()
          .prepare(
            'INSERT INTO admission_periods(id,school_id,academic_year_id,name,start_date,end_date,quota,status,registration_prefix) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            schoolId,
            data.academic_year_id,
            data.name,
            data.start_date,
            data.end_date,
            data.quota,
            data.status,
            data.registration_prefix,
          );
        audit(actor.email, 'create', 'admission_periods', id, data);
        result = { id };
      } else if (entity === 'application') {
        result = createApplication(
          schoolId,
          input,
          actor.email,
          input.submit === false ? 'draft' : 'submitted',
        );
        audit(actor.email, 'create', 'student_applications', String(result.id), {
          registration_number: result.registration_number,
        });
      } else {
        const data = z
          .object({
            id: uuid,
            nis: z
              .string()
              .trim()
              .min(1)
              .max(30)
              .transform((v) => v.toUpperCase()),
            class_id: uuid,
            enrollment_date: date,
          })
          .parse(input);
        const application = getApplication(schoolId, data.id);
        if (application.status !== 'reregistered')
          throw new HttpError(409, 'Calon murid harus berstatus Daftar Ulang sebelum dikonversi.');
        const classroom = requireClass(schoolId, data.class_id);
        const period = db()
          .prepare('SELECT academic_year_id FROM admission_periods WHERE id=?')
          .get(application.admission_period_id) as { academic_year_id: string };
        if (classroom.academic_year_id !== period.academic_year_id)
          throw new HttpError(400, 'Rombel harus berada pada tahun ajaran periode penerimaan.');
        if (classroom.grade_id !== application.target_grade_id)
          throw new HttpError(400, 'Tingkat rombel tidak sesuai tingkat tujuan calon murid.');
        if (
          db()
            .prepare('SELECT id FROM students WHERE school_id=? AND nis=?')
            .get(schoolId, data.nis)
        )
          throw new HttpError(409, 'NIS sudah digunakan.');
        if (
          application.nik &&
          db()
            .prepare('SELECT id FROM students WHERE school_id=? AND nik=?')
            .get(schoolId, application.nik)
        )
          throw new HttpError(409, 'NIK sudah digunakan.');
        const studentId = randomUUID();
        db()
          .prepare(
            `INSERT INTO students(id,school_id,photo_url,nik,nis,nisn,name,gender,birth_date,birth_place,address,phone,email,enrollment_date,previous_school_name,previous_school_npsn,previous_school_address,previous_school_last_grade,previous_school_graduation_year,is_active,qr_token)
           VALUES(?,?,'',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
          )
          .run(
            studentId,
            schoolId,
            application.nik,
            data.nis,
            application.nisn,
            application.name,
            application.gender,
            application.birth_date,
            application.birth_place,
            application.address,
            application.phone,
            application.email,
            data.enrollment_date,
            application.previous_school_name,
            application.previous_school_npsn,
            application.previous_school_address,
            application.previous_school_last_grade,
            application.previous_school_graduation_year,
            randomBytes(24).toString('hex'),
          );
        db()
          .prepare(
            "INSERT INTO guardians(id,student_id,name,nik,relation,phone,email,address,is_primary) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random()) % 4 + 1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),?,name,nik,relation,phone,email,address,is_primary FROM application_guardians WHERE application_id=?",
          )
          .run(studentId, application.id);
        db()
          .prepare(
            "INSERT INTO student_documents(id,student_id,type,file_url,description) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random()) % 4 + 1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),?,type,file_url,description FROM application_documents WHERE application_id=?",
          )
          .run(studentId, application.id);
        db()
          .prepare(
            "INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,status) VALUES(?,?,?,?,?,'active')",
          )
          .run(
            randomUUID(),
            studentId,
            classroom.id,
            classroom.academic_year_id,
            data.enrollment_date,
          );
        db()
          .prepare(
            "UPDATE student_applications SET status='converted',converted_student_id=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(studentId, application.id);
        recordStatus(
          application.id,
          application.status,
          'converted',
          `Dikonversi menjadi murid dengan NIS ${data.nis}.`,
          actor.email,
        );
        audit(actor.email, 'convert', 'student_applications', application.id, {
          student_id: studentId,
          nis: data.nis,
        });
        result = { id: application.id, student_id: studentId };
      }
    })();
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('admissions.write');
    const input = await request.json();
    const entity = z.enum(['period', 'status', 'assessment', 'document']).parse(input.entity);
    const schoolId = currentSchoolId();
    db().transaction(() => {
      if (entity === 'period') {
        const id = uuid.parse(input.id);
        if (
          !db()
            .prepare('SELECT id FROM admission_periods WHERE id=? AND school_id=?')
            .get(id, schoolId)
        )
          throw new HttpError(404, 'Periode tidak ditemukan.');
        const data = periodSchema.parse(input);
        if (
          !db()
            .prepare('SELECT id FROM academic_years WHERE id=? AND school_id=?')
            .get(data.academic_year_id, schoolId)
        )
          throw new HttpError(400, 'Tahun ajaran tidak valid.');
        db()
          .prepare(
            "UPDATE admission_periods SET academic_year_id=?,name=?,start_date=?,end_date=?,quota=?,status=?,registration_prefix=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(
            data.academic_year_id,
            data.name,
            data.start_date,
            data.end_date,
            data.quota,
            data.status,
            data.registration_prefix,
            id,
          );
        audit(actor.email, 'update', 'admission_periods', id, data);
      } else if (entity === 'status') {
        const data = z
          .object({ id: uuid, status, notes: z.string().trim().max(1000).default('') })
          .parse(input);
        const application = getApplication(schoolId, data.id);
        const allowed: Record<ApplicationStatus, ApplicationStatus[]> = {
          draft: ['submitted'],
          submitted: ['needs_revision', 'verified'],
          needs_revision: ['submitted', 'verified'],
          verified: ['selection'],
          selection: ['accepted', 'waitlisted', 'rejected'],
          accepted: ['reregistered'],
          waitlisted: ['accepted', 'rejected'],
          rejected: [],
          reregistered: [],
          converted: [],
        };
        if (!allowed[application.status].includes(data.status))
          throw new HttpError(
            409,
            `Perubahan status ${application.status} ke ${data.status} tidak diizinkan.`,
          );
        if (data.status === 'accepted') {
          const period = db()
            .prepare('SELECT quota FROM admission_periods WHERE id=?')
            .get(application.admission_period_id) as { quota: number };
          const accepted = (
            db()
              .prepare(
                "SELECT count(*) AS n FROM student_applications WHERE admission_period_id=? AND status IN ('accepted','reregistered','converted')",
              )
              .get(application.admission_period_id) as { n: number }
          ).n;
          if (period.quota > 0 && accepted >= period.quota)
            throw new HttpError(409, 'Kuota penerimaan sudah penuh. Gunakan status Cadangan.');
        }
        db()
          .prepare(
            `UPDATE student_applications SET status=?,verification_notes=CASE WHEN ? IN ('verified','needs_revision') THEN ? ELSE verification_notes END,decision_notes=CASE WHEN ? IN ('accepted','waitlisted','rejected') THEN ? ELSE decision_notes END,verified_by=CASE WHEN ?='verified' THEN ? ELSE verified_by END,verified_at=CASE WHEN ?='verified' THEN datetime('now') ELSE verified_at END,submitted_at=CASE WHEN ?='submitted' THEN datetime('now') ELSE submitted_at END,updated_at=datetime('now') WHERE id=?`,
          )
          .run(
            data.status,
            data.status,
            data.notes,
            data.status,
            data.notes,
            data.status,
            actor.email,
            data.status,
            data.status,
            data.id,
          );
        recordStatus(data.id, application.status, data.status, data.notes, actor.email);
        audit(actor.email, 'status', 'student_applications', data.id, {
          from: application.status,
          to: data.status,
          notes: data.notes,
        });
      } else if (entity === 'assessment') {
        const data = z
          .object({
            id: uuid,
            assessment_test: z.number().min(0).max(100).nullable(),
            assessment_interview: z.number().min(0).max(100).nullable(),
            ranking: z.number().int().positive().nullable(),
            notes: z.string().trim().max(1000).default(''),
          })
          .parse(input);
        getApplication(schoolId, data.id);
        const final =
          data.assessment_test === null && data.assessment_interview === null
            ? null
            : ((data.assessment_test || 0) + (data.assessment_interview || 0)) /
              (Number(data.assessment_test !== null) + Number(data.assessment_interview !== null));
        db()
          .prepare(
            "UPDATE student_applications SET assessment_test=?,assessment_interview=?,assessment_final=?,ranking=?,decision_notes=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(
            data.assessment_test,
            data.assessment_interview,
            final,
            data.ranking,
            data.notes,
            data.id,
          );
        audit(actor.email, 'assess', 'student_applications', data.id, {
          ...data,
          assessment_final: final,
        });
      } else {
        const data = z
          .object({
            id: uuid,
            verified: z.boolean(),
            notes: z.string().trim().max(500).default(''),
          })
          .parse(input);
        const document = db()
          .prepare(
            'SELECT d.id FROM application_documents d JOIN student_applications a ON a.id=d.application_id WHERE d.id=? AND a.school_id=?',
          )
          .get(data.id, schoolId);
        if (!document) throw new HttpError(404, 'Dokumen tidak ditemukan.');
        db()
          .prepare(
            "UPDATE application_documents SET verified=?,verification_notes=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(Number(data.verified), data.notes, data.id);
        audit(actor.email, 'verify', 'application_documents', data.id, data);
      }
    })();
    return Response.json({ ok: true, id: input.id });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('admissions.write');
    const input = z
      .object({ entity: z.enum(['period', 'application']), id: uuid })
      .parse(await request.json());
    const schoolId = currentSchoolId();
    db().transaction(() => {
      if (input.entity === 'period') {
        if (
          !db()
            .prepare('SELECT id FROM admission_periods WHERE id=? AND school_id=?')
            .get(input.id, schoolId)
        )
          throw new HttpError(404, 'Periode tidak ditemukan.');
        if (
          db()
            .prepare('SELECT id FROM student_applications WHERE admission_period_id=? LIMIT 1')
            .get(input.id)
        )
          throw new HttpError(
            409,
            'Periode yang sudah memiliki pendaftaran tidak dapat dihapus. Tutup periode bila tidak digunakan.',
          );
        db().prepare('DELETE FROM admission_periods WHERE id=?').run(input.id);
      } else {
        const application = getApplication(schoolId, input.id);
        if (application.status !== 'draft')
          throw new HttpError(409, 'Hanya draft pendaftaran yang dapat dihapus.');
        db().prepare('DELETE FROM student_applications WHERE id=?').run(input.id);
      }
      audit(
        actor.email,
        'delete',
        input.entity === 'period' ? 'admission_periods' : 'student_applications',
        input.id,
      );
    })();
    return Response.json({ ok: true, id: input.id });
  } catch (error) {
    return failure(error);
  }
}
