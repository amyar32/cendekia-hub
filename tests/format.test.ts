import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, formatTime } from '../src/lib/format';

test('formats SQLite and ISO timestamps as the same instant', () => {
  const values = [
    '2026-09-23 01:05:00',
    '2026-09-23T01:05:00',
    '2026-09-23T01:05:00.000Z',
    '2026-09-23T08:05:00+07:00',
    '2026-09-23T08:05:00+0700',
    '2026-09-22T20:05:00-05:00',
  ];
  for (const value of values) {
    assert.equal(formatTime(value), '08.05');
    assert.equal(formatDate(value), formatDate(values[0]));
  }
});

test('uses the scanner school timezone', () => {
  assert.equal(formatTime('2026-09-23T01:05:00Z', 'Asia/Makassar'), '09.05');
});

test('invalid and missing timestamps render a placeholder without throwing', () => {
  for (const value of ['', ' ', 'invalid', '2026-09-23T01:05:00ZZ']) {
    assert.equal(formatTime(value), '—');
    assert.equal(formatDate(value), '—');
  }
  assert.equal(formatTime(null), '—');
  assert.equal(formatTime(undefined), '—');
});
