import { z } from 'zod';
import { activeAcademicYear } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID penugasan ekstrakurikuler tidak valid.');

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.read',
    });
    const assignmentId = idSchema.parse((await context.params).assignmentId);
    const year = activeAcademicYear(actor.school_id);
    const assignment = db()
      .prepare(
        `SELECT ea.id AS assignment_id,e.id AS extracurricular_id,e.code,e.name,ea.location,ea.map_url
         FROM extracurricular_assignments ea JOIN extracurriculars e ON e.id=ea.extracurricular_id
         WHERE ea.id=? AND ea.teacher_id=? AND e.school_id=? AND ea.academic_year_id=? AND ea.status='active'`,
      )
      .get(assignmentId, actor.teacher_id, actor.school_id, year.id);
    if (!assignment)
      throw new MobileApiError(
        404,
        'EXTRACURRICULAR_NOT_FOUND',
        'Penugasan ekstrakurikuler tidak ditemukan atau bukan milik Anda.',
      );
    const participants = db()
      .prepare(
        `SELECT s.id,s.photo_url,s.nis,s.nisn,s.name,s.gender,c.id AS class_id,c.name AS class_name
         FROM extracurricular_participants ep JOIN students s ON s.id=ep.student_id
         JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=? AND cm.status='active'
         JOIN classes c ON c.id=cm.class_id
         WHERE ep.assignment_id=? AND s.is_active=1 ORDER BY c.name,s.name`,
      )
      .all(year.id, assignmentId);
    return mobileData({ assignment, participants });
  } catch (error) {
    return mobileFailure(error);
  }
}
