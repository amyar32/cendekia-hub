import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';

export function currentSchoolId() {
  const school = db()
    .prepare('SELECT id FROM schools ORDER BY is_active DESC, created_at LIMIT 1')
    .get() as { id: string } | undefined;
  if (!school) throw new HttpError(409, 'Lengkapi Pengaturan Sekolah terlebih dahulu.');
  return school.id;
}

export function academicYearOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name AS label FROM academic_years
       WHERE school_id = ? ORDER BY is_active DESC, start_date DESC`,
    )
    .all(schoolId) as { value: string; label: string }[];
}

export function gradeOptions(schoolId: string) {
  return db()
    .prepare(
      `SELECT id AS value, name || CASE WHEN is_active=0 THEN ' (nonaktif)' ELSE '' END AS label
       FROM grades WHERE school_id = ? ORDER BY is_active DESC, level_order, name`,
    )
    .all(schoolId) as { value: string; label: string }[];
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
