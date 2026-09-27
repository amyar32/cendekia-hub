import assert from 'node:assert/strict';
import test from 'node:test';
import { toIndonesianWhatsAppNumber } from '../src/lib/notifications/phone';
import { studentCheckinMessage } from '../src/lib/notifications/templates';
import { sendWhatsAppMessage } from '../src/lib/notifications/whatsapp';

test('Wablas phone formatter accepts Indonesian local and international numbers', () => {
  assert.equal(toIndonesianWhatsAppNumber('0812-3456-7890'), '6281234567890');
  assert.equal(toIndonesianWhatsAppNumber('+62 812 3456 7890'), '6281234567890');
  assert.equal(toIndonesianWhatsAppNumber('12345'), null);
});

test('Wablas sending is disabled without credentials', async () => {
  const previousToken = process.env.WABLAS_API_TOKEN;
  const previousSecret = process.env.WABLAS_SECRET_KEY;
  delete process.env.WABLAS_API_TOKEN;
  delete process.env.WABLAS_SECRET_KEY;
  try {
    assert.equal(await sendWhatsAppMessage({ phone: '081234567890', message: 'Tes' }), 'disabled');
  } finally {
    if (previousToken === undefined) delete process.env.WABLAS_API_TOKEN;
    else process.env.WABLAS_API_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.WABLAS_SECRET_KEY;
    else process.env.WABLAS_SECRET_KEY = previousSecret;
  }
});

test('check-in message identifies the student and late status', () => {
  const message = studentCheckinMessage({
    schoolName: 'SMA Cendekia',
    studentName: 'Ayu',
    date: '2026-09-27',
    time: '07:30',
    status: 'late',
  });
  assert.match(message, /Ayu/);
  assert.match(message, /⏰ \*Hadir terlambat\*/);
  assert.match(message, /Minggu, 27 September 2026/);
});

test('check-in message supports an absent status', () => {
  const message = studentCheckinMessage({
    schoolName: 'SMA Cendekia',
    studentName: 'Ayu',
    date: '2026-09-27',
    time: '07:30',
    status: 'absent',
  });
  assert.match(message, /❌ \*Tidak hadir\*/);
});
