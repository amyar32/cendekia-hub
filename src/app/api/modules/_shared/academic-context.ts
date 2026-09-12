import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';

export function currentSchoolId() {
  const school = db()
    .prepare('SELECT id FROM schools ORDER BY is_active DESC, created_at LIMIT 1')
    .get() as { id: string } | undefined;
  if (!school) throw new HttpError(409, 'Lengkapi Pengaturan Sekolah terlebih dahulu.');
  return school.id;
}

export function schoolLocalDate(schoolId: string) {
  const override = process.env.APP_CURRENT_DATE;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const school = db().prepare('SELECT timezone FROM schools WHERE id=?').get(schoolId) as
    { timezone: string } | undefined;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: school?.timezone || 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function academicYearOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name || CASE WHEN is_active=1 THEN ' (Aktif)' ELSE '' END AS label FROM academic_years
       WHERE school_id = ? ORDER BY start_date DESC, is_active DESC`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export type AcademicYearContext = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

export function activeAcademicYear(schoolId: string) {
  const year = db()
    .prepare(
      `SELECT id,name,start_date,end_date FROM academic_years
       WHERE school_id=? AND is_active=1`,
    )
    .get(schoolId) as AcademicYearContext | undefined;
  if (!year)
    throw new HttpError(409, 'Aktifkan satu tahun ajaran terlebih dahulu pada modul Tahun Ajaran.');
  return year;
}

export function activeAcademicYearOptions(schoolId: string) {
  const year = activeAcademicYear(schoolId);
  return [{ value: year.id, label: year.name }];
}

export function gradeOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name || CASE WHEN is_active=0 THEN ' (nonaktif)' ELSE '' END AS label
       FROM grades WHERE school_id = ? ORDER BY is_active DESC, level_order, name`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export function teacherOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name || ' — ' || employee_code || CASE WHEN is_active=0 THEN ' (nonaktif)' ELSE '' END AS label
       FROM teachers WHERE school_id = ? ORDER BY is_active DESC, name`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export function studentOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name || ' — ' || nis || CASE WHEN is_active=0 THEN ' (nonaktif)' ELSE '' END AS label
       FROM students WHERE school_id = ? ORDER BY is_active DESC, name`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export function subjectOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, code || ' — ' || name || CASE WHEN is_active=0 THEN ' (nonaktif)' ELSE '' END AS label
       FROM subjects WHERE school_id = ? ORDER BY is_active DESC, name`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export function classOptions(schoolId: string, academicYearId?: string) {
  return db()
    .prepare(
      `SELECT c.id AS value, c.name || ' — ' || ay.name AS label FROM classes c
       JOIN academic_years ay ON ay.id=c.academic_year_id
       WHERE c.school_id = ? AND (? IS NULL OR c.academic_year_id=?)
       ORDER BY ay.is_active DESC, ay.start_date DESC, c.name`,
    )
    .all(schoolId, academicYearId ?? null, academicYearId ?? null) as {
    value: string;
    label: string;
  }[];
}

export function semesterOptions(schoolId: string, academicYearId?: string) {
  return db()
    .prepare(
      `SELECT s.id AS value, s.name || ' — ' || ay.name AS label FROM semesters s
       JOIN academic_years ay ON ay.id=s.academic_year_id
       WHERE ay.school_id = ? AND (? IS NULL OR s.academic_year_id=?)
       ORDER BY ay.is_active DESC, ay.start_date DESC, s.period`,
    )
    .all(schoolId, academicYearId ?? null, academicYearId ?? null) as {
    value: string;
    label: string;
  }[];
}

export function requireTeacher(schoolId: string, teacherId: string) {
  if (!db().prepare('SELECT id FROM teachers WHERE id=? AND school_id=?').get(teacherId, schoolId))
    throw new HttpError(400, 'Guru tidak valid.');
}

export function requireStudent(schoolId: string, studentId: string) {
  if (!db().prepare('SELECT id FROM students WHERE id=? AND school_id=?').get(studentId, schoolId))
    throw new HttpError(400, 'Murid tidak valid.');
}

export function requireSubject(schoolId: string, subjectId: string) {
  if (!db().prepare('SELECT id FROM subjects WHERE id=? AND school_id=?').get(subjectId, schoolId))
    throw new HttpError(400, 'Mata pelajaran tidak valid.');
}

export function requireClass(schoolId: string, classId: string) {
  const classroom = db()
    .prepare('SELECT id,academic_year_id,grade_id FROM classes WHERE id=? AND school_id=?')
    .get(classId, schoolId) as
    { id: string; academic_year_id: string; grade_id: string } | undefined;
  if (!classroom) throw new HttpError(400, 'Rombel tidak valid.');
  return classroom;
}

export function requireSemester(schoolId: string, semesterId: string) {
  const semester = db()
    .prepare(
      `SELECT s.id,s.academic_year_id FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id
       WHERE s.id=? AND ay.school_id=?`,
    )
    .get(semesterId, schoolId) as { id: string; academic_year_id: string } | undefined;
  if (!semester) throw new HttpError(400, 'Semester tidak valid.');
  return semester;
}

export function requireAcademicYear(schoolId: string, academicYearId: string) {
  const year = db()
    .prepare('SELECT id, start_date, end_date FROM academic_years WHERE id = ? AND school_id = ?')
    .get(academicYearId, schoolId) as
    { id: string; start_date: string; end_date: string } | undefined;
  if (!year) throw new HttpError(400, 'Tahun ajaran tidak valid.');
  return year;
}

export function requireGrade(schoolId: string, gradeId: string) {
  if (!db().prepare('SELECT id FROM grades WHERE id = ? AND school_id = ?').get(gradeId, schoolId))
    throw new HttpError(400, 'Tingkat / kelas tidak valid.');
}
