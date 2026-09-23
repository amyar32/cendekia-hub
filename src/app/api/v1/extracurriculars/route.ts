import { activeAcademicYear } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.read',
    });
    const year = activeAcademicYear(actor.school_id);
    const assignments = db()
      .prepare(
        `SELECT ea.id AS assignment_id,e.id AS extracurricular_id,e.code,e.name,e.category,e.description,
          e.is_required,ea.semester_id,COALESCE(sem.name,'Semua Semester') AS semester_name,
          ea.location,ea.map_url,ea.quota,ea.status,
          COALESCE((SELECT COUNT(*) FROM extracurricular_participants ep WHERE ep.assignment_id=ea.id),0) AS participant_count
         FROM extracurricular_assignments ea
         JOIN extracurriculars e ON e.id=ea.extracurricular_id
         LEFT JOIN semesters sem ON sem.id=ea.semester_id
         WHERE ea.teacher_id=? AND e.school_id=? AND ea.academic_year_id=? AND ea.status='active'
         ORDER BY e.name`,
      )
      .all(actor.teacher_id, actor.school_id, year.id) as Array<
      Record<string, unknown> & { assignment_id: string }
    >;
    const scheduleQuery = db().prepare(
      `SELECT es.id AS schedule_id,es.semester_id,sem.name AS semester_name,es.weekday,
        sts.id AS time_slot_id,sts.name AS slot_name,sts.start_time,sts.end_time
       FROM extracurricular_schedules es JOIN semesters sem ON sem.id=es.semester_id
       JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
       WHERE es.assignment_id=? ORDER BY es.weekday,sts.start_time`,
    );
    return mobileData({
      academic_year: year,
      extracurriculars: assignments.map((assignment) => ({
        ...assignment,
        schedules: scheduleQuery.all(assignment.assignment_id),
      })),
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
