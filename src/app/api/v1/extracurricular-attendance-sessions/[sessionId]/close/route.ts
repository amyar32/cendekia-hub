import { z } from 'zod';
import { requireTeacherExtracurricularSession } from '@/app/api/v1/_shared/extracurricular-attendance';
import { audit, db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, {
      permission: 'extracurricular-attendance.write',
    });
    const sessionId = idSchema.parse((await context.params).sessionId);
    const session = requireTeacherExtracurricularSession(actor, sessionId);
    if (session.status === 'open') {
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
    return mobileData({ ok: true, id: sessionId, status: 'closed' });
  } catch (error) {
    return mobileFailure(error);
  }
}
