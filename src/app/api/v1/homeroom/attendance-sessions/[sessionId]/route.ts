import { z } from 'zod';
import { requireActiveHomeroom } from '@/features/homeroom/server/mobile';
import { db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.read' });
    const homeroom = requireActiveHomeroom(actor);
    const sessionId = idSchema.parse((await context.params).sessionId);
    const session = db()
      .prepare(
        `SELECT sas.id,sas.class_schedule_id,sas.teaching_assignment_id,sas.class_id,
          sas.attendance_date,sas.status,sas.subject_name,sas.class_name,sas.teacher_name,
          sas.starts_at,sas.closed_at,sas.created_at,sas.updated_at
         FROM student_attendance_sessions sas
         JOIN classes c ON c.id=sas.class_id
         WHERE sas.id=? AND sas.school_id=? AND sas.class_id=? AND c.academic_year_id=?`,
      )
      .get(sessionId, actor.school_id, homeroom.class_id, homeroom.academic_year_id);
    if (!session)
      throw new MobileApiError(
        404,
        'HOMEROOM_ATTENDANCE_SESSION_NOT_FOUND',
        'Sesi absensi tidak ditemukan pada kelas wali Anda.',
      );
    const records = db()
      .prepare(
        `SELECT id,student_id,student_nis,student_name,status,note,source,recorded_at,updated_at
         FROM student_attendance_records WHERE session_id=? ORDER BY student_name`,
      )
      .all(sessionId);
    return mobileData({ homeroom, session, records });
  } catch (error) {
    return mobileFailure(error);
  }
}
