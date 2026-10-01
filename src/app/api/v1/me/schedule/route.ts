import { schoolLocalDate } from '@/lib/server/academic-context';
import { db } from '@/lib/db';
import { isoWeekday } from '@/lib/dates';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { isoDateSchema } from '@/lib/validation';

const dateSchema = isoDateSchema();

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
      .all(date, actor.teacher_id, actor.school_id, isoWeekday(date), date, date) as Array<
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
      .all(date, actor.teacher_id, actor.school_id, isoWeekday(date), date, date) as Array<
      Record<string, unknown> & { start_time: string }
    >;
    const tahfidz = db()
      .prepare(
        `SELECT tg.id AS schedule_id,tg.id AS group_id,tg.name AS group_name,tg.location,
          sts.name AS slot_name,sts.start_time,sts.end_time,
          ts.id AS attendance_session_id,ts.status AS attendance_status,
          CASE WHEN ts.id IS NULL THEN
            (SELECT COUNT(*) FROM tahfidz_group_members gm
             JOIN students s ON s.id=gm.student_id AND s.is_active=1
             JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=tg.academic_year_id AND cm.status='active'
             WHERE gm.group_id=tg.id)
          ELSE (SELECT COUNT(*) FROM tahfidz_session_records tr WHERE tr.session_id=ts.id) END AS student_count,
          COALESCE((SELECT COUNT(*) FROM tahfidz_session_records tr WHERE tr.session_id=ts.id AND tr.status='present'),0) AS present_count
         FROM tahfidz_groups tg
         JOIN schedule_time_slots sts ON sts.id=tg.time_slot_id
         JOIN academic_years ay ON ay.id=tg.academic_year_id
         LEFT JOIN semesters sem ON sem.id=tg.semester_id
         LEFT JOIN tahfidz_sessions ts ON ts.group_id=tg.id AND ts.attendance_date=?
         WHERE tg.teacher_id=? AND tg.school_id=? AND ay.is_active=1 AND tg.status='active'
           AND EXISTS(SELECT 1 FROM json_each(tg.weekdays) WHERE value=?)
           AND (tg.semester_id IS NULL OR (sem.start_date<=? AND sem.end_date>=?))
         ORDER BY sts.start_time,tg.name`,
      )
      .all(date, actor.teacher_id, actor.school_id, isoWeekday(date), date, date) as Array<
      Record<string, unknown> & { start_time: string }
    >;
    const schedules = [
      ...lessons,
      ...extracurriculars.map((row) => ({ ...row, type: 'extracurricular' as const })),
      ...tahfidz.map((row) => ({ ...row, type: 'tahfidz' as const })),
    ].sort((first, second) => String(first.start_time).localeCompare(String(second.start_time)));
    return mobileData({ date, schedules });
  } catch (error) {
    return mobileFailure(error);
  }
}
