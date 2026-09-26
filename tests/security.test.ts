import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { can } from '../src/config/modules';
import { isoDateSchema } from '../src/lib/validation';
test('password hashing uses unique salts and rejects incorrect passwords', () => {
  const first = hashPassword('correct horse battery staple');
  assert.notEqual(first, hashPassword('correct horse battery staple'));
  assert.equal(verifyPassword('correct horse battery staple', first), true);
  assert.equal(verifyPassword('wrong', first), false);
  assert.equal(verifyPassword('wrong', 'malformed'), false);
});
test('RBAC denies absent permissions and does not infer write from read', () => {
  assert.equal(can(['subjects.read'], 'subjects.read'), true);
  assert.equal(can(['subjects.read'], 'subjects.write'), false);
  assert.equal(can([], 'users.read'), false);
  assert.equal(can(['school.read'], 'school.read'), true);
  assert.equal(can(['school.read'], 'school.write'), false);
  assert.equal(can(['academic-years.read'], 'academic-years.read'), true);
  assert.equal(can(['academic-years.read'], 'academic-years.write'), false);
  assert.equal(can(['exam-schedules.read'], 'exam-schedules.read'), true);
  assert.equal(can(['exam-schedules.read'], 'exam-schedules.write'), false);
  assert.equal(can(['exam-schedules.write'], 'exam-schedules.publish'), false);
});

test('ISO date validation rejects calendar dates that do not exist', () => {
  const schema = isoDateSchema();
  assert.equal(schema.safeParse('2028-02-29').success, true);
  assert.equal(schema.safeParse('2026-02-29').success, false);
  assert.equal(schema.safeParse('2026-02-31').success, false);
  assert.equal(schema.safeParse('2026-13-01').success, false);
});
