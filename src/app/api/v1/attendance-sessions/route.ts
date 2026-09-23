import { z } from 'zod';
import { schoolLocalDate } from '@/app/api/modules/_shared/academic-context';
import {
  attendanceDateSchema,
  openTeacherAttendance,
  weekday,
} from '@/app/api/v1/_shared/teacher-attendance';
import { db } from '@/lib/db';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const createSchema = z.object({
  schedule_id: z.string().uuid('Jadwal tidak valid.'),
  attendance_date: attendanceDateSchema,
});

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.read' });
    const url = new URL(request.url);
    const date = attendanceDateSchema.parse(
      url.searchParams.get('date') || schoolLocalDate(actor.school_id),
    );
    const rows = db()
      .prepare(
        `SELECT cs.id AS schedule_id,ta.id AS teaching_assignment_id,ta.class_id,
          c.name AS class_name,s.name AS subject_name,sts.name AS slot_name,sts.start_time,sts.end_time,
          ats.id AS session_id,ats.status AS session_status,ats.starts_at,ats.closed_at,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id),0) AS student_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='late'),0) AS late_count,
          COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status IN ('sick','excused','absent')),0) AS absent_count
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
      Record<string, unknown> & { class_id: string }
    >;
    const sessions = rows.map((row) => {
      const block = regularScheduleBlock(actor.school_id, row.class_id, date);
      return {
        ...row,
        blocked_reason: block ? `KBM ditangguhkan oleh periode ujian ${block.name}.` : null,
      };
    });
    return mobileData({ date, sessions });
  } catch (error) {
    return mobileFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.write' });
    const input = createSchema.parse(await request.json());
    const result = openTeacherAttendance(actor, input);
    return mobileData(
      { id: result.id, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
