import { z } from 'zod';
import { checkOrigin, requireUser, HttpError, createSession } from '@/lib/auth';
import { db, audit } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { failure } from '@/lib/http';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const input = z
      .object({
        currentPassword: z.string().min(1).max(128),
        password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128),
      })
      .parse(await request.json());
    const row = db().prepare('SELECT password FROM users WHERE id=?').get(user.id) as {
      password: string;
    };
    if (!verifyPassword(input.currentPassword, row.password))
      throw new HttpError(400, 'Kata sandi saat ini salah.');
    db().transaction(() => {
      db()
        .prepare('UPDATE users SET password=? WHERE id=?')
        .run(hashPassword(input.password), user.id);
      db().prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      audit(user.email, 'password.changed', 'auth', user.id);
    })();
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
