import { activeAcademicYear } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.read' });
    const year = activeAcademicYear(actor.school_id);
    const assignments = db()
      .prepare(
        `SELECT ta.id AS assignment_id,s.id AS subject_id,s.code,s.name,s.category,s.description,
          ta.class_id,c.name AS class_name,g.name AS grade_name,
          ta.semester_id,COALESCE(sem.name,'Semua Semester') AS semester_name,
          (SELECT COUNT(DISTINCT cm.student_id) FROM class_memberships cm
           JOIN students st ON st.id=cm.student_id
           WHERE cm.class_id=ta.class_id AND cm.academic_year_id=ta.academic_year_id
             AND cm.status='active' AND st.is_active=1) AS student_count
         FROM teaching_assignments ta
         JOIN subjects s ON s.id=ta.subject_id
         JOIN classes c ON c.id=ta.class_id
         JOIN grades g ON g.id=c.grade_id
         LEFT JOIN semesters sem ON sem.id=ta.semester_id
         WHERE ta.teacher_id=? AND s.school_id=? AND c.school_id=?
           AND ta.academic_year_id=? AND c.academic_year_id=ta.academic_year_id
           AND s.is_active=1 AND c.is_active=1
         ORDER BY s.name,g.level_order,c.name,sem.start_date`,
      )
      .all(actor.teacher_id, actor.school_id, actor.school_id, year.id) as Array<
      Record<string, unknown> & { assignment_id: string }
    >;
    const scheduleQuery = db().prepare(
      `SELECT cs.id AS schedule_id,cs.semester_id,sem.name AS semester_name,cs.weekday,
        sts.id AS time_slot_id,sts.name AS slot_name,sts.start_time,sts.end_time
       FROM class_schedules cs JOIN semesters sem ON sem.id=cs.semester_id
       JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
       WHERE cs.teaching_assignment_id=? AND cs.archived_at IS NULL
         AND sem.academic_year_id=?
       ORDER BY cs.weekday,sts.start_time`,
    );
    return mobileData({
      academic_year: year,
      subjects: assignments.map((assignment) => ({
        ...assignment,
        schedules: scheduleQuery.all(assignment.assignment_id, year.id),
      })),
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
