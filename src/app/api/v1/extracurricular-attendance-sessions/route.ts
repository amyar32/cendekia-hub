import { z } from 'zod';
import { schoolLocalDate } from '@/app/api/modules/_shared/academic-context';
import {
  extracurricularAttendanceDateSchema,
  extracurricularWeekday,
  openTeacherExtracurricularAttendance,
} from '@/app/api/v1/_shared/extracurricular-attendance';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const createSchema = z.object({
  schedule_id: z.string().uuid('Jadwal ekstrakurikuler tidak valid.'),
  attendance_date: extracurricularAttendanceDateSchema,
});

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.read',
    });
    const url = new URL(request.url);
    const date = extracurricularAttendanceDateSchema.parse(
      url.searchParams.get('date') || schoolLocalDate(actor.school_id),
    );
    const sessions = db()
      .prepare(
        `SELECT es.id AS schedule_id,ea.id AS assignment_id,e.id AS extracurricular_id,
          e.code AS extracurricular_code,e.name AS extracurricular_name,ea.location,ea.map_url,
          sts.name AS slot_name,sts.start_time,sts.end_time,
          ats.id AS session_id,ats.status AS session_status,ats.starts_at,ats.closed_at,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id),0) AS student_count,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='late'),0) AS late_count,
          COALESCE((SELECT COUNT(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id AND ar.status IN ('sick','excused','absent')),0) AS absent_count
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
      .all(date, actor.teacher_id, actor.school_id, extracurricularWeekday(date), date, date);
    return mobileData({ date, sessions });
  } catch (error) {
    return mobileFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.write',
    });
    const input = createSchema.parse(await request.json());
    const result = openTeacherExtracurricularAttendance(actor, input);
    return mobileData(
      { id: result.id, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
