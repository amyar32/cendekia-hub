import { z } from 'zod';
import { schoolLocalDate } from '@/lib/server/academic-context';
import { db } from '@/lib/db';
import { isoWeekday } from '@/lib/dates';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { createTahfidzSessionSchema, openTahfidzSession } from '@/features/tahfidz/server/mobile';
export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.read' });
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(new URL(request.url).searchParams.get('date') || schoolLocalDate(actor.school_id));
    const sessions = db()
      .prepare(
        `SELECT tg.id schedule_id,tg.id group_id,tg.name group_name,tg.location,slot.name slot_name,slot.start_time,slot.end_time,ts.id session_id,ts.status session_status,CASE WHEN ts.id IS NULL THEN (SELECT count(*) FROM tahfidz_group_members gm JOIN students s ON s.id=gm.student_id AND s.is_active=1 JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=tg.academic_year_id AND cm.status='active' WHERE gm.group_id=tg.id) ELSE (SELECT count(*) FROM tahfidz_session_records tr WHERE tr.session_id=ts.id) END student_count,COALESCE((SELECT count(*) FROM tahfidz_session_records tr WHERE tr.session_id=ts.id AND tr.status='present'),0) present_count FROM tahfidz_groups tg JOIN schedule_time_slots slot ON slot.id=tg.time_slot_id LEFT JOIN semesters sem ON sem.id=tg.semester_id LEFT JOIN tahfidz_sessions ts ON ts.group_id=tg.id AND ts.attendance_date=? WHERE tg.school_id=? AND tg.teacher_id=? AND tg.status='active' AND EXISTS(SELECT 1 FROM json_each(tg.weekdays) WHERE value=?) AND (tg.semester_id IS NULL OR (sem.start_date<=? AND sem.end_date>=?)) ORDER BY slot.start_time,tg.name`,
      )
      .all(date, actor.school_id, actor.teacher_id, isoWeekday(date), date, date);
    return mobileData({ date, sessions });
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.write' });
    return mobileData(
      openTahfidzSession(actor, createTahfidzSessionSchema.parse(await request.json())),
      { status: 201 },
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
