import { z } from 'zod';
import { db, audit } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { checkOrigin, createSession, HttpError } from '@/lib/auth';
import { failure } from '@/lib/http';
export const runtime = 'nodejs';
const dummyPassword = hashPassword('dummy-password-for-timing');
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { email, password } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase().trim()),
        password: z.string().min(1).max(128),
      })
      .parse(await request.json());
    const attempt = db()
      .prepare('SELECT attempts,reset_at FROM login_attempts WHERE email=?')
      .get(email) as { attempts: number; reset_at: number } | undefined;
    if (attempt && attempt.reset_at > Date.now() && attempt.attempts >= 5)
      throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    const user = db()
      .prepare(
        'SELECT u.id,u.password,u.active,u.must_change_password,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=?',
      )
      .get(email) as
      | {
          id: string;
          password: string;
          active: number;
          must_change_password: number;
          permissions: string;
        }
      | undefined;
    const valid = verifyPassword(password, user?.password ?? dummyPassword);
    if (!user || !valid || !user.active) {
      db().transaction(() => {
        db()
          .prepare(
            'INSERT INTO login_attempts(email,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN reset_at>? THEN attempts+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE excluded.reset_at END',
          )
          .run(email, Date.now() + 900000, Date.now(), Date.now());
        audit(email, 'login.failed', 'auth');
      })();
      throw new HttpError(401, 'Email atau kata sandi salah.');
    }
    db().transaction(() => {
      db().prepare('DELETE FROM login_attempts WHERE email=?').run(email);
      audit(email, 'login', 'auth', user.id);
    })();
    await createSession(user.id);
    const permissions = JSON.parse(user.permissions) as string[];
    const scannerOnly =
      permissions.includes('student-checkins.write') && !permissions.includes('dashboard.read');
    return Response.json({
      ok: true,
      must_change_password: Boolean(user.must_change_password),
      redirect_to: scannerOnly ? '/student-checkins/scanner' : '/',
    });
  } catch (error) {
    return failure(error);
  }
}
