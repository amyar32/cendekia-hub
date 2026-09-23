import { z } from 'zod';
import { requireTeacherSession } from '@/app/api/v1/_shared/teacher-attendance';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.read' });
    const sessionId = idSchema.parse((await context.params).sessionId);
    requireTeacherSession(actor, sessionId);
    const session = db()
      .prepare(
        `SELECT id,class_schedule_id,teaching_assignment_id,class_id,attendance_date,status,
          subject_name,class_name,teacher_name,starts_at,closed_at,created_at,updated_at
         FROM student_attendance_sessions WHERE id=?`,
      )
      .get(sessionId);
    const records = db()
      .prepare(
        `SELECT id,student_id,student_nis,student_name,status,note,source,recorded_at,updated_at
         FROM student_attendance_records WHERE session_id=? ORDER BY student_name`,
      )
      .all(sessionId);
    return mobileData({ session, records });
  } catch (error) {
    return mobileFailure(error);
  }
}
