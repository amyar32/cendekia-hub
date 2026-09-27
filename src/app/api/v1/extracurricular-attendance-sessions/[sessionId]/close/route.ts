import { z } from 'zod';
import { requireTeacherExtracurricularSession } from '@/features/attendance/server/mobile/extracurricular-attendance';
import { audit, db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { localDateTime } from '@/lib/checkins';
import { notifyPrimaryGuardiansOfExtracurricularAttendance } from '@/lib/notifications/extracurricular-attendance';

const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.write',
    });
    const sessionId = idSchema.parse((await context.params).sessionId);
    const session = requireTeacherExtracurricularSession(actor, sessionId);
    const closedNow = session.status === 'open';
    if (closedNow) {
      db().transaction(() => {
        db()
          .prepare(
            "UPDATE extracurricular_attendance_sessions SET status='closed',closed_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
          )
          .run(sessionId);
        audit(actor.email, 'close', 'extracurricular_attendance_sessions', sessionId, {
          source: 'mobile',
        });
      })();
    }
    const notifications = closedNow
      ? await notifyPrimaryGuardiansOfExtracurricularAttendance({
          sessionId,
          schoolName: actor.school_name,
          extracurricularName: session.extracurricular_name,
          teacherName: actor.teacher_name,
          date: session.attendance_date,
          time: localDateTime(actor.timezone).time,
        })
      : undefined;
    return mobileData({
      ok: true,
      id: sessionId,
      status: 'closed',
      ...(notifications ? { notifications } : {}),
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
