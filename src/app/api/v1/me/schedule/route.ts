import { schoolLocalDate } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { isoDateSchema } from '@/lib/validation';

const dateSchema = isoDateSchema();

function weekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const url = new URL(request.url);
    const date = dateSchema.parse(url.searchParams.get('date') || schoolLocalDate(actor.school_id));
    const lessonRows = db()
      .prepare(
        `SELECT cs.id AS schedule_id,ta.id AS teaching_assignment_id,ta.class_id,c.name AS class_name,
          s.id AS subject_id,s.code AS subject_code,s.name AS subject_name,
          sts.id AS time_slot_id,sts.name AS slot_name,sts.start_time,sts.end_time,
          ats.id AS attendance_session_id,ats.status AS attendance_status,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id),0) AS student_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count
         FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         JOIN classes c ON c.id=ta.class_id JOIN subjects s ON s.id=ta.subject_id
         JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
         JOIN semesters sem ON sem.id=cs.semester_id JOIN academic_years ay ON ay.id=sem.academic_year_id
         LEFT JOIN student_attendance_sessions ats ON ats.class_schedule_id=cs.id AND ats.attendance_date=?
         WHERE ta.teacher_id=? AND c.school_id=? AND ay.is_active=1 AND cs.archived_at IS NULL
           AND cs.weekday=? AND sem.start_date<=? AND sem.end_date>=?
         ORDER BY sts.start_time,c.name,s.name`,
      )
      .all(date, actor.teacher_id, actor.school_id, weekday(date), date, date) as Array<
      Record<string, unknown> & { class_id: string; start_time: string }
    >;
    const lessons = lessonRows.map((row) => {
      const block = regularScheduleBlock(actor.school_id, row.class_id, date);
      return {
        ...row,
        type: 'lesson' as const,
        attendance_blocked_reason: block
          ? `KBM ditangguhkan oleh periode ujian ${block.name}.`
          : null,
      };
    });
    const extracurriculars = db()
      .prepare(
        `SELECT es.id AS schedule_id,ea.id AS assignment_id,e.id AS extracurricular_id,
          e.code AS extracurricular_code,e.name AS extracurricular_name,ea.location,ea.map_url,
          sts.id AS time_slot_id,sts.name AS slot_name,sts.start_time,sts.end_time,
          ats.id AS attendance_session_id,ats.status AS attendance_status,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id),0) AS student_count,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count
         FROM extracurricular_schedules es
         JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
         JOIN extracurriculars e ON e.id=ea.extracurricular_id
         JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
         JOIN semesters sem ON sem.id=es.semester_id
         JOIN academic_years ay ON ay.id=sem.academic_year_id
         LEFT JOIN extracurricular_attendance_sessions ats ON ats.extracurricular_schedule_id=es.id AND ats.attendance_date=?
         WHERE ea.teacher_id=? AND e.school_id=? AND ay.is_active=1 AND ea.status='active'
           AND es.weekday=? AND sem.start_date<=? AND sem.end_date>=?
         ORDER BY sts.start_time,e.name`,
      )
      .all(date, actor.teacher_id, actor.school_id, weekday(date), date, date) as Array<
      Record<string, unknown> & { start_time: string }
    >;
    const schedules = [
      ...lessons,
      ...extracurriculars.map((row) => ({ ...row, type: 'extracurricular' as const })),
    ].sort((first, second) => String(first.start_time).localeCompare(String(second.start_time)));
    return mobileData({ date, schedules });
  } catch (error) {
    return mobileFailure(error);
  }
}
