import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './auth';
import { db } from './db';

const globalAdmissions = globalThis as unknown as {
  admissionCaptchaSecret?: string;
};
const secret =
  process.env.ADMISSION_FORM_SECRET ||
  (globalAdmissions.admissionCaptchaSecret ||= randomBytes(32).toString('hex'));

export function createAdmissionCaptcha() {
  const left = 1 + Math.floor(Math.random() * 9);
  const right = 1 + Math.floor(Math.random() * 9);
  const payload = Buffer.from(
    JSON.stringify({ answer: left + right, expiresAt: Date.now() + 10 * 60_000 }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { question: `${left} + ${right} = ?`, token: `${payload}.${signature}` };
}

export function verifyAdmissionCaptcha(token: string, answer: number) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new HttpError(400, 'Captcha tidak valid.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    throw new HttpError(400, 'Captcha tidak valid.');
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new HttpError(400, 'Captcha tidak valid.');
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    answer: number;
    expiresAt: number;
  };
  if (value.expiresAt < Date.now())
    throw new HttpError(400, 'Captcha kedaluwarsa. Muat ulang formulir.');
  if (value.answer !== answer) throw new HttpError(400, 'Jawaban captcha salah.');
}

type AdmissionRateLimitScope = 'submission' | 'tracking' | 'upload';

const rateLimitPolicies: Record<AdmissionRateLimitScope, { maximum: number; windowMs: number }> = {
  submission: { maximum: 6, windowMs: 15 * 60_000 },
  tracking: { maximum: 30, windowMs: 15 * 60_000 },
  upload: { maximum: 24, windowMs: 15 * 60_000 },
};

export function admissionRateLimit(request: Request, scope: AdmissionRateLimitScope) {
  const trustProxy = process.env.ADMISSION_TRUST_PROXY_HEADERS === 'true';
  const forwarded = trustProxy
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined;
  const realIp = trustProxy ? request.headers.get('x-real-ip')?.trim() : undefined;
  const client =
    forwarded ||
    realIp ||
    `direct:${request.headers.get('user-agent') || 'unknown'}:${request.headers.get('accept-language') || ''}`;
  const key = `${scope}:${createHash('sha256').update(client).digest('hex')}`;
  const policy = rateLimitPolicies[scope];
  const now = Date.now();
  db().transaction(() => {
    db().prepare('DELETE FROM admission_rate_limits WHERE resets_at<=?').run(now);
    const current = db()
      .prepare('SELECT count,resets_at FROM admission_rate_limits WHERE key=?')
      .get(key) as { count: number; resets_at: number } | undefined;
    if (!current) {
      db()
        .prepare('INSERT INTO admission_rate_limits(key,count,resets_at) VALUES(?,1,?)')
        .run(key, now + policy.windowMs);
      return;
    }
    if (current.count >= policy.maximum)
      throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi nanti.');
    db().prepare('UPDATE admission_rate_limits SET count=count+1 WHERE key=?').run(key);
  })();
}
