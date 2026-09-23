import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createMobileSession, MobileApiError, mobileData, mobileFailure } from '@/lib/mobile-api';

export const runtime = 'nodejs';

const dummyPassword = hashPassword('dummy-password-for-mobile-timing');
const schema = z.object({
  email: z
    .email('Email tidak valid.')
    .max(254)
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(128),
  device_id: z.string().trim().max(128).default(''),
  device_name: z.string().trim().max(100).default(''),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const attempt = db()
      .prepare('SELECT attempts,reset_at FROM login_attempts WHERE email=?')
      .get(input.email) as { attempts: number; reset_at: number } | undefined;
    if (attempt && attempt.reset_at > Date.now() && attempt.attempts >= 5)
      throw new MobileApiError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
      );
    const user = db()
      .prepare(
        `SELECT u.id,u.name,u.email,u.password,u.active,u.must_change_password,
          t.id AS teacher_id,t.name AS teacher_name,t.school_id,s.name AS school_name,s.timezone,
          t.is_active AS teacher_active,s.is_active AS school_active
         FROM users u LEFT JOIN teachers t ON t.user_id=u.id
         LEFT JOIN schools s ON s.id=t.school_id WHERE u.email=?`,
      )
      .get(input.email) as
      | {
          id: string;
          name: string;
          email: string;
          password: string;
          active: number;
          must_change_password: number;
          teacher_id: string | null;
          teacher_name: string | null;
          school_id: string | null;
          school_name: string | null;
          timezone: string | null;
          teacher_active: number | null;
          school_active: number | null;
        }
      | undefined;
    const valid = verifyPassword(input.password, user?.password ?? dummyPassword);
    if (!user || !valid || !user.active) {
      db().transaction(() => {
        db()
          .prepare(
            'INSERT INTO login_attempts(email,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN reset_at>? THEN attempts+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE excluded.reset_at END',
          )
          .run(input.email, Date.now() + 900000, Date.now(), Date.now());
        audit(input.email, 'mobile.login.failed', 'auth');
      })();
      throw new MobileApiError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');
    }
    if (!user.teacher_id || !user.teacher_active || !user.school_id || !user.school_active)
      throw new MobileApiError(
        403,
        'TEACHER_PROFILE_REQUIRED',
        'Akun belum ditautkan ke profil guru aktif pada sekolah aktif.',
      );
    db().transaction(() => {
      db().prepare('DELETE FROM login_attempts WHERE email=?').run(input.email);
      audit(user.email, 'mobile.login', 'auth', user.id, {
        device_id: input.device_id,
        device_name: input.device_name,
      });
    })();
    const tokens = createMobileSession(user.id, { id: input.device_id, name: input.device_name });
    return mobileData({
      ...tokens,
      must_change_password: Boolean(user.must_change_password),
      actor: {
        type: 'teacher',
        id: user.teacher_id,
        name: user.teacher_name,
        school_id: user.school_id,
        school_name: user.school_name,
        timezone: user.timezone,
      },
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
