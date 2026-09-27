import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../src/lib/auth';
import { isoDateToUtc, isoWeekday } from '../src/lib/dates';
import { assertUploadRequestSize } from '../src/lib/uploads/request';

test('ISO date helpers parse dates consistently and use ISO weekdays', () => {
  assert.equal(isoDateToUtc('2026-09-27').toISOString(), '2026-09-27T00:00:00.000Z');
  assert.equal(isoWeekday('2026-09-27'), 7);
  assert.equal(isoWeekday('2026-09-28'), 1);
});

test('upload request size requires a valid Content-Length', () => {
  const request = new Request('http://localhost/api/uploads', { method: 'POST' });

  assert.throws(
    () =>
      assertUploadRequestSize(request, {
        maxFileBytes: 1024,
        missingContentLengthMessage: 'Content-Length wajib.',
      }),
    (error) =>
      error instanceof HttpError &&
      error.status === 411 &&
      error.message === 'Content-Length wajib.',
  );
});

test('upload request size rejects requests beyond the multipart allowance', () => {
  const request = new Request('http://localhost/api/uploads', {
    method: 'POST',
    headers: { 'content-length': String(1024 + 64 * 1024 + 1) },
  });

  assert.throws(
    () =>
      assertUploadRequestSize(request, {
        maxFileBytes: 1024,
        missingContentLengthMessage: 'Content-Length wajib.',
      }),
    (error) => error instanceof HttpError && error.status === 413,
  );
});
