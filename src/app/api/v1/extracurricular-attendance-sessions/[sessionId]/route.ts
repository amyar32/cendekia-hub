import { z } from 'zod';
import { requireTeacherExtracurricularSession } from '@/app/api/v1/_shared/extracurricular-attendance';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.read',
    });
    const sessionId = idSchema.parse((await context.params).sessionId);
    requireTeacherExtracurricularSession(actor, sessionId);
    const session = db()
      .prepare(
        `SELECT id,extracurricular_schedule_id,assignment_id,extracurricular_id,attendance_date,
          status,extracurricular_name,teacher_name,starts_at,closed_at,created_at,updated_at
         FROM extracurricular_attendance_sessions WHERE id=?`,
      )
      .get(sessionId);
    const records = db()
      .prepare(
        `SELECT id,student_id,student_nis,student_name,class_name,status,note,source,updated_at
         FROM extracurricular_attendance_records WHERE session_id=? ORDER BY class_name,student_name`,
      )
      .all(sessionId);
    return mobileData({ session, records });
  } catch (error) {
    return mobileFailure(error);
  }
}
