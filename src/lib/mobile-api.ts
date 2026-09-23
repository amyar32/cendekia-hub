import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { can } from '@/config/modules';
import { db } from '@/lib/db';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export class MobileApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type MobileTeacherActor = {
  session_id: string;
  user_id: string;
  email: string;
  permissions: string[];
  must_change_password: boolean;
  teacher_id: string;
  teacher_name: string;
  school_id: string;
  school_name: string;
  timezone: string;
  device_id: string;
  device_name: string;
};

type MobileSessionRow = MobileTeacherActor & {
  permissions_json: string;
  user_active: number;
  teacher_active: number;
  school_active: number;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new MobileApiError(401, 'AUTHENTICATION_REQUIRED', 'Token akses diperlukan.');
  return match[1];
}

export function mobileData(data: unknown, init?: ResponseInit, meta: Record<string, unknown> = {}) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  return Response.json({ data, meta }, { ...init, headers });
}

export function mobileFailure(error: unknown) {
  if (error instanceof MobileApiError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!fields[key]) fields[key] = issue.message;
    }
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message || 'Data tidak valid.',
          fields,
        },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof SyntaxError)
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Format JSON tidak valid.' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  if (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('SQLITE_CONSTRAINT')
  )
    return Response.json(
      { error: { code: 'CONFLICT', message: 'Data sudah ada atau sedang digunakan.' } },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  console.error(error);
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server.' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createMobileSession(userId: string, device: { id?: string; name?: string } = {}) {
  const now = Date.now();
  const accessToken = newToken();
  const refreshToken = newToken();
  const id = randomUUID();
  const deviceId = (device.id || '').trim();
  const deviceName = (device.name || '').trim();
  db().transaction(() => {
    db()
      .prepare(
        "UPDATE mobile_sessions SET revoked_at=? WHERE user_id=? AND device_id=? AND device_id<>'' AND revoked_at IS NULL",
      )
      .run(now, userId, deviceId);
    db()
      .prepare(
        `INSERT INTO mobile_sessions(id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,device_id,device_name)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        userId,
        tokenHash(accessToken),
        tokenHash(refreshToken),
        now + ACCESS_TOKEN_TTL_MS,
        now + REFRESH_TOKEN_TTL_MS,
        deviceId,
        deviceName,
      );
  })();
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer' as const,
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
  };
}

export function rotateMobileSession(refreshToken: string) {
  const now = Date.now();
  const session = db()
    .prepare(
      `SELECT ms.id,ms.user_id,ms.device_id,ms.device_name
       FROM mobile_sessions ms JOIN users u ON u.id=ms.user_id
       JOIN teachers t ON t.user_id=u.id
       JOIN schools s ON s.id=t.school_id
       WHERE ms.refresh_token_hash=? AND ms.revoked_at IS NULL AND ms.refresh_expires_at>?
         AND u.active=1 AND t.is_active=1 AND s.is_active=1`,
    )
    .get(tokenHash(refreshToken), now) as
    { id: string; user_id: string; device_id: string; device_name: string } | undefined;
  if (!session)
    throw new MobileApiError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Refresh token tidak valid atau kedaluwarsa.',
    );
  const accessToken = newToken();
  const nextRefreshToken = newToken();
  const result = db()
    .prepare(
      `UPDATE mobile_sessions SET access_token_hash=?,refresh_token_hash=?,access_expires_at=?,
       refresh_expires_at=?,last_used_at=datetime('now')
       WHERE id=? AND refresh_token_hash=? AND revoked_at IS NULL`,
    )
    .run(
      tokenHash(accessToken),
      tokenHash(nextRefreshToken),
      now + ACCESS_TOKEN_TTL_MS,
      now + REFRESH_TOKEN_TTL_MS,
      session.id,
      tokenHash(refreshToken),
    );
  if (result.changes !== 1)
    throw new MobileApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token sudah digunakan.');
  return {
    access_token: accessToken,
    refresh_token: nextRefreshToken,
    token_type: 'Bearer' as const,
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
  };
}

export function requireMobileTeacher(
  request: Request,
  options: { permission?: string; allowPasswordChange?: boolean } = {},
) {
  const token = bearerToken(request);
  const row = db()
    .prepare(
      `SELECT ms.id AS session_id,ms.user_id,ms.device_id,ms.device_name,
        u.email,u.must_change_password,u.active AS user_active,r.permissions AS permissions_json,
        t.id AS teacher_id,t.name AS teacher_name,t.school_id,t.is_active AS teacher_active,
        s.name AS school_name,s.timezone,s.is_active AS school_active
       FROM mobile_sessions ms JOIN users u ON u.id=ms.user_id JOIN roles r ON r.id=u.role_id
       JOIN teachers t ON t.user_id=u.id JOIN schools s ON s.id=t.school_id
       WHERE ms.access_token_hash=? AND ms.revoked_at IS NULL AND ms.access_expires_at>?`,
    )
    .get(tokenHash(token), Date.now()) as MobileSessionRow | undefined;
  if (!row || !row.user_active || !row.teacher_active || !row.school_active)
    throw new MobileApiError(
      401,
      'INVALID_ACCESS_TOKEN',
      'Token akses tidak valid atau kedaluwarsa.',
    );
  const permissions = JSON.parse(row.permissions_json) as string[];
  if (row.must_change_password && !options.allowPasswordChange)
    throw new MobileApiError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Ganti kata sandi sementara sebelum melanjutkan.',
    );
  if (options.permission && !can(permissions, options.permission))
    throw new MobileApiError(403, 'FORBIDDEN', 'Anda tidak memiliki izin untuk tindakan ini.');
  db()
    .prepare("UPDATE mobile_sessions SET last_used_at=datetime('now') WHERE id=?")
    .run(row.session_id);
  return {
    session_id: row.session_id,
    user_id: row.user_id,
    email: row.email,
    permissions,
    must_change_password: Boolean(row.must_change_password),
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    school_id: row.school_id,
    school_name: row.school_name,
    timezone: row.timezone,
    device_id: row.device_id,
    device_name: row.device_name,
  } satisfies MobileTeacherActor;
}

export function revokeMobileSession(sessionId: string) {
  db()
    .prepare('UPDATE mobile_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
    .run(Date.now(), sessionId);
}

export function revokeAllMobileSessions(userId: string) {
  db()
    .prepare('UPDATE mobile_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
    .run(Date.now(), userId);
}
