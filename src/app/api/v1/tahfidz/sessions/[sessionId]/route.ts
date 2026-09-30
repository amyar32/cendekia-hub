import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { requireTahfidzSession } from '@/features/tahfidz/server/mobile';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.read' });
    const { sessionId } = await params;
    requireTahfidzSession(actor, sessionId);
    const session = db()
      .prepare(
        'SELECT id,group_id,attendance_date,status,group_name,teacher_name,starts_at,closed_at FROM tahfidz_sessions WHERE id=?',
      )
      .get(sessionId);
    const records = db()
      .prepare(
        'SELECT id,student_id,student_nis,student_name,class_name,status,activity_type,surah_number,ayah_from,ayah_to,result,note FROM tahfidz_session_records WHERE session_id=? ORDER BY class_name,student_name',
      )
      .all(sessionId);
    return mobileData({ session, records });
  } catch (error) {
    return mobileFailure(error);
  }
}
