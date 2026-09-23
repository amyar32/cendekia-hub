import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import {
  createMobileSession,
  MobileApiError,
  mobileData,
  mobileFailure,
  requireMobileTeacher,
  revokeAllMobileSessions,
} from '@/lib/mobile-api';

const schema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128),
});

export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { allowPasswordChange: true });
    const input = schema.parse(await request.json());
    const user = db().prepare('SELECT password FROM users WHERE id=?').get(actor.user_id) as {
      password: string;
    };
    if (!verifyPassword(input.current_password, user.password))
      throw new MobileApiError(400, 'INVALID_CURRENT_PASSWORD', 'Kata sandi saat ini salah.');
    db().transaction(() => {
      db()
        .prepare('UPDATE users SET password=?,must_change_password=0 WHERE id=?')
        .run(hashPassword(input.new_password), actor.user_id);
      db().prepare('DELETE FROM sessions WHERE user_id=?').run(actor.user_id);
      revokeAllMobileSessions(actor.user_id);
      audit(actor.email, 'password.changed', 'auth', actor.user_id, { source: 'mobile' });
    })();
    const tokens = createMobileSession(actor.user_id, {
      id: actor.device_id,
      name: actor.device_name,
    });
    return mobileData({ ok: true, ...tokens, must_change_password: false });
  } catch (error) {
    return mobileFailure(error);
  }
}
