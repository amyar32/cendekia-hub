import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
export function verifyPassword(value: string, encoded: string) {
  const [salt, key] = encoded.split(':');
  if (!salt || !key) return false;
  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
