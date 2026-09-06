import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { can } from '../src/config/modules';
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
});
