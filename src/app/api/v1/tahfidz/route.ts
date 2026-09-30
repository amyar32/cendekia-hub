import { activeAcademicYear } from '@/lib/server/academic-context';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.read' });
    const year = activeAcademicYear(actor.school_id);
    const groups = db()
      .prepare(
        `SELECT tg.id group_id,tg.name,tg.location,tg.quota,tg.weekdays,COALESCE(sem.name,'Semua Semester') semester_name,slot.name slot_name,slot.start_time,slot.end_time,(SELECT count(*) FROM tahfidz_group_members gm WHERE gm.group_id=tg.id) participant_count FROM tahfidz_groups tg LEFT JOIN semesters sem ON sem.id=tg.semester_id JOIN schedule_time_slots slot ON slot.id=tg.time_slot_id WHERE tg.school_id=? AND tg.teacher_id=? AND tg.academic_year_id=? AND tg.status='active' ORDER BY tg.weekday,slot.start_time,tg.name`,
      )
      .all(actor.school_id, actor.teacher_id, year.id)
      .map((group: any) => ({ ...group, weekdays: JSON.parse(group.weekdays) }));
    return mobileData({ academic_year: year, groups });
  } catch (error) {
    return mobileFailure(error);
  }
}
