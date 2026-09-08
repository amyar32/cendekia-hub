import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { can } from '@/config/modules';
export const COOKIE = 'cms_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role: string;
  permissions: string[];
  must_change_password: boolean;
};
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id,u.name,u.email,u.role_id,u.must_change_password,r.name AS role,r.permissions FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id WHERE s.token=? AND s.expires_at>? AND u.active=1`,
    )
    .get(tokenHash(token), Date.now()) as
    (Omit<SessionUser, 'permissions'> & { permissions: string }) | undefined;
  return row
    ? {
        ...row,
        must_change_password: Boolean(row.must_change_password),
        permissions: JSON.parse(row.permissions),
      }
    : null;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser(permission?: string) {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Silakan masuk kembali.');
  if (permission && user.must_change_password)
    throw new HttpError(403, 'Ganti kata sandi sementara sebelum melanjutkan.');
  if (permission && !can(user.permissions, permission))
    throw new HttpError(403, 'Anda tidak memiliki izin untuk tindakan ini.');
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  db().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db()
    .prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)')
    .run(tokenHash(token), userId, Date.now() + 8 * 60 * 60 * 1000);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}
export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new HttpError(403, 'Origin tidak diizinkan.');
}
