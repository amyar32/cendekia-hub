import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { tahfidzHistory } from '../src/features/tahfidz/server/history';
import { GET as mobileHistory } from '../src/app/api/v1/tahfidz/history/route';

const sql = new Database(':memory:');
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
globalDb.cmsDb = sql;
after(() => {
  sql.close();
  delete globalDb.cmsDb;
});
sql.exec(`
  CREATE TABLE students(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,nis TEXT);
  CREATE TABLE academic_years(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,start_date TEXT,end_date TEXT,is_active INTEGER);
  CREATE TABLE tahfidz_groups(id TEXT PRIMARY KEY,school_id TEXT,teacher_id TEXT,academic_year_id TEXT);
  CREATE TABLE tahfidz_group_members(group_id TEXT,student_id TEXT);
  CREATE TABLE tahfidz_sessions(id TEXT PRIMARY KEY,school_id TEXT,teacher_id TEXT,attendance_date TEXT,
    starts_at TEXT,group_name TEXT,teacher_name TEXT,status TEXT,group_id TEXT);
  CREATE TABLE tahfidz_session_records(id TEXT PRIMARY KEY,session_id TEXT,student_id TEXT,class_name TEXT,
    status TEXT,activity_type TEXT,surah_number INTEGER,ayah_from INTEGER,ayah_to INTEGER,result TEXT,note TEXT);
`);
const student = randomUUID(),
  emptyStudent = randomUUID(),
  otherStudent = randomUUID(),
  foreignStudent = randomUUID();
const oldYear = randomUUID(),
  currentYear = randomUUID(),
  foreignYear = randomUUID();
for (const [id, school, name, start, end, active] of [
  [oldYear, 'school', '2025/2026', '2025-10-01', '2026-09-30', 0],
  [currentYear, 'school', '2026/2027', '2026-10-01', '2027-09-30', 1],
  [foreignYear, 'foreign', '2026/2027', '2026-10-01', '2027-09-30', 1],
])
  sql
    .prepare('INSERT INTO academic_years VALUES(?,?,?,?,?,?)')
    .run(id, school, name, start, end, active);
for (const [id, school, name] of [
  [student, 'school', 'Andi'],
  [emptyStudent, 'school', 'Baru'],
  [otherStudent, 'school', 'Budi'],
  [foreignStudent, 'foreign', 'Cici'],
]) {
  sql.prepare('INSERT INTO students VALUES (?,?,?,?)').run(id, school, name, name);
}
sql
  .prepare('INSERT INTO tahfidz_groups VALUES (?,?,?,?)')
  .run('empty-group', 'school', 'teacher', currentYear);
sql.prepare('INSERT INTO tahfidz_group_members VALUES (?,?)').run('empty-group', emptyStudent);
function record(pupil: string, school: string, teacher: string, date: string, result = 'fluent') {
  const session = randomUUID(),
    id = randomUUID();
  const groupId = randomUUID();
  sql
    .prepare('INSERT INTO tahfidz_groups VALUES (?,?,?,?)')
    .run(
      groupId,
      school,
      teacher,
      school === 'foreign' ? foreignYear : date < '2026-10-01' ? oldYear : currentYear,
    );
  sql
    .prepare('INSERT INTO tahfidz_sessions VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      session,
      school,
      teacher,
      date,
      `${date} 07:00`,
      'Halaqah lama',
      'Pembimbing lama',
      'closed',
      groupId,
    );
  sql
    .prepare('INSERT INTO tahfidz_session_records VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, session, pupil, '7A', 'present', 'new', 1, 1, 7, result, 'Perbaiki tajwid');
  return id;
}
for (let day = 1; day <= 21; day++)
  record(student, 'school', 'teacher', `2026-09-${String(day).padStart(2, '0')}`);
record(student, 'school', 'other-teacher', '2026-10-01', 'repeat');
record(otherStudent, 'school', 'other-teacher', '2026-10-01');
record(foreignStudent, 'foreign', 'teacher', '2026-10-01');
const request = (id?: string, page = 1) =>
  new Request(`http://localhost/history?page=${page}${id ? `&student_id=${id}` : ''}`);

test('admin history includes historical participants and other teachers, but excludes other schools', () => {
  const list = tahfidzHistory('school', request())!;
  assert.deepEqual(
    list.students.map((row) => row.id),
    [student, emptyStudent, otherStudent],
  );
  const history = tahfidzHistory('school', request(student))!;
  assert.equal(history.total, 22);
  assert.equal(history.records[0].attendance_date, '2026-10-01');
  assert.equal(history.records[0].result, 'repeat');
  assert.equal(tahfidzHistory('school', request(foreignStudent)), null);
});
test('native restricts picker, totals, and rows to the authenticated teacher', () => {
  const list = tahfidzHistory('school', request(), 'teacher')!;
  assert.deepEqual(
    list.students.map((row) => row.id),
    [student, emptyStudent],
  );
  assert.equal(tahfidzHistory('school', request(otherStudent), 'teacher'), null);
  assert.equal(tahfidzHistory('school', request(foreignStudent), 'teacher'), null);
  const history = tahfidzHistory('school', request(student), 'teacher')!;
  assert.equal(history.total, 21);
  assert.equal(history.records.length, 20);
  assert.equal(history.records[0].attendance_date, '2026-09-21');
  assert.equal(history.records[0].surah_name, 'Al-Fatihah');
  assert.equal(history.records[0].teacher_name, 'Pembimbing lama');
  assert.equal(history.records[0].note, 'Perbaiki tajwid');
  const second = tahfidzHistory('school', request(student, 2), 'teacher')!;
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].attendance_date, '2026-09-01');
  assert.equal(new Set([...history.records, ...second.records].map((row) => row.id)).size, 21);
});
test('new participants have empty history and malformed query parameters are rejected', () => {
  const history = tahfidzHistory('school', request(emptyStudent), 'teacher')!;
  assert.equal(history.student?.id, emptyStudent);
  assert.equal(history.total, 0);
  assert.deepEqual(history.records, []);
  assert.throws(() => tahfidzHistory('school', request('invalid'), 'teacher'));
  assert.throws(() => tahfidzHistory('school', request(student, 0), 'teacher'));
});

test('native history endpoint requires authentication', async () => {
  const response = await mobileHistory(request());
  assert.equal(response.status, 401);
});

test('year filter scopes students, totals and records while all years preserves continuity', () => {
  const history = tahfidzHistory(
    'school',
    new Request(`http://localhost/history?student_id=${student}&academic_year_id=${oldYear}`),
  )!;
  assert.equal(history.total, 21);
  assert.ok(
    history.records.every(
      (row) => row.academic_year_id === oldYear && row.academic_year_name === '2025/2026',
    ),
  );
  assert.equal(tahfidzHistory('school', request(student))!.total, 22);
  const current = tahfidzHistory(
    'school',
    new Request(`http://localhost/history?student_id=${student}&academic_year_id=${currentYear}`),
  )!;
  assert.equal(current.total, 1);
  assert.equal(
    tahfidzHistory(
      'school',
      new Request(`http://localhost/history?student_id=${student}&academic_year_id=${currentYear}`),
      'teacher',
    ),
    null,
  );
  assert.throws(() =>
    tahfidzHistory(
      'school',
      new Request(`http://localhost/history?academic_year_id=${foreignYear}`),
    ),
  );
});
