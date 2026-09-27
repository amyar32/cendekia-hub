import { db } from '@/lib/db';
import { MobileApiError, type MobileTeacherActor } from '@/lib/mobile-api';

export type ActiveHomeroom = {
  assignment_id: string;
  academic_year_id: string;
  academic_year_name: string;
  academic_year_start_date: string;
  academic_year_end_date: string;
  class_id: string;
  class_name: string;
  grade_name: string;
  student_count: number;
};

export function findActiveHomeroom(actor: MobileTeacherActor) {
  return db()
    .prepare(
      `SELECT ha.id AS assignment_id,ay.id AS academic_year_id,ay.name AS academic_year_name,
        ay.start_date AS academic_year_start_date,ay.end_date AS academic_year_end_date,
        c.id AS class_id,c.name AS class_name,g.name AS grade_name,
        COALESCE((SELECT COUNT(*) FROM class_memberships cm
          WHERE cm.class_id=c.id AND cm.academic_year_id=ay.id AND cm.status='active'),0) AS student_count
       FROM homeroom_assignments ha
       JOIN academic_years ay ON ay.id=ha.academic_year_id
       JOIN classes c ON c.id=ha.class_id
       JOIN grades g ON g.id=c.grade_id
       WHERE ha.teacher_id=? AND ay.school_id=? AND ay.is_active=1 AND c.is_active=1`,
    )
    .get(actor.teacher_id, actor.school_id) as ActiveHomeroom | undefined;
}

export function requireActiveHomeroom(actor: MobileTeacherActor) {
  const homeroom = findActiveHomeroom(actor);
  if (!homeroom)
    throw new MobileApiError(
      404,
      'HOMEROOM_NOT_ASSIGNED',
      'Anda tidak memiliki penugasan wali kelas pada tahun ajaran aktif.',
    );
  return homeroom;
}

export function requireHomeroomStudent(homeroom: ActiveHomeroom, studentId: string) {
  const student = db()
    .prepare(
      `SELECT s.id,s.photo_url,s.nis,s.nisn,s.name,s.gender,s.birth_date,s.birth_place,
        s.blood_type,s.religion,s.phone,s.email,s.has_special_needs,s.special_needs_type
       FROM class_memberships cm JOIN students s ON s.id=cm.student_id
       WHERE cm.class_id=? AND cm.academic_year_id=? AND cm.status='active'
         AND s.id=? AND s.is_active=1`,
    )
    .get(homeroom.class_id, homeroom.academic_year_id, studentId) as
    Record<string, unknown> | undefined;
  if (!student)
    throw new MobileApiError(
      404,
      'HOMEROOM_STUDENT_NOT_FOUND',
      'Murid tidak ditemukan pada kelas wali Anda.',
    );
  return student;
}
