import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { suggestSubmission, tahfidzSuggestions } from '../src/features/tahfidz/server/suggestions';
import { quranVerseCounts } from '../src/features/tahfidz/server/quran-verse-counts';

const last = {
  attendance_date: '2026-09-01',
  activity_type: 'new' as const,
  surah_number: 2,
  ayah_from: 10,
  ayah_to: 15,
  result: 'fluent' as const,
};
test('fluent new memorization advances by the previous range length, bounded by the surah', () => {
  const suggestion = suggestSubmission(last)!;
  assert.equal(suggestion.activity_type, 'new');
  assert.equal(suggestion.ayah_from, 16);
  assert.equal(suggestion.ayah_to, 21);
  assert.equal(suggestion.reason, 'continuation');
  const nearEnd = suggestSubmission({ ...last, ayah_from: 280, ayah_to: 285 })!;
  assert.equal(nearEnd.ayah_from, 286);
  assert.equal(nearEnd.ayah_to, 286);
  assert.equal(quranVerseCounts.length, 114);
  assert.equal(
    quranVerseCounts.reduce<number>((total, value) => total + value, 0),
    6236,
  );
});
test('repeat and completed surahs suggest review without changing surah', () => {
  for (const activity_type of ['new', 'review'] as const) {
    const suggestion = suggestSubmission({ ...last, activity_type, result: 'repeat' })!;
    assert.equal(suggestion.activity_type, 'review');
    assert.equal(suggestion.reason, 'repeat');
    assert.equal(suggestion.ayah_from, 10);
    assert.equal(suggestion.ayah_to, 15);
  }
  const completed = suggestSubmission({ ...last, surah_number: 114, ayah_from: 1, ayah_to: 6 })!;
  assert.equal(completed.surah_number, 114);
  assert.equal(completed.reason, 'surah_completed');
  assert.equal(completed.activity_type, 'review');
  assert.equal(suggestSubmission({ ...last, activity_type: 'review' })!.reason, 'review');
});
test('invalid historic verse ranges produce no suggestion', () => {
  assert.equal(suggestSubmission({ ...last, ayah_from: 0 }), null);
  assert.equal(suggestSubmission({ ...last, ayah_from: 16 }), null);
  assert.equal(suggestSubmission({ ...last, ayah_to: 287 }), null);
  assert.equal(suggestSubmission({ ...last, surah_number: 115 }), null);
});

const sql = new Database(':memory:');
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
globalDb.cmsDb = sql;
after(() => {
  sql.close();
  delete globalDb.cmsDb;
});
sql.exec(`
  CREATE TABLE tahfidz_sessions(id TEXT PRIMARY KEY,school_id TEXT,teacher_id TEXT,attendance_date TEXT,starts_at TEXT,status TEXT);
  CREATE TABLE tahfidz_session_records(id TEXT PRIMARY KEY,session_id TEXT,student_id TEXT,status TEXT,
    activity_type TEXT,surah_number INTEGER,ayah_from INTEGER,ayah_to INTEGER,result TEXT);
`);
function add(
  id: string,
  date: string,
  options: {
    school?: string;
    teacher?: string;
    status?: string;
    result?: string;
    student?: string;
    attendance?: string;
  } = {},
) {
  sql
    .prepare('INSERT INTO tahfidz_sessions VALUES (?,?,?,?,?,?)')
    .run(
      id,
      options.school || 'school',
      options.teacher || 'teacher',
      date,
      `${date} 07:00`,
      options.status || 'closed',
    );
  sql
    .prepare('INSERT INTO tahfidz_session_records VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      `record-${id}`,
      id,
      options.student || 'student',
      options.attendance || 'present',
      'new',
      2,
      10,
      15,
      options.result || 'fluent',
    );
}
add('last', '2026-09-01');
add('target', '2026-10-02', { status: 'open' });
add('future', '2026-10-03', { result: 'repeat' });
add('same-day', '2026-10-02', { result: 'repeat' });
add('open', '2026-10-01', { status: 'open', result: 'repeat' });
add('foreign', '2026-10-01', { school: 'foreign', result: 'repeat' });
add('other-teacher', '2026-10-01', { teacher: 'other', result: 'repeat' });
add('absent', '2026-10-01', { attendance: 'absent', result: 'repeat' });
add('not-submitted', '2026-10-01', { result: 'not_submitted' });
add('not-assessed', '2026-10-01', { result: 'not_assessed' });
sql
  .prepare('INSERT INTO tahfidz_session_records VALUES (?,?,?,?,?,?,?,?,?)')
  .run('new-student', 'target', 'new-student', 'absent', 'none', null, null, null, 'not_assessed');
test('uses only prior closed assessed submissions belonging to the same school and teacher', () => {
  const suggestions = tahfidzSuggestions('school', 'teacher', 'target');
  assert.deepEqual(Object.keys(suggestions), ['record-target']);
  assert.equal(suggestions['record-target'].source.attendance_date, '2026-09-01');
  assert.equal(suggestions['record-target'].reason, 'continuation');
  assert.deepEqual(tahfidzSuggestions('foreign', 'teacher', 'target'), {});
  assert.deepEqual(tahfidzSuggestions('school', 'other', 'target'), {});
  assert.deepEqual(tahfidzSuggestions('school', 'teacher', 'last'), {});
});
test('the latest assessed repeat takes precedence over a previous fluent submission', () => {
  add('latest-repeat', '2026-09-30', { result: 'repeat', attendance: 'late' });
  const suggestion = tahfidzSuggestions('school', 'teacher', 'target')['record-target'];
  assert.equal(suggestion.reason, 'repeat');
  assert.equal(suggestion.ayah_from, 10);
  assert.equal(suggestion.ayah_to, 15);
});
