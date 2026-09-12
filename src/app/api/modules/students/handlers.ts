import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  classOptions,
  currentSchoolId,
  requireClass,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.');
const optionalDate = z.union([z.literal(''), date]);
const optionalYear = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}$/, 'Tahun lulus harus terdiri dari 4 digit.'),
]);
const guardianSchema = z.object({
  name: z.string().trim().min(2, 'Nama wali minimal 2 karakter.').max(100),
  nik: z
    .union([z.literal(''), z.string().regex(/^\d{16}$/, 'NIK wali harus terdiri dari 16 digit.')])
    .default(''),
  relation: z.string().trim().min(1, 'Hubungan wali wajib diisi.').max(50),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email('Email wali tidak valid.')]).default(''),
  address: z.string().trim().max(500).default(''),
  is_primary: z.boolean().default(false),
});
const documentSchema = z.object({
  type: z.string().trim().min(1, 'Jenis dokumen wajib diisi.').max(100),
  file_url: z
    .string()
    .trim()
    .refine((value) => Boolean(uploadIdFromUrl(value)), 'File dokumen wajib diupload.'),
  description: z.string().trim().max(500).default(''),
});
const schema = z
  .object({
    photo_url: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => !value || Boolean(uploadIdFromUrl(value)), 'Foto murid tidak valid.')
      .default(''),
    nik: z
      .union([z.literal(''), z.string().regex(/^\d{16}$/, 'NIK harus terdiri dari 16 digit.')])
      .default(''),
    nis: z
      .string()
      .trim()
      .min(1, 'NIS wajib diisi.')
      .max(30)
      .transform((value) => value.toUpperCase()),
    nisn: z.string().trim().max(30).default(''),
    name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
    gender: z.enum(['male', 'female'], { error: 'Jenis kelamin wajib dipilih.' }),
    birth_date: optionalDate.default(''),
    birth_place: z.string().trim().max(100).default(''),
    family_card_number: z
      .union([z.literal(''), z.string().regex(/^\d{16}$/, 'Nomor KK harus terdiri dari 16 digit.')])
      .default(''),
    religion: z.string().trim().max(50).default(''),
    citizenship: z.string().trim().max(100).default('Indonesia'),
    child_order: z.coerce.number().int().min(0).max(99).default(0),
    sibling_count: z.coerce.number().int().min(0).max(99).default(0),
    birth_certificate_number: z.string().trim().max(100).default(''),
    has_special_needs: z.boolean().default(false),
    special_needs_type: z.string().trim().max(150).default(''),
    blood_type: z.enum(['', 'A', 'B', 'AB', 'O']).default(''),
    address: z.string().trim().max(500).default(''),
    phone: z.string().trim().max(30).default(''),
    email: z.union([z.literal(''), z.email('Email tidak valid.')]).default(''),
    enrollment_date: optionalDate.default(''),
    previous_school_name: z.string().trim().max(150).default(''),
    previous_school_npsn: z.string().trim().max(20).default(''),
    previous_school_address: z.string().trim().max(500).default(''),
    previous_school_last_grade: z.string().trim().max(50).default(''),
    previous_school_graduation_year: optionalYear.default(''),
    is_active: z.boolean().default(true),
    guardians: z.array(guardianSchema).max(10, 'Maksimal 10 wali.').default([]),
    documents: z.array(documentSchema).max(20, 'Maksimal 20 dokumen.').default([]),
    placement: z
      .object({ class_id: z.union([z.literal(''), z.string().uuid()]), start_date: optionalDate })
      .default({ class_id: '', start_date: '' }),
  })
  .superRefine((data, context) => {
    if (data.guardians.filter((guardian) => guardian.is_primary).length > 1)
      context.addIssue({
        code: 'custom',
        path: ['guardians'],
        message: 'Hanya satu wali yang dapat dijadikan kontak utama.',
      });
    if (data.placement.class_id && !data.placement.start_date)
      context.addIssue({
        code: 'custom',
        path: ['placement', 'start_date'],
        message: 'Tanggal mulai kelas wajib diisi.',
      });
    if (data.has_special_needs && !data.special_needs_type)
      context.addIssue({
        code: 'custom',
        path: ['special_needs_type'],
        message: 'Jenis kebutuhan khusus wajib diisi.',
      });
  });

type StudentRow = Record<string, unknown> & { id: string };

function attachRelations(rows: StudentRow[]) {
  if (!rows.length) return rows;
  const placeholders = rows.map(() => '?').join(',');
  const ids = rows.map((row) => row.id);
  const guardians = db()
    .prepare(
      `SELECT * FROM guardians WHERE student_id IN (${placeholders}) ORDER BY is_primary DESC,name`,
    )
    .all(...ids) as (Record<string, unknown> & { student_id: string })[];
  const documents = db()
    .prepare(
      `SELECT * FROM student_documents WHERE student_id IN (${placeholders}) ORDER BY created_at DESC`,
    )
    .all(...ids) as (Record<string, unknown> & { student_id: string })[];
  const histories = db()
    .prepare(
      `SELECT cm.*,c.name AS class_name,ay.name AS academic_year_name,
     CASE
       WHEN cm.completion_reason='promoted' THEN 'Naik kelas'
       WHEN cm.completion_reason='retained' THEN 'Tinggal kelas'
       WHEN cm.completion_reason='graduated' THEN 'Lulus'
       WHEN cm.completion_reason='withdrawn' THEN 'Pindah / keluar'
       WHEN cm.status='active' THEN 'Aktif'
       WHEN cm.status='completed' THEN 'Selesai'
       WHEN cm.status='transferred' THEN 'Pindah'
       ELSE 'Keluar'
     END AS status_label
     FROM class_memberships cm JOIN classes c ON c.id=cm.class_id
     JOIN academic_years ay ON ay.id=cm.academic_year_id
     WHERE cm.student_id IN (${placeholders}) ORDER BY ay.start_date DESC,cm.start_date DESC`,
    )
    .all(...ids) as (Record<string, unknown> & { student_id: string; status: string })[];
  return rows.map((row) => {
    const studentGuardians = guardians.filter((item) => item.student_id === row.id);
    const studentDocuments = documents.filter((item) => item.student_id === row.id);
    const history = histories.filter((item) => item.student_id === row.id);
    const current = history.find((item) => item.status === 'active');
    return {
      ...row,
      guardians: studentGuardians,
      documents: studentDocuments,
      history,
      guardian_name:
        studentGuardians.find((item) => item.is_primary)?.name || studentGuardians[0]?.name || '',
      document_count: studentDocuments.length,
      current_class_name: current?.class_name || '',
      placement: current
        ? { class_id: current.class_id, start_date: current.start_date }
        : { class_id: '', start_date: '' },
    };
  });
}

export async function GET(request: Request) {
  try {
    await requireUser('students.read');
    const schoolId = currentSchoolId();
    const activeYear = activeAcademicYear(schoolId);
    const url = new URL(request.url);
    const category = z
      .enum(['all', 'active', 'alumni', 'inactive'])
      .catch('all')
      .parse(url.searchParams.get('category') || 'all');
    const graduationYearId = z
      .union([z.literal(''), z.string().uuid('Tahun kelulusan tidak valid.')])
      .parse(url.searchParams.get('graduation_year_id') || '');
    const graduationClassId = z
      .union([z.literal(''), z.string().uuid('Rombel kelulusan tidak valid.')])
      .parse(url.searchParams.get('graduation_class_id') || '');
    const activeClassId = z
      .union([z.literal(''), z.string().uuid('Rombel aktif tidak valid.')])
      .parse(url.searchParams.get('active_class_id') || '');
    const gender = z.enum(['', 'male', 'female']).parse(url.searchParams.get('gender') || '');
    const { filter, offset } = listParams(request);
    const conditions = [
      's.school_id=?',
      '(s.nis LIKE ? OR s.nisn LIKE ? OR s.nik LIKE ? OR s.name LIKE ? OR s.email LIKE ?)',
    ];
    const args: Array<string | number> = [schoolId, filter, filter, filter, filter, filter];
    if (category === 'active') {
      conditions.push('s.is_active=1');
      if (activeClassId) {
        conditions.push(
          "EXISTS(SELECT 1 FROM class_memberships active_cm WHERE active_cm.student_id=s.id AND active_cm.status='active' AND active_cm.class_id=?)",
        );
        args.push(activeClassId);
      }
      if (gender) {
        conditions.push('s.gender=?');
        args.push(gender);
      }
    }
    if (category === 'inactive')
      conditions.push(
        "s.is_active=0 AND NOT EXISTS(SELECT 1 FROM class_memberships alumni_cm WHERE alumni_cm.student_id=s.id AND alumni_cm.completion_reason='graduated')",
      );
    if (category === 'alumni') {
      conditions.push(
        "s.is_active=0 AND EXISTS(SELECT 1 FROM class_memberships alumni_cm WHERE alumni_cm.student_id=s.id AND alumni_cm.completion_reason='graduated')",
      );
      if (graduationYearId) {
        conditions.push(
          "EXISTS(SELECT 1 FROM class_memberships alumni_year WHERE alumni_year.student_id=s.id AND alumni_year.completion_reason='graduated' AND alumni_year.academic_year_id=?)",
        );
        args.push(graduationYearId);
      }
      if (graduationClassId) {
        conditions.push(
          "EXISTS(SELECT 1 FROM class_memberships alumni_class WHERE alumni_class.student_id=s.id AND alumni_class.completion_reason='graduated' AND alumni_class.class_id=?)",
        );
        args.push(graduationClassId);
      }
      if (gender) {
        conditions.push('s.gender=?');
        args.push(gender);
      }
    }
    const where = conditions.join(' AND ');
    const rows = db()
      .prepare(
        `SELECT s.id,s.school_id,s.photo_url,s.nik,s.nis,s.nisn,s.name,s.gender,s.birth_date,s.birth_place,
          s.family_card_number,s.religion,s.citizenship,s.child_order,s.sibling_count,s.birth_certificate_number,
          s.has_special_needs,s.special_needs_type,s.province_code,s.province_name,s.regency_code,s.regency_name,
          s.district_code,s.district_name,s.village_code,s.village_name,s.rt,s.rw,s.postal_code,
          s.domicile_matches_family_card,s.family_card_issued_date,s.latitude,s.longitude,s.home_distance_km,
          s.blood_type,s.address,s.phone,s.email,s.enrollment_date,s.previous_school_name,
          s.previous_school_npsn,s.previous_school_address,s.previous_school_last_grade,
          s.previous_school_graduation_year,s.is_active,s.created_at,s.updated_at,
          CASE s.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label,
          (SELECT cm.class_id FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
           WHERE cm.student_id=s.id AND cm.completion_reason='graduated'
           ORDER BY ay.start_date DESC,cm.end_date DESC LIMIT 1) AS graduation_class_id,
          (SELECT c.name FROM class_memberships cm JOIN classes c ON c.id=cm.class_id
           JOIN academic_years ay ON ay.id=cm.academic_year_id
           WHERE cm.student_id=s.id AND cm.completion_reason='graduated'
           ORDER BY ay.start_date DESC,cm.end_date DESC LIMIT 1) AS graduation_class_name,
          (SELECT ay.id FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
           WHERE cm.student_id=s.id AND cm.completion_reason='graduated'
           ORDER BY ay.start_date DESC,cm.end_date DESC LIMIT 1) AS graduation_academic_year_id,
          (SELECT ay.name FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
           WHERE cm.student_id=s.id AND cm.completion_reason='graduated'
           ORDER BY ay.start_date DESC,cm.end_date DESC LIMIT 1) AS graduation_academic_year_name,
          (SELECT cm.end_date FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
           WHERE cm.student_id=s.id AND cm.completion_reason='graduated'
           ORDER BY ay.start_date DESC,cm.end_date DESC LIMIT 1) AS graduation_date
       FROM students s WHERE ${where} ORDER BY s.is_active DESC,s.name LIMIT 10 OFFSET ?`,
      )
      .all(...args, offset) as StudentRow[];
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM students s WHERE ${where}`)
        .get(...args) as { n: number }
    ).n;
    const graduationYears =
      category === 'alumni'
        ? db()
            .prepare(
              `SELECT DISTINCT ay.id AS value,ay.name AS label,ay.start_date
               FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
               JOIN students s ON s.id=cm.student_id
               WHERE s.school_id=? AND s.is_active=0 AND cm.completion_reason='graduated'
               ORDER BY ay.start_date DESC`,
            )
            .all(schoolId)
        : [];
    const graduationClasses =
      category === 'alumni'
        ? db()
            .prepare(
              `SELECT DISTINCT c.id AS value,c.name AS label,g.level_order
               FROM class_memberships cm JOIN classes c ON c.id=cm.class_id
               JOIN grades g ON g.id=c.grade_id JOIN students s ON s.id=cm.student_id
               WHERE s.school_id=? AND s.is_active=0 AND cm.completion_reason='graduated'
                 AND (?='' OR cm.academic_year_id=?)
               ORDER BY g.level_order,c.name`,
            )
            .all(schoolId, graduationYearId, graduationYearId)
        : [];
    return Response.json(
      {
        rows: attachRelations(rows),
        total,
        options: {
          class_id: classOptions(schoolId, activeYear.id),
          graduation_year_id: graduationYears,
          graduation_class_id: graduationClasses,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('students.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM students WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      if (method === 'DELETE') {
        db().prepare('DELETE FROM guardians WHERE student_id=?').run(id);
        db().prepare('DELETE FROM student_documents WHERE student_id=?').run(id);
        db().prepare('DELETE FROM class_memberships WHERE student_id=?').run(id);
        db().prepare('DELETE FROM students WHERE id=? AND school_id=?').run(id, schoolId);
        audit(actor.email, 'delete', 'students', id, { name: previous?.name });
        return;
      }

      const data = schema.parse(input);
      if (
        method === 'PATCH' &&
        data.is_active &&
        !previous?.is_active &&
        db()
          .prepare(
            "SELECT id FROM class_memberships WHERE student_id=? AND completion_reason='graduated' LIMIT 1",
          )
          .get(id)
      )
        throw new HttpError(
          409,
          'Alumni tidak dapat diaktifkan dari formulir biasa. Gunakan proses penerimaan kembali.',
        );
      const photoUploadId = uploadIdFromUrl(data.photo_url);
      if (
        photoUploadId &&
        !db()
          .prepare("SELECT id FROM uploads WHERE id=? AND scope='student.photo'")
          .get(photoUploadId)
      )
        throw new HttpError(400, 'Foto hasil upload tidak valid.');
      for (const document of data.documents) {
        const uploadId = uploadIdFromUrl(document.file_url)!;
        if (
          !db()
            .prepare("SELECT id FROM uploads WHERE id=? AND scope='student.document'")
            .get(uploadId)
        )
          throw new HttpError(400, 'File hasil upload tidak valid.');
      }
      if (
        data.nik &&
        db()
          .prepare('SELECT id FROM students WHERE school_id=? AND nik=? AND id<>?')
          .get(schoolId, data.nik, id)
      )
        throw new HttpError(409, 'NIK sudah digunakan oleh murid lain.');
      const classroom = data.placement.class_id
        ? requireClass(schoolId, data.placement.class_id)
        : undefined;
      const args = [
        data.photo_url,
        data.nik,
        data.nis,
        data.nisn,
        data.name,
        data.gender,
        data.birth_date || null,
        data.birth_place,
        data.family_card_number,
        data.religion,
        data.citizenship,
        data.child_order,
        data.sibling_count,
        data.birth_certificate_number,
        Number(data.has_special_needs),
        data.special_needs_type,
        data.blood_type,
        data.address,
        data.phone,
        data.email,
        data.enrollment_date || null,
        data.previous_school_name,
        data.previous_school_npsn,
        data.previous_school_address,
        data.previous_school_last_grade,
        data.previous_school_graduation_year,
        Number(data.is_active),
      ];
      if (method === 'POST')
        db()
          .prepare(
            `INSERT INTO students(id,school_id,photo_url,nik,nis,nisn,name,gender,birth_date,birth_place,family_card_number,religion,citizenship,child_order,sibling_count,birth_certificate_number,has_special_needs,special_needs_type,blood_type,address,phone,email,enrollment_date,previous_school_name,previous_school_npsn,previous_school_address,previous_school_last_grade,previous_school_graduation_year,is_active,qr_token)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(id, schoolId, ...args, randomBytes(24).toString('hex'));
      else
        db()
          .prepare(
            `UPDATE students SET photo_url=?,nik=?,nis=?,nisn=?,name=?,gender=?,birth_date=?,birth_place=?,family_card_number=?,religion=?,citizenship=?,child_order=?,sibling_count=?,birth_certificate_number=?,has_special_needs=?,special_needs_type=?,blood_type=?,address=?,phone=?,email=?,enrollment_date=?,previous_school_name=?,previous_school_npsn=?,previous_school_address=?,previous_school_last_grade=?,previous_school_graduation_year=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
          )
          .run(...args, id, schoolId);

      db().prepare('DELETE FROM guardians WHERE student_id=?').run(id);
      const insertGuardian = db().prepare(
        'INSERT INTO guardians(id,student_id,name,nik,relation,phone,email,address,is_primary) VALUES(?,?,?,?,?,?,?,?,?)',
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

      db().prepare('DELETE FROM student_documents WHERE student_id=?').run(id);
      const insertDocument = db().prepare(
        'INSERT INTO student_documents(id,student_id,type,file_url,description) VALUES(?,?,?,?,?)',
      );
      for (const document of data.documents)
        insertDocument.run(
          randomUUID(),
          id,
          document.type,
          document.file_url,
          document.description,
        );

      const activeMemberships = db()
        .prepare(
          "SELECT * FROM class_memberships WHERE student_id=? AND status='active' ORDER BY start_date DESC",
        )
        .all(id) as {
        id: string;
        class_id: string;
        academic_year_id: string;
        start_date: string;
      }[];
      const current = activeMemberships[0];
      if (
        classroom &&
        current &&
        current.class_id !== classroom.id &&
        current.academic_year_id !== classroom.academic_year_id
      )
        throw new HttpError(
          400,
          'Perpindahan lintas tahun ajaran harus dilakukan melalui Proses Kenaikan Kelas.',
        );
      if (classroom && !current && classroom.academic_year_id !== activeAcademicYear(schoolId).id)
        throw new HttpError(400, 'Penempatan baru harus menggunakan tahun ajaran aktif.');
      if (!data.is_active || !classroom) {
        db()
          .prepare(
            `UPDATE class_memberships SET status='withdrawn',
             end_date=COALESCE(end_date,CASE WHEN date('now') < start_date THEN start_date ELSE date('now') END),
             updated_at=datetime('now') WHERE student_id=? AND status='active'`,
          )
          .run(id);
      } else if (current?.class_id === data.placement.class_id) {
        db()
          .prepare(
            "UPDATE class_memberships SET start_date=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(data.placement.start_date, current.id);
      } else {
        for (const membership of activeMemberships) {
          if (data.placement.start_date < membership.start_date)
            throw new HttpError(
              400,
              'Tanggal mulai kelas baru tidak boleh mendahului riwayat aktif.',
            );
          db()
            .prepare(
              "UPDATE class_memberships SET status=?,completion_reason='transfer',end_date=?,updated_at=datetime('now') WHERE id=?",
            )
            .run(
              membership.academic_year_id === classroom.academic_year_id
                ? 'transferred'
                : 'completed',
              data.placement.start_date,
              membership.id,
            );
        }
        db()
          .prepare(
            `INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,end_date,status)
           VALUES(?,?,?,?,?,NULL,'active')`,
          )
          .run(
            randomUUID(),
            id,
            data.placement.class_id,
            classroom.academic_year_id,
            data.placement.start_date,
          );
      }
      audit(actor.email, method === 'POST' ? 'create' : 'update', 'students', id, data);
    })();
    return Response.json({ ok: true, id }, { status: method === 'POST' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}

export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
export const DELETE = (request: Request) => mutate(request, 'DELETE');
