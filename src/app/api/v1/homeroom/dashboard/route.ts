import { isoWeekday } from '@/lib/dates';
import { db } from '@/lib/db';
import { requireActiveHomeroom } from '@/features/homeroom/server/mobile';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { schoolLocalDate } from '@/lib/server/academic-context';
import { isoDateSchema } from '@/lib/validation';

type StudentDailyRow = Record<string, unknown> & {
  checkin_status: string | null;
  lesson_record_count: number;
  present_count: number;
  late_count: number;
  sick_count: number;
  excused_count: number;
  absent_count: number;
  open_follow_up_count: number;
};

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const url = new URL(request.url);
    const date = isoDateSchema('Tanggal tidak valid.').parse(
      url.searchParams.get('date') || schoolLocalDate(actor.school_id),
    );
    const schedules = db()
      .prepare(
        `SELECT cs.id AS schedule_id,s.name AS subject_name,t.name AS teacher_name,
          sts.name AS slot_name,sts.start_time,sts.end_time,
          ats.id AS session_id,ats.status AS session_status,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id),0) AS recorded_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='late'),0) AS late_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='sick'),0) AS sick_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='excused'),0) AS excused_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='absent'),0) AS absent_count
         FROM class_schedules cs
         JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         JOIN subjects s ON s.id=ta.subject_id JOIN teachers t ON t.id=ta.teacher_id
         JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
         JOIN semesters sem ON sem.id=cs.semester_id
         LEFT JOIN student_attendance_sessions ats ON ats.class_schedule_id=cs.id AND ats.attendance_date=?
         WHERE ta.class_id=? AND ta.academic_year_id=? AND cs.archived_at IS NULL
           AND cs.weekday=? AND sem.start_date<=? AND sem.end_date>=?
         ORDER BY sts.start_time,s.name`,
      )
      .all(
        date,
        homeroom.class_id,
        homeroom.academic_year_id,
        isoWeekday(date),
        date,
        date,
      ) as Array<
      Record<string, unknown> & { session_id: string | null; session_status: string | null }
    >;
    const students = db()
      .prepare(
        `SELECT s.id,s.photo_url,s.nis,s.nisn,s.name,s.gender,
          sci.status AS checkin_status,sci.checked_in_at,sci.note AS checkin_note,
          COUNT(ar.id) AS lesson_record_count,
          COALESCE(SUM(CASE WHEN ar.status='present' THEN 1 ELSE 0 END),0) AS present_count,
          COALESCE(SUM(CASE WHEN ar.status='late' THEN 1 ELSE 0 END),0) AS late_count,
          COALESCE(SUM(CASE WHEN ar.status='sick' THEN 1 ELSE 0 END),0) AS sick_count,
          COALESCE(SUM(CASE WHEN ar.status='excused' THEN 1 ELSE 0 END),0) AS excused_count,
          COALESCE(SUM(CASE WHEN ar.status='absent' THEN 1 ELSE 0 END),0) AS absent_count,
          COALESCE((SELECT COUNT(*) FROM homeroom_follow_ups hfu
            WHERE hfu.student_id=s.id AND hfu.class_id=? AND hfu.academic_year_id=? AND hfu.status='open'),0) AS open_follow_up_count
         FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         LEFT JOIN student_checkins sci ON sci.student_id=s.id AND sci.attendance_date=?
         LEFT JOIN student_attendance_sessions sas ON sas.class_id=cm.class_id AND sas.attendance_date=?
         LEFT JOIN student_attendance_records ar ON ar.session_id=sas.id AND ar.student_id=s.id
         WHERE cm.class_id=? AND cm.academic_year_id=? AND cm.status='active' AND s.is_active=1
         GROUP BY s.id,sci.id ORDER BY s.name`,
      )
      .all(
        homeroom.class_id,
        homeroom.academic_year_id,
        date,
        date,
        homeroom.class_id,
        homeroom.academic_year_id,
      ) as StudentDailyRow[];

    const attentionStudents = students.filter(
      (student) =>
        student.checkin_status !== 'present' ||
        student.late_count > 0 ||
        student.sick_count > 0 ||
        student.excused_count > 0 ||
        student.absent_count > 0 ||
        student.open_follow_up_count > 0,
    );
    const count = (predicate: (row: StudentDailyRow) => boolean) =>
      students.filter(predicate).length;
    return mobileData({
      date,
      homeroom,
      summary: {
        total_students: students.length,
        checked_in: count(
          (row) => row.checkin_status === 'present' || row.checkin_status === 'late',
        ),
        on_time: count((row) => row.checkin_status === 'present'),
        late: count((row) => row.checkin_status === 'late'),
        gateway_absent: count((row) => row.checkin_status === 'absent'),
        not_checked_in: count((row) => row.checkin_status === null),
        scheduled_lessons: schedules.length,
        recorded_lessons: schedules.filter((row) => row.session_id).length,
        open_lessons: schedules.filter((row) => row.session_status === 'open').length,
        closed_lessons: schedules.filter((row) => row.session_status === 'closed').length,
        unrecorded_lessons: schedules.filter((row) => !row.session_id).length,
        attention_students: attentionStudents.length,
      },
      schedules,
      attention_students: attentionStudents,
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
