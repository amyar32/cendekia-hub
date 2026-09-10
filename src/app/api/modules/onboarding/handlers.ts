import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const educationLevel = z.enum(['sd', 'smp', 'sma']);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Tanggal tidak valid.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm.');
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => !value || z.email().safeParse(value).success, 'Format email tidak valid.');
const optionalUploadUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!value || uploadIdFromUrl(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }, `Format URL ${label} tidak valid.`);

const profileSchema = z.object({
  action: z.literal('profile'),
  education_level: educationLevel,
  name: z.string().trim().min(2, 'Nama sekolah minimal 2 karakter.').max(150),
  code: z.string().trim().min(2, 'Kode sekolah minimal 2 karakter.').max(50),
  npsn: z
    .string()
    .trim()
    .refine((value) => !value || /^\d{8}$/.test(value), 'NPSN harus terdiri dari 8 digit.'),
  address: z.string().trim().min(5, 'Alamat sekolah minimal 5 karakter.').max(1000),
  email: optionalEmail.default(''),
  phone: z.string().trim().max(30).default(''),
  logo_url: optionalUploadUrl('logo').default(''),
  principal_name: z.string().trim().min(2, 'Nama kepala sekolah minimal 2 karakter.').max(150),
  principal_nip: z.string().trim().max(50).default(''),
  principal_signature_url: optionalUploadUrl('tanda tangan').default(''),
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']),
});

const gradesSchema = z
  .object({
    action: z.literal('grades'),
    education_level: educationLevel,
    grades: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          name: z.string().trim().min(1, 'Nama tingkat wajib diisi.').max(50),
          level_order: z.coerce.number().int().min(1).max(99),
          description: z.string().trim().max(500).default(''),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((value, context) => {
    const expected = value.education_level === 'sd' ? 6 : 3;
    if (value.grades.length !== expected)
      context.addIssue({
        code: 'custom',
        message: `${value.education_level.toUpperCase()} harus memiliki ${expected} tingkat.`,
        path: ['grades'],
      });
    if (new Set(value.grades.map((grade) => grade.level_order)).size !== value.grades.length)
      context.addIssue({
        code: 'custom',
        message: 'Urutan tingkat tidak boleh sama.',
        path: ['grades'],
      });
    if (new Set(value.grades.map((grade) => grade.name.toLowerCase())).size !== value.grades.length)
      context.addIssue({
        code: 'custom',
        message: 'Nama tingkat tidak boleh sama.',
        path: ['grades'],
      });
  });

const subjectSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, 'Kode mata pelajaran wajib diisi.').max(20),
  name: z.string().trim().min(2, 'Nama mata pelajaran minimal 2 karakter.').max(100),
  category: z.string().trim().max(50).default(''),
  description: z.string().trim().max(500).default(''),
});
const extracurricularSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, 'Kode ekstrakurikuler wajib diisi.').max(20),
  name: z.string().trim().min(2, 'Nama ekstrakurikuler minimal 2 karakter.').max(100),
  category: z.string().trim().max(50).default(''),
  description: z.string().trim().max(500).default(''),
  is_required: z.boolean().default(false),
});
const masterDataSchema = z
  .object({
    action: z.literal('master_data'),
    subjects: z.array(subjectSchema).min(1, 'Tambahkan minimal satu mata pelajaran.').max(100),
    extracurriculars: z
      .array(extracurricularSchema)
      .min(1, 'Tambahkan minimal satu ekstrakurikuler.')
      .max(100),
  })
  .superRefine((value, context) => {
    for (const [key, rows, label] of [
      ['subjects', value.subjects, 'mata pelajaran'],
      ['extracurriculars', value.extracurriculars, 'ekstrakurikuler'],
    ] as const) {
      if (new Set(rows.map((row) => row.code.toLowerCase())).size !== rows.length)
        context.addIssue({
          code: 'custom',
          message: `Kode ${label} tidak boleh sama.`,
          path: [key],
        });
      if (new Set(rows.map((row) => row.name.toLowerCase())).size !== rows.length)
        context.addIssue({
          code: 'custom',
          message: `Nama ${label} tidak boleh sama.`,
          path: [key],
        });
    }
  });

const semesterSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(50),
  period: z.coerce.number().int().min(1).max(2),
  start_date: isoDate,
  end_date: isoDate,
  is_active: z.boolean(),
});
const classroomSchema = z.object({
  id: z.string().uuid().optional(),
  grade_id: z.string().uuid('Tingkat rombel tidak valid.'),
  name: z.string().trim().min(1, 'Nama rombel wajib diisi.').max(50),
});
const academicSchema = z
  .object({
    action: z.literal('academic'),
    year: z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(4).max(50),
      start_date: isoDate,
      end_date: isoDate,
      semesters: z.array(semesterSchema).length(2, 'Tahun ajaran harus memiliki dua semester.'),
      classrooms: z.array(classroomSchema).min(1, 'Tambahkan minimal satu rombel.').max(100),
    }),
  })
  .superRefine((value, context) => {
    const { year } = value;
    if (year.start_date >= year.end_date)
      context.addIssue({ code: 'custom', message: 'Periode tahun ajaran tidak valid.' });
    if (new Set(year.semesters.map((semester) => semester.period)).size !== 2)
      context.addIssue({ code: 'custom', message: 'Periode semester harus ganjil dan genap.' });
    if (year.semesters.filter((semester) => semester.is_active).length !== 1)
      context.addIssue({ code: 'custom', message: 'Pilih tepat satu semester aktif.' });
    for (const semester of year.semesters)
      if (
        semester.start_date < year.start_date ||
        semester.end_date > year.end_date ||
        semester.start_date >= semester.end_date
      )
        context.addIssue({ code: 'custom', message: `Periode ${semester.name} tidak valid.` });
    if (
      new Set(year.classrooms.map((classroom) => classroom.name.toLowerCase())).size !==
      year.classrooms.length
    )
      context.addIssue({ code: 'custom', message: 'Nama rombel tidak boleh sama.' });
  });

const slotSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(50),
    start_time: time,
    end_time: time,
    slot_order: z.coerce.number().int().min(1).max(100),
    is_break: z.boolean(),
  })
  .refine((value) => value.start_time < value.end_time, 'Jam selesai harus setelah jam mulai.');
const scheduleSchema = z
  .object({
    action: z.literal('schedule'),
    checkin_late_after: time.default('07:15'),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7),
    slots: z.array(slotSchema).min(1, 'Tambahkan minimal satu slot waktu.').max(30),
  })
  .superRefine((value, context) => {
    if (new Set(value.weekdays).size !== value.weekdays.length)
      context.addIssue({ code: 'custom', message: 'Hari aktif tidak boleh sama.' });
    if (new Set(value.slots.map((slot) => slot.slot_order)).size !== value.slots.length)
      context.addIssue({ code: 'custom', message: 'Urutan slot waktu tidak boleh sama.' });
    const activeSlots = value.slots.filter((slot) => !slot.is_break);
    for (let index = 0; index < activeSlots.length; index += 1)
      for (let other = index + 1; other < activeSlots.length; other += 1)
        if (
          activeSlots[index].start_time < activeSlots[other].end_time &&
          activeSlots[other].start_time < activeSlots[index].end_time
        )
          context.addIssue({ code: 'custom', message: 'Slot pelajaran tidak boleh bertabrakan.' });
  });
const assignmentSemester = z.union([
  z.literal('all'),
  z.string().uuid('Semester penugasan tidak valid.'),
]);
const assignmentsSchema = z
  .object({
    action: z.literal('assignments'),
    teaching_assignments: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          teacher_id: z.string().uuid('Guru tidak valid.'),
          subject_id: z.string().uuid('Mata pelajaran tidak valid.'),
          class_id: z.string().uuid('Rombel tidak valid.'),
          semester_id: assignmentSemester.default('all'),
        }),
      )
      .min(1, 'Tambahkan minimal satu penugasan mata pelajaran.')
      .max(500),
    homeroom_assignments: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          teacher_id: z.string().uuid('Wali kelas tidak valid.'),
          class_id: z.string().uuid('Rombel wali kelas tidak valid.'),
        }),
      )
      .min(1, 'Tambahkan minimal satu wali kelas.')
      .max(100),
    extracurricular_assignments: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          extracurricular_id: z.string().uuid('Ekstrakurikuler tidak valid.'),
          teacher_id: z.string().uuid('Pembina tidak valid.'),
          semester_id: assignmentSemester.default('all'),
          location: z.string().trim().max(100).default(''),
          quota: z.coerce.number().int().min(0).max(1000).default(0),
          status: z.enum(['draft', 'active']).default('active'),
          student_ids: z.array(z.string().uuid('Murid tidak valid.')).max(1000).default([]),
        }),
      )
      .min(1, 'Tambahkan minimal satu penugasan ekstrakurikuler.')
      .max(100),
  })
  .superRefine((value, context) => {
    const teachingKeys = value.teaching_assignments.map(
      (item) =>
        `${item.teacher_id}:${item.subject_id}:${item.class_id}:${item.semester_id || 'all'}`,
    );
    if (new Set(teachingKeys).size !== teachingKeys.length)
      context.addIssue({
        code: 'custom',
        message: 'Penugasan mata pelajaran yang sama tidak boleh diulang.',
        path: ['teaching_assignments'],
      });
    if (
      new Set(value.homeroom_assignments.map((item) => item.teacher_id)).size !==
      value.homeroom_assignments.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Satu guru hanya dapat menjadi wali untuk satu rombel.',
        path: ['homeroom_assignments'],
      });
    if (
      new Set(value.homeroom_assignments.map((item) => item.class_id)).size !==
      value.homeroom_assignments.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Satu rombel hanya dapat memiliki satu wali kelas.',
        path: ['homeroom_assignments'],
      });
    const extracurricularKeys = value.extracurricular_assignments.map(
      (item) => `${item.extracurricular_id}:${item.semester_id || 'all'}`,
    );
    if (new Set(extracurricularKeys).size !== extracurricularKeys.length)
      context.addIssue({
        code: 'custom',
        message: 'Ekstrakurikuler yang sama tidak boleh memiliki periode penugasan ganda.',
        path: ['extracurricular_assignments'],
      });
    value.extracurricular_assignments.forEach((assignment, index) => {
      if (new Set(assignment.student_ids).size !== assignment.student_ids.length)
        context.addIssue({
          code: 'custom',
          message: 'Daftar peserta memuat murid yang sama.',
          path: ['extracurricular_assignments', index, 'student_ids'],
        });
      if (assignment.quota > 0 && assignment.student_ids.length > assignment.quota)
        context.addIssue({
          code: 'custom',
          message: 'Jumlah peserta melebihi kuota.',
          path: ['extracurricular_assignments', index, 'student_ids'],
        });
    });
  });
const completeSchema = z.object({ action: z.literal('complete') });
const requestSchema = z.discriminatedUnion('action', [
  profileSchema,
  gradesSchema,
  masterDataSchema,
  academicSchema,
  scheduleSchema,
  assignmentsSchema,
  completeSchema,
]);

type SchoolRow = Record<string, unknown> & {
  id: string;
  name: string;
  code: string;
  npsn: string;
  address: string;
  email: string;
  phone: string;
  logo_url: string;
  principal_name: string;
  principal_nip: string;
  principal_signature_url: string;
  timezone: string;
  checkin_late_after: string;
  schedule_weekdays: string;
  education_level: string;
  onboarding_completed_at: string | null;
};

function school() {
  return db().prepare('SELECT * FROM schools ORDER BY is_active DESC,created_at LIMIT 1').get() as
    SchoolRow | undefined;
}

function count(table: string, schoolId: string) {
  return (
    db().prepare(`SELECT count(*) AS total FROM ${table} WHERE school_id=?`).get(schoolId) as {
      total: number;
    }
  ).total;
}

export function onboardingState() {
  const currentSchool = school();
  if (!currentSchool)
    return {
      school: null,
      grades: [],
      subjects: [],
      extracurriculars: [],
      active_year: null,
      teachers: [],
      students: [],
      teaching_assignments: [],
      homeroom_assignments: [],
      extracurricular_assignments: [],
      slots: [],
      weekdays: [1, 2, 3, 4, 5],
      counts: {
        teachers: 0,
        students: 0,
        subjects: 0,
        extracurriculars: 0,
        classrooms: 0,
        schedules: 0,
        teaching_assignments: 0,
        homeroom_assignments: 0,
        extracurricular_assignments: 0,
      },
      readiness: {
        profile: false,
        grades: false,
        subjects: false,
        extracurriculars: false,
        academic_year: false,
        semesters: false,
        slots: false,
        teachers: false,
        classrooms: false,
        students: false,
        schedules: false,
        teaching_assignments: false,
        homeroom_assignments: false,
        extracurricular_assignments: false,
      },
    };
  const grades = db()
    .prepare(
      'SELECT id,name,level_order,description,is_active FROM grades WHERE school_id=? ORDER BY level_order',
    )
    .all(currentSchool.id) as Array<Record<string, unknown>>;
  const subjects = db()
    .prepare(
      'SELECT id,code,name,category,description,is_active FROM subjects WHERE school_id=? AND is_active=1 ORDER BY name',
    )
    .all(currentSchool.id);
  const extracurriculars = db()
    .prepare(
      `SELECT id,code,name,category,description,is_required,is_active
              FROM extracurriculars WHERE school_id=? AND is_active=1 ORDER BY name`,
    )
    .all(currentSchool.id);
  const activeYear = db()
    .prepare('SELECT * FROM academic_years WHERE school_id=? AND is_active=1')
    .get(currentSchool.id) as (Record<string, unknown> & { id: string }) | undefined;
  const semesters = (
    activeYear
      ? db()
          .prepare(
            'SELECT id,name,period,start_date,end_date,is_active FROM semesters WHERE academic_year_id=? ORDER BY period',
          )
          .all(activeYear.id)
      : []
  ) as Array<Record<string, unknown> & { is_active: number }>;
  const classrooms = activeYear
    ? db()
        .prepare(
          `SELECT c.id,c.grade_id,c.name,c.is_active,g.name AS grade_name
                  FROM classes c JOIN grades g ON g.id=c.grade_id
                  WHERE c.school_id=? AND c.academic_year_id=? ORDER BY g.level_order,c.name`,
        )
        .all(currentSchool.id, activeYear.id)
    : [];
  const slots = db()
    .prepare(
      'SELECT id,name,start_time,end_time,slot_order,is_break,is_active FROM schedule_time_slots WHERE school_id=? ORDER BY slot_order',
    )
    .all(currentSchool.id) as Array<{ is_break: number }>;
  const teachers = db()
    .prepare(
      'SELECT id,employee_code,name FROM teachers WHERE school_id=? AND is_active=1 ORDER BY name',
    )
    .all(currentSchool.id);
  const students = activeYear
    ? db()
        .prepare(
          `SELECT s.id,s.nis,s.name,c.name AS class_name
             FROM students s
             JOIN class_memberships cm ON cm.student_id=s.id
             JOIN classes c ON c.id=cm.class_id
            WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
              AND cm.status='active'
            ORDER BY s.name`,
        )
        .all(currentSchool.id, activeYear.id)
    : [];
  const teachingAssignments = activeYear
    ? db()
        .prepare(
          `SELECT ta.id,ta.teacher_id,ta.subject_id,ta.class_id,
                  COALESCE(ta.semester_id,'all') AS semester_id
             FROM teaching_assignments ta
             JOIN teachers t ON t.id=ta.teacher_id
            WHERE t.school_id=? AND ta.academic_year_id=?
            ORDER BY ta.created_at`,
        )
        .all(currentSchool.id, activeYear.id)
    : [];
  const homeroomAssignments = activeYear
    ? db()
        .prepare(
          `SELECT ha.id,ha.teacher_id,ha.class_id
             FROM homeroom_assignments ha
             JOIN teachers t ON t.id=ha.teacher_id
            WHERE t.school_id=? AND ha.academic_year_id=?
            ORDER BY ha.created_at`,
        )
        .all(currentSchool.id, activeYear.id)
    : [];
  const extracurricularAssignmentRows = activeYear
    ? (db()
        .prepare(
          `SELECT ea.id,ea.extracurricular_id,ea.teacher_id,
                  COALESCE(ea.semester_id,'all') AS semester_id,
                  ea.location,ea.quota,ea.status
             FROM extracurricular_assignments ea
             JOIN extracurriculars e ON e.id=ea.extracurricular_id
            WHERE e.school_id=? AND ea.academic_year_id=? AND ea.status<>'completed'
            ORDER BY ea.created_at`,
        )
        .all(currentSchool.id, activeYear.id) as Array<Record<string, unknown> & { id: string }>)
    : [];
  const extracurricularAssignments = extracurricularAssignmentRows.map((assignment) => ({
    ...assignment,
    student_ids: (
      db()
        .prepare(
          'SELECT student_id FROM extracurricular_participants WHERE assignment_id=? ORDER BY created_at',
        )
        .all(assignment.id) as Array<{ student_id: string }>
    ).map((participant) => participant.student_id),
  }));
  const counts = {
    teachers: count('teachers', currentSchool.id),
    students: count('students', currentSchool.id),
    subjects: (subjects as unknown[]).length,
    extracurriculars: (extracurriculars as unknown[]).length,
    classrooms: activeYear ? (classrooms as unknown[]).length : 0,
    schedules: activeYear
      ? (
          db()
            .prepare(
              `SELECT count(*) AS total FROM class_schedules cs
                      JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
                      WHERE ta.academic_year_id=?`,
            )
            .get(activeYear.id) as { total: number }
        ).total
      : 0,
    teaching_assignments: teachingAssignments.length,
    homeroom_assignments: homeroomAssignments.length,
    extracurricular_assignments: extracurricularAssignments.length,
  };
  const expectedGrades = currentSchool.education_level === 'sd' ? 6 : 3;
  return {
    school: currentSchool,
    grades,
    subjects,
    extracurriculars,
    active_year: activeYear ? { ...activeYear, semesters, classrooms } : null,
    teachers,
    students,
    teaching_assignments: teachingAssignments,
    homeroom_assignments: homeroomAssignments,
    extracurricular_assignments: extracurricularAssignments,
    slots,
    weekdays: JSON.parse(currentSchool.schedule_weekdays || '[1,2,3,4,5]'),
    counts,
    readiness: {
      profile: Boolean(currentSchool.name && currentSchool.code && currentSchool.address),
      grades: Boolean(currentSchool.education_level && grades.length === expectedGrades),
      subjects: counts.subjects > 0,
      extracurriculars: counts.extracurriculars > 0,
      academic_year: Boolean(activeYear),
      semesters: semesters.length === 2 && semesters.filter((item) => item.is_active).length === 1,
      slots: slots.some((slot) => !slot.is_break),
      teachers: counts.teachers > 0,
      classrooms: counts.classrooms > 0,
      students: counts.students > 0,
      schedules: counts.schedules > 0,
      teaching_assignments: counts.teaching_assignments > 0,
      homeroom_assignments:
        counts.classrooms > 0 && counts.homeroom_assignments >= counts.classrooms,
      extracurricular_assignments: counts.extracurricular_assignments > 0,
    },
  };
}

export async function GET() {
  try {
    await requireUser('school.read');
    return Response.json(onboardingState(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = requestSchema.parse(await request.json());
    const permission =
      input.action === 'profile' || input.action === 'complete'
        ? 'school.write'
        : input.action === 'grades'
          ? 'grades.write'
          : input.action === 'master_data'
            ? 'subjects.write'
            : input.action === 'academic'
              ? 'academic-years.write'
              : input.action === 'assignments'
                ? 'teaching-assignments.write'
                : 'schedules.write';
    const actor = await requireUser(permission);
    if (input.action === 'master_data') await requireUser('extracurriculars.write');
    if (input.action === 'assignments') await requireUser('extracurricular-assignments.write');
    if (input.action === 'assignments') await requireUser('homeroom-assignments.write');
    let schoolId = school()?.id || '';

    db().transaction(() => {
      if (input.action === 'profile') {
        for (const item of [
          { url: input.logo_url, scope: 'school.logo', label: 'Logo' },
          {
            url: input.principal_signature_url,
            scope: 'school.principal-signature',
            label: 'Tanda tangan',
          },
        ]) {
          const uploadId = uploadIdFromUrl(item.url);
          if (
            uploadId &&
            !db().prepare('SELECT id FROM uploads WHERE id=? AND scope=?').get(uploadId, item.scope)
          )
            throw new HttpError(400, `${item.label} hasil upload tidak valid.`);
        }
        schoolId ||= randomUUID();
        const previous = school();
        if (
          previous?.education_level &&
          previous.education_level !== input.education_level &&
          count('grades', previous.id) > 0
        )
          throw new HttpError(
            409,
            'Jenjang tidak dapat diubah setelah struktur tingkat dibuat. Hapus struktur akademik terkait terlebih dahulu.',
          );
        if (previous)
          db()
            .prepare(
              `UPDATE schools SET name=?,code=?,npsn=?,address=?,email=?,phone=?,logo_url=?,
                      principal_name=?,principal_nip=?,principal_signature_url=?,timezone=?,
                      education_level=?,is_active=1,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              input.name,
              input.code,
              input.npsn,
              input.address,
              input.email,
              input.phone,
              input.logo_url,
              input.principal_name,
              input.principal_nip,
              input.principal_signature_url,
              input.timezone,
              input.education_level,
              schoolId,
            );
        else
          db()
            .prepare(
              `INSERT INTO schools(id,name,code,npsn,address,email,phone,logo_url,principal_name,
                      principal_nip,principal_signature_url,timezone,education_level,is_active)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
            )
            .run(
              schoolId,
              input.name,
              input.code,
              input.npsn,
              input.address,
              input.email,
              input.phone,
              input.logo_url,
              input.principal_name,
              input.principal_nip,
              input.principal_signature_url,
              input.timezone,
              input.education_level,
            );
      } else {
        if (!schoolId) throw new HttpError(409, 'Simpan profil sekolah terlebih dahulu.');
        if (input.action === 'grades') {
          const currentLevel = school()?.education_level;
          if (
            currentLevel &&
            currentLevel !== input.education_level &&
            count('grades', schoolId) > 0
          )
            throw new HttpError(
              409,
              'Jenjang tidak dapat diubah setelah struktur tingkat dibuat. Hapus struktur akademik terkait terlebih dahulu.',
            );
          for (const grade of input.grades) {
            const existing = grade.id
              ? db()
                  .prepare('SELECT id FROM grades WHERE id=? AND school_id=?')
                  .get(grade.id, schoolId)
              : db()
                  .prepare('SELECT id FROM grades WHERE school_id=? AND level_order=?')
                  .get(schoolId, grade.level_order);
            const gradeId =
              grade.id || (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE grades SET name=?,level_order=?,description=?,is_active=1,
                            updated_at=datetime('now') WHERE id=? AND school_id=?`,
                )
                .run(grade.name, grade.level_order, grade.description, gradeId, schoolId);
            else
              db()
                .prepare(
                  'INSERT INTO grades(id,school_id,name,level_order,description,is_active) VALUES(?,?,?,?,?,1)',
                )
                .run(gradeId, schoolId, grade.name, grade.level_order, grade.description);
          }
          db()
            .prepare("UPDATE schools SET education_level=?,updated_at=datetime('now') WHERE id=?")
            .run(input.education_level, schoolId);
        } else if (input.action === 'master_data') {
          for (const subject of input.subjects) {
            const code = subject.code.toUpperCase();
            const existing = subject.id
              ? db()
                  .prepare('SELECT id FROM subjects WHERE id=? AND school_id=?')
                  .get(subject.id, schoolId)
              : db()
                  .prepare('SELECT id FROM subjects WHERE school_id=? AND lower(code)=lower(?)')
                  .get(schoolId, code);
            if (subject.id && !existing)
              throw new HttpError(404, `Mata pelajaran ${subject.name} tidak ditemukan.`);
            const id = (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE subjects SET code=?,name=?,category=?,description=?,is_active=1,
                          updated_at=datetime('now') WHERE id=? AND school_id=?`,
                )
                .run(code, subject.name, subject.category, subject.description, id, schoolId);
            else
              db()
                .prepare(
                  `INSERT INTO subjects(id,school_id,code,name,category,description,is_active)
                          VALUES(?,?,?,?,?,?,1)`,
                )
                .run(id, schoolId, code, subject.name, subject.category, subject.description);
          }
          for (const extracurricular of input.extracurriculars) {
            const code = extracurricular.code.toUpperCase();
            const existing = extracurricular.id
              ? db()
                  .prepare('SELECT id FROM extracurriculars WHERE id=? AND school_id=?')
                  .get(extracurricular.id, schoolId)
              : db()
                  .prepare(
                    'SELECT id FROM extracurriculars WHERE school_id=? AND lower(code)=lower(?)',
                  )
                  .get(schoolId, code);
            if (extracurricular.id && !existing)
              throw new HttpError(404, `Ekstrakurikuler ${extracurricular.name} tidak ditemukan.`);
            const id = (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE extracurriculars SET code=?,name=?,category=?,description=?,
                          is_required=?,is_active=1,updated_at=datetime('now')
                          WHERE id=? AND school_id=?`,
                )
                .run(
                  code,
                  extracurricular.name,
                  extracurricular.category,
                  extracurricular.description,
                  Number(extracurricular.is_required),
                  id,
                  schoolId,
                );
            else
              db()
                .prepare(
                  `INSERT INTO extracurriculars(id,school_id,code,name,category,description,
                          is_required,is_active) VALUES(?,?,?,?,?,?,?,1)`,
                )
                .run(
                  id,
                  schoolId,
                  code,
                  extracurricular.name,
                  extracurricular.category,
                  extracurricular.description,
                  Number(extracurricular.is_required),
                );
          }
        } else if (input.action === 'academic') {
          const { year } = input;
          const existingYear = year.id
            ? db()
                .prepare('SELECT id FROM academic_years WHERE id=? AND school_id=?')
                .get(year.id, schoolId)
            : undefined;
          if (year.id && !existingYear) throw new HttpError(404, 'Tahun ajaran tidak ditemukan.');
          const yearId = year.id || randomUUID();
          db()
            .prepare(
              "UPDATE academic_years SET is_active=0,updated_at=datetime('now') WHERE school_id=? AND id<>?",
            )
            .run(schoolId, yearId);
          if (existingYear)
            db()
              .prepare(
                `UPDATE academic_years SET name=?,start_date=?,end_date=?,is_active=1,
                          updated_at=datetime('now') WHERE id=? AND school_id=?`,
              )
              .run(year.name, year.start_date, year.end_date, yearId, schoolId);
          else
            db()
              .prepare(
                'INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active) VALUES(?,?,?,?,?,1)',
              )
              .run(yearId, schoolId, year.name, year.start_date, year.end_date);
          db()
            .prepare(
              `UPDATE semesters SET is_active=0,updated_at=datetime('now')
                        WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id=?)`,
            )
            .run(schoolId);
          for (const semester of year.semesters) {
            const existing = semester.id
              ? db()
                  .prepare('SELECT id FROM semesters WHERE id=? AND academic_year_id=?')
                  .get(semester.id, yearId)
              : db()
                  .prepare('SELECT id FROM semesters WHERE academic_year_id=? AND period=?')
                  .get(yearId, semester.period);
            const semesterId =
              semester.id || (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE semesters SET name=?,period=?,start_date=?,end_date=?,is_active=?,
                            updated_at=datetime('now') WHERE id=? AND academic_year_id=?`,
                )
                .run(
                  semester.name,
                  semester.period,
                  semester.start_date,
                  semester.end_date,
                  Number(semester.is_active),
                  semesterId,
                  yearId,
                );
            else
              db()
                .prepare(
                  'INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active) VALUES(?,?,?,?,?,?,?)',
                )
                .run(
                  semesterId,
                  yearId,
                  semester.name,
                  semester.period,
                  semester.start_date,
                  semester.end_date,
                  Number(semester.is_active),
                );
          }
          for (const classroom of year.classrooms) {
            if (
              !db()
                .prepare('SELECT id FROM grades WHERE id=? AND school_id=?')
                .get(classroom.grade_id, schoolId)
            )
              throw new HttpError(400, 'Ada rombel dengan tingkat yang tidak valid.');
            const existing = classroom.id
              ? db()
                  .prepare(
                    'SELECT id FROM classes WHERE id=? AND school_id=? AND academic_year_id=?',
                  )
                  .get(classroom.id, schoolId, yearId)
              : db()
                  .prepare(
                    'SELECT id FROM classes WHERE school_id=? AND academic_year_id=? AND lower(name)=lower(?)',
                  )
                  .get(schoolId, yearId, classroom.name);
            const classroomId =
              classroom.id || (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE classes SET grade_id=?,name=?,is_active=1,
                            updated_at=datetime('now') WHERE id=? AND school_id=? AND academic_year_id=?`,
                )
                .run(classroom.grade_id, classroom.name, classroomId, schoolId, yearId);
            else
              db()
                .prepare(
                  'INSERT INTO classes(id,school_id,academic_year_id,grade_id,name,is_active) VALUES(?,?,?,?,?,1)',
                )
                .run(classroomId, schoolId, yearId, classroom.grade_id, classroom.name);
          }
        } else if (input.action === 'schedule') {
          db()
            .prepare(
              "UPDATE schools SET schedule_weekdays=?,checkin_late_after=?,updated_at=datetime('now') WHERE id=?",
            )
            .run(
              JSON.stringify([...input.weekdays].sort((a, b) => a - b)),
              input.checkin_late_after,
              schoolId,
            );
          for (const slot of input.slots) {
            const existing = slot.id
              ? db()
                  .prepare('SELECT id FROM schedule_time_slots WHERE id=? AND school_id=?')
                  .get(slot.id, schoolId)
              : db()
                  .prepare('SELECT id FROM schedule_time_slots WHERE school_id=? AND slot_order=?')
                  .get(schoolId, slot.slot_order);
            const slotId = slot.id || (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE schedule_time_slots SET name=?,start_time=?,end_time=?,slot_order=?,
                            is_break=?,is_active=1,updated_at=datetime('now') WHERE id=? AND school_id=?`,
                )
                .run(
                  slot.name,
                  slot.start_time,
                  slot.end_time,
                  slot.slot_order,
                  Number(slot.is_break),
                  slotId,
                  schoolId,
                );
            else
              db()
                .prepare(
                  'INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order,is_break,is_active) VALUES(?,?,?,?,?,?,?,1)',
                )
                .run(
                  slotId,
                  schoolId,
                  slot.name,
                  slot.start_time,
                  slot.end_time,
                  slot.slot_order,
                  Number(slot.is_break),
                );
          }
        } else if (input.action === 'assignments') {
          const activeYear = db()
            .prepare('SELECT id FROM academic_years WHERE school_id=? AND is_active=1')
            .get(schoolId) as { id: string } | undefined;
          if (!activeYear)
            throw new HttpError(409, 'Simpan tahun ajaran aktif sebelum membuat penugasan.');
          const activeClassrooms = db()
            .prepare(
              'SELECT id FROM classes WHERE school_id=? AND academic_year_id=? AND is_active=1',
            )
            .all(schoolId, activeYear.id) as Array<{ id: string }>;
          const homeroomClassIds = new Set(
            input.homeroom_assignments.map((assignment) => assignment.class_id),
          );
          if (
            homeroomClassIds.size !== activeClassrooms.length ||
            activeClassrooms.some((classroom) => !homeroomClassIds.has(classroom.id))
          )
            throw new HttpError(400, 'Setiap rombel aktif wajib memiliki satu wali kelas.');
          const semesterId = (value: string) => (value === 'all' ? null : value);
          const requireSemester = (value: string) => {
            if (
              value !== 'all' &&
              !db()
                .prepare('SELECT id FROM semesters WHERE id=? AND academic_year_id=?')
                .get(value, activeYear.id)
            )
              throw new HttpError(400, 'Semester penugasan tidak berada pada tahun ajaran aktif.');
          };
          for (const assignment of input.teaching_assignments) {
            requireSemester(assignment.semester_id);
            if (
              !db()
                .prepare('SELECT id FROM teachers WHERE id=? AND school_id=? AND is_active=1')
                .get(assignment.teacher_id, schoolId)
            )
              throw new HttpError(400, 'Guru penugasan tidak aktif atau tidak valid.');
            if (
              !db()
                .prepare('SELECT id FROM subjects WHERE id=? AND school_id=? AND is_active=1')
                .get(assignment.subject_id, schoolId)
            )
              throw new HttpError(400, 'Mata pelajaran penugasan tidak aktif atau tidak valid.');
            if (
              !db()
                .prepare(
                  'SELECT id FROM classes WHERE id=? AND school_id=? AND academic_year_id=? AND is_active=1',
                )
                .get(assignment.class_id, schoolId, activeYear.id)
            )
              throw new HttpError(400, 'Rombel penugasan tidak aktif atau tidak valid.');
            const periodId = semesterId(assignment.semester_id);
            const existing = assignment.id
              ? db()
                  .prepare(
                    `SELECT ta.id FROM teaching_assignments ta
                     JOIN teachers t ON t.id=ta.teacher_id
                     WHERE ta.id=? AND t.school_id=? AND ta.academic_year_id=?`,
                  )
                  .get(assignment.id, schoolId, activeYear.id)
              : db()
                  .prepare(
                    `SELECT id FROM teaching_assignments
                     WHERE teacher_id=? AND subject_id=? AND class_id=? AND academic_year_id=?
                       AND semester_id IS ?`,
                  )
                  .get(
                    assignment.teacher_id,
                    assignment.subject_id,
                    assignment.class_id,
                    activeYear.id,
                    periodId,
                  );
            if (assignment.id && !existing)
              throw new HttpError(404, 'Penugasan mata pelajaran tidak ditemukan.');
            if (existing)
              db()
                .prepare(
                  `UPDATE teaching_assignments SET teacher_id=?,subject_id=?,class_id=?,
                          semester_id=?,updated_at=datetime('now') WHERE id=?`,
                )
                .run(
                  assignment.teacher_id,
                  assignment.subject_id,
                  assignment.class_id,
                  periodId,
                  (existing as { id: string }).id,
                );
            else
              db()
                .prepare(
                  `INSERT INTO teaching_assignments
                   (id,teacher_id,subject_id,class_id,academic_year_id,semester_id)
                   VALUES(?,?,?,?,?,?)`,
                )
                .run(
                  randomUUID(),
                  assignment.teacher_id,
                  assignment.subject_id,
                  assignment.class_id,
                  activeYear.id,
                  periodId,
                );
          }
          for (const assignment of input.homeroom_assignments) {
            if (
              !db()
                .prepare('SELECT id FROM teachers WHERE id=? AND school_id=? AND is_active=1')
                .get(assignment.teacher_id, schoolId)
            )
              throw new HttpError(400, 'Wali kelas tidak aktif atau tidak valid.');
            if (
              !db()
                .prepare(
                  'SELECT id FROM classes WHERE id=? AND school_id=? AND academic_year_id=? AND is_active=1',
                )
                .get(assignment.class_id, schoolId, activeYear.id)
            )
              throw new HttpError(400, 'Rombel wali kelas tidak aktif atau tidak valid.');
            const existing = assignment.id
              ? db()
                  .prepare(
                    `SELECT ha.id FROM homeroom_assignments ha
                     JOIN teachers t ON t.id=ha.teacher_id
                     WHERE ha.id=? AND t.school_id=? AND ha.academic_year_id=?`,
                  )
                  .get(assignment.id, schoolId, activeYear.id)
              : db()
                  .prepare(
                    'SELECT id FROM homeroom_assignments WHERE class_id=? AND academic_year_id=?',
                  )
                  .get(assignment.class_id, activeYear.id);
            if (assignment.id && !existing)
              throw new HttpError(404, 'Penugasan wali kelas tidak ditemukan.');
            const id = (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE homeroom_assignments SET teacher_id=?,class_id=?,
                          updated_at=datetime('now') WHERE id=?`,
                )
                .run(assignment.teacher_id, assignment.class_id, id);
            else
              db()
                .prepare(
                  `INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id)
                   VALUES(?,?,?,?)`,
                )
                .run(id, assignment.teacher_id, assignment.class_id, activeYear.id);
          }
          for (const assignment of input.extracurricular_assignments) {
            requireSemester(assignment.semester_id);
            if (
              !db()
                .prepare('SELECT id FROM teachers WHERE id=? AND school_id=? AND is_active=1')
                .get(assignment.teacher_id, schoolId)
            )
              throw new HttpError(400, 'Pembina tidak aktif atau tidak valid.');
            const extracurricular = db()
              .prepare(
                'SELECT id,is_required FROM extracurriculars WHERE id=? AND school_id=? AND is_active=1',
              )
              .get(assignment.extracurricular_id, schoolId) as
              { id: string; is_required: number } | undefined;
            if (!extracurricular)
              throw new HttpError(400, 'Ekstrakurikuler penugasan tidak aktif atau tidak valid.');
            const activeStudentIds = (
              db()
                .prepare(
                  `SELECT s.id FROM students s
                   JOIN class_memberships cm ON cm.student_id=s.id
                   WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
                     AND cm.status='active' ORDER BY s.name`,
                )
                .all(schoolId, activeYear.id) as Array<{ id: string }>
            ).map((student) => student.id);
            const participantIds = extracurricular.is_required
              ? activeStudentIds
              : assignment.student_ids;
            const activeStudentIdSet = new Set(activeStudentIds);
            for (const studentId of participantIds)
              if (!activeStudentIdSet.has(studentId))
                throw new HttpError(
                  400,
                  'Semua peserta harus merupakan murid aktif pada tahun ajaran berjalan.',
                );
            if (assignment.quota > 0 && participantIds.length > assignment.quota)
              throw new HttpError(400, 'Jumlah peserta ekstrakurikuler melebihi kuota.');
            const periodId = semesterId(assignment.semester_id);
            const existing = assignment.id
              ? db()
                  .prepare(
                    `SELECT ea.id FROM extracurricular_assignments ea
                     JOIN extracurriculars e ON e.id=ea.extracurricular_id
                     WHERE ea.id=? AND e.school_id=? AND ea.academic_year_id=?`,
                  )
                  .get(assignment.id, schoolId, activeYear.id)
              : db()
                  .prepare(
                    `SELECT id FROM extracurricular_assignments
                     WHERE extracurricular_id=? AND academic_year_id=? AND semester_id IS ?
                       AND status<>'completed'`,
                  )
                  .get(assignment.extracurricular_id, activeYear.id, periodId);
            if (assignment.id && !existing)
              throw new HttpError(404, 'Penugasan ekstrakurikuler tidak ditemukan.');
            const id = (existing as { id: string } | undefined)?.id || randomUUID();
            if (existing)
              db()
                .prepare(
                  `UPDATE extracurricular_assignments SET extracurricular_id=?,teacher_id=?,
                          semester_id=?,location=?,quota=?,status=?,updated_at=datetime('now')
                          WHERE id=?`,
                )
                .run(
                  assignment.extracurricular_id,
                  assignment.teacher_id,
                  periodId,
                  assignment.location,
                  assignment.quota,
                  assignment.status,
                  id,
                );
            else
              db()
                .prepare(
                  `INSERT INTO extracurricular_assignments
                   (id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,map_url,quota,status)
                   VALUES(?,?,?,?,?,?,?,?,?)`,
                )
                .run(
                  id,
                  assignment.extracurricular_id,
                  assignment.teacher_id,
                  activeYear.id,
                  periodId,
                  assignment.location,
                  '',
                  assignment.quota,
                  assignment.status,
                );
            db().prepare('DELETE FROM extracurricular_participants WHERE assignment_id=?').run(id);
            const insertParticipant = db().prepare(
              'INSERT INTO extracurricular_participants(id,assignment_id,student_id) VALUES(?,?,?)',
            );
            for (const studentId of participantIds)
              insertParticipant.run(randomUUID(), id, studentId);
          }
        } else {
          const current = onboardingState();
          if (!Object.values(current.readiness).every(Boolean))
            throw new HttpError(
              409,
              'Lengkapi seluruh checklist kesiapan sebelum menutup onboarding.',
            );
          db()
            .prepare(
              "UPDATE schools SET onboarding_completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
            )
            .run(schoolId);
        }
      }
      audit(actor.email, 'update', 'onboarding', schoolId || undefined, { action: input.action });
    })();
    return Response.json({ ok: true, ...onboardingState() });
  } catch (error) {
    return failure(error);
  }
}
