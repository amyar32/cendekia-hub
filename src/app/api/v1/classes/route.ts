import { activeAcademicYear } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const year = activeAcademicYear(actor.school_id);
    const classes = db()
      .prepare(
        `SELECT c.id,c.name,g.name AS grade_name,
          EXISTS(SELECT 1 FROM homeroom_assignments ha WHERE ha.class_id=c.id AND ha.teacher_id=? AND ha.academic_year_id=?) AS is_homeroom,
          COALESCE((SELECT COUNT(*) FROM class_memberships cm WHERE cm.class_id=c.id AND cm.academic_year_id=? AND cm.status='active'),0) AS student_count,
          COALESCE((SELECT replace(group_concat(DISTINCT s.name),',',', ') FROM teaching_assignments ta2 JOIN subjects s ON s.id=ta2.subject_id WHERE ta2.class_id=c.id AND ta2.teacher_id=? AND ta2.academic_year_id=?),'') AS subjects
         FROM classes c JOIN grades g ON g.id=c.grade_id
         WHERE c.school_id=? AND c.academic_year_id=? AND c.is_active=1 AND (
           EXISTS(SELECT 1 FROM teaching_assignments ta WHERE ta.class_id=c.id AND ta.teacher_id=? AND ta.academic_year_id=?)
           OR EXISTS(SELECT 1 FROM homeroom_assignments ha WHERE ha.class_id=c.id AND ha.teacher_id=? AND ha.academic_year_id=?)
         ) ORDER BY g.level_order,c.name`,
      )
      .all(
        actor.teacher_id,
        year.id,
        year.id,
        actor.teacher_id,
        year.id,
        actor.school_id,
        year.id,
        actor.teacher_id,
        year.id,
        actor.teacher_id,
        year.id,
      );
    return mobileData({ academic_year: year, classes });
  } catch (error) {
    return mobileFailure(error);
  }
}
