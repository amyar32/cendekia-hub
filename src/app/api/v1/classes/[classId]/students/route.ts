import { z } from 'zod';
import { activeAcademicYear } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID rombel tidak valid.');

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireMobileTeacher(request);
    const classId = idSchema.parse((await context.params).classId);
    const year = activeAcademicYear(actor.school_id);
    const classroom = db()
      .prepare(
        `SELECT c.id,c.name,g.name AS grade_name FROM classes c JOIN grades g ON g.id=c.grade_id
         WHERE c.id=? AND c.school_id=? AND c.academic_year_id=? AND c.is_active=1 AND (
           EXISTS(SELECT 1 FROM teaching_assignments ta WHERE ta.class_id=c.id AND ta.teacher_id=? AND ta.academic_year_id=?)
           OR EXISTS(SELECT 1 FROM homeroom_assignments ha WHERE ha.class_id=c.id AND ha.teacher_id=? AND ha.academic_year_id=?)
         )`,
      )
      .get(classId, actor.school_id, year.id, actor.teacher_id, year.id, actor.teacher_id, year.id);
    if (!classroom)
      throw new MobileApiError(
        404,
        'CLASS_NOT_FOUND',
        'Rombel tidak ditemukan atau tidak Anda ampu.',
      );
    const students = db()
      .prepare(
        `SELECT s.id,s.photo_url,s.nis,s.nisn,s.name,s.gender
         FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         WHERE cm.class_id=? AND cm.academic_year_id=? AND cm.status='active' AND s.is_active=1
         ORDER BY s.name`,
      )
      .all(classId, year.id);
    return mobileData({ classroom, students });
  } catch (error) {
    return mobileFailure(error);
  }
}
