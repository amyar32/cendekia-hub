import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Workbook } from 'exceljs';
import { tahfidzRecap } from '../src/features/tahfidz/server/recap';
import { createTahfidzExcel, createTahfidzPdf } from '../src/features/tahfidz/recap-export';
import { reportExportTheme } from '../src/features/reports/export-theme';

const sql = new Database(':memory:');
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
globalDb.cmsDb = sql;
const previousDate = process.env.APP_CURRENT_DATE;
process.env.APP_CURRENT_DATE = '2026-10-02';
after(() => {
  sql.close();
  delete globalDb.cmsDb;
  if (previousDate === undefined) delete process.env.APP_CURRENT_DATE;
  else process.env.APP_CURRENT_DATE = previousDate;
});
sql.exec(`
  CREATE TABLE schools(id TEXT PRIMARY KEY,name TEXT,timezone TEXT);
  CREATE TABLE academic_years(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,start_date TEXT,end_date TEXT,is_active INTEGER);
  CREATE TABLE students(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,nis TEXT);
  CREATE TABLE tahfidz_groups(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,academic_year_id TEXT);
  CREATE TABLE tahfidz_group_members(group_id TEXT,student_id TEXT);
  CREATE TABLE tahfidz_sessions(id TEXT PRIMARY KEY,school_id TEXT,group_id TEXT,attendance_date TEXT,group_name TEXT,teacher_name TEXT,status TEXT);
  CREATE TABLE tahfidz_session_records(id TEXT PRIMARY KEY,session_id TEXT,student_id TEXT,student_name TEXT,student_nis TEXT,class_name TEXT,
    status TEXT,activity_type TEXT,surah_number INTEGER,ayah_from INTEGER,ayah_to INTEGER,result TEXT,note TEXT);
`);
const group = randomUUID(),
  otherGroup = randomUUID(),
  foreignGroup = randomUUID(),
  student = randomUUID(),
  foreignStudent = randomUUID();
const currentYear = randomUUID(),
  oldYear = randomUUID(),
  foreignYear = randomUUID();
for (const [id, school, name, start, end, active] of [
  [oldYear, 'school', '2025/2026', '2025-07-01', '2026-06-30', 0],
  [currentYear, 'school', '2026/2027', '2026-07-01', '2027-06-30', 1],
  [foreignYear, 'foreign', '2026/2027', '2026-07-01', '2027-06-30', 1],
])
  sql
    .prepare('INSERT INTO academic_years VALUES(?,?,?,?,?,?)')
    .run(id, school, name, start, end, active);
sql.prepare('INSERT INTO schools VALUES (?,?,?)').run('school', 'Sekolah Cendekia', 'Asia/Jakarta');
for (const [id, school, name] of [
  [group, 'school', 'Halaqah A'],
  [otherGroup, 'school', 'Halaqah B'],
  [foreignGroup, 'foreign', 'Kelompok luar'],
])
  sql
    .prepare('INSERT INTO tahfidz_groups VALUES (?,?,?,?)')
    .run(id, school, name, school === 'foreign' ? foreignYear : currentYear);
function pupil(id: string, school: string, name: string) {
  sql.prepare('INSERT INTO students VALUES (?,?,?,?)').run(id, school, name, `NIS-${name}`);
}
pupil(student, 'school', 'Andi');
pupil(foreignStudent, 'foreign', 'Rahasia');
function session(id: string, date: string, groupId = group, status = 'closed', school = 'school') {
  sql
    .prepare('INSERT INTO tahfidz_sessions VALUES (?,?,?,?,?,?,?)')
    .run(id, school, groupId, date, 'Halaqah snapshot', 'Budi Guru', status);
}
function record(
  sessionId: string,
  pupilId: string,
  status = 'present',
  activity = 'new',
  result = 'fluent',
) {
  const info = sql.prepare('SELECT name,nis FROM students WHERE id=?').get(pupilId) as {
    name: string;
    nis: string;
  };
  sql
    .prepare('INSERT INTO tahfidz_session_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      randomUUID(),
      sessionId,
      pupilId,
      info.name,
      info.nis,
      '7A',
      status,
      activity,
      activity === 'none' ? null : 2,
      activity === 'none' ? null : 10,
      activity === 'none' ? null : 15,
      result,
      'Perbaiki tajwid dan makhraj. '.repeat(5),
    );
}
for (const [index, status, activity, result] of [
  [1, 'present', 'new', 'fluent'],
  [2, 'late', 'review', 'repeat'],
  [3, 'sick', 'none', 'not_submitted'],
  [4, 'excused', 'none', 'not_submitted'],
  [5, 'absent', 'none', 'not_submitted'],
  [6, 'present', 'review', 'not_assessed'],
  [7, 'present', 'none', 'not_submitted'],
] as const) {
  session(`session-${index}`, `2026-10-0${index}`);
  record(`session-${index}`, student, status, activity, result);
}
session('open', '2026-10-08', group, 'open');
record('open', student);
session('other', '2026-10-07', otherGroup);
record('other', student);
session('foreign', '2026-10-07', foreignGroup, 'closed', 'foreign');
record('foreign', foreignStudent);
session('bulk', '2026-10-02');
for (let index = 1; index <= 21; index++) {
  const id = randomUUID();
  pupil(id, 'school', `Siswa ${String(index).padStart(2, '0')}`);
  record('bulk', id);
}
function request(extra: Record<string, string> = {}) {
  return new Request(
    `http://localhost/recap?${new URLSearchParams({ date_from: '2026-10-01', date_to: '2026-10-31', group_id: group, ...extra })}`,
  );
}
test('recap aggregates attendance and results correctly, without counting absent students as missing submissions', () => {
  const data = tahfidzRecap('school', request({ student_id: student }));
  assert.equal(data.total, 1);
  assert.deepEqual(data.rows[0], {
    student_id: student,
    student_name: 'Andi',
    student_nis: 'NIS-Andi',
    total: 7,
    present: 3,
    late: 1,
    sick: 1,
    excused: 1,
    absent: 1,
    new_count: 1,
    review_count: 2,
    fluent: 1,
    repeat: 1,
    not_assessed: 1,
    not_submitted: 1,
    attendance_rate: 57.1,
  });
  assert.equal(data.summary.sessions, 7);
  assert.equal(data.summary.open_sessions, 0);
});
test('date and status filters include their boundaries and preserve default school-local month', () => {
  const data = tahfidzRecap(
    'school',
    request({ student_id: student, date_from: '2026-10-02', date_to: '2026-10-06' }),
  );
  assert.equal(data.summary.total, 5);
  assert.equal(data.summary.late, 1);
  assert.equal(data.summary.not_assessed, 1);
  const open = tahfidzRecap('school', request({ student_id: student, session_status: 'open' }));
  assert.equal(open.summary.total, 1);
  assert.equal(open.summary.open_sessions, 1);
  const all = tahfidzRecap(
    'school',
    request({ student_id: student, session_status: 'all', group_id: '' }),
  );
  assert.equal(all.summary.total, 9);
  assert.equal(all.summary.sessions, 9);
  const defaults = tahfidzRecap('school', new Request('http://localhost/recap'));
  assert.equal(defaults.filters.date_from, '2026-10-01');
  assert.equal(defaults.filters.date_to, '2026-10-02');
  assert.equal(defaults.filters.session_status, 'closed');
});
test('pagination and exports use identical filters, with complete export rows and details', () => {
  const first = tahfidzRecap('school', request());
  const second = tahfidzRecap('school', request({ page: '2' }));
  const exported = tahfidzRecap('school', request({ page: '2', export: '1' }));
  assert.equal(first.total, 22);
  assert.equal(first.rows.length, 20);
  assert.equal(second.rows.length, 2);
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.summary, exported.summary);
  assert.equal(exported.rows.length, 22);
  assert.equal(exported.records?.length, 28);
  assert.equal(exported.records?.[0].teacher_name, 'Budi Guru');
  assert.ok(exported.records?.some((row) => row.surah_name === 'Al-Baqarah'));
  assert.ok(exported.records?.every((row) => row.session_status === 'closed'));
  assert.equal(first.records, undefined);
});
test('school scope applies to options, filters, aggregates and exported details; bad dates are rejected', () => {
  const data = tahfidzRecap('school', request({ group_id: '', export: '1' }));
  assert.ok(data.options.groups.every((row) => row.value !== foreignGroup));
  assert.ok(data.options.students.every((row) => row.value !== foreignStudent));
  assert.ok(data.records?.every((row) => row.student_id !== foreignStudent));
  assert.throws(() => tahfidzRecap('school', request({ group_id: foreignGroup })));
  assert.throws(() => tahfidzRecap('school', request({ student_id: foreignStudent })));
  assert.throws(() => tahfidzRecap('school', request({ date_from: '2026-02-30' })));
  assert.throws(() => tahfidzRecap('school', request({ date_from: '2026-11-01' })));
  const empty = tahfidzRecap('school', request({ date_from: '2020-01-01', date_to: '2020-01-31' }));
  assert.equal(empty.summary.total, 0);
  assert.equal(empty.summary.present, 0);
  assert.deepEqual(empty.rows, []);
});
test('Excel exports two complete sheets and PDF exports paginated summary and details', async () => {
  const data = tahfidzRecap('school', request({ export: '1' }));
  const bytes = await createTahfidzExcel(data);
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes);
  assert.equal(workbook.worksheets.length, 2);
  assert.equal(workbook.worksheets[0].rowCount, 31);
  assert.equal(workbook.worksheets[1].rowCount, 37);
  assert.equal(workbook.worksheets[0].getCell('A9').value, 'NIS');
  assert.equal(workbook.worksheets[0].getCell('B10').value, 'Andi');
  assert.equal(workbook.worksheets[0].getCell('I10').value, 57.1);
  assert.equal(workbook.worksheets[0].getCell('A9').font.name, reportExportTheme.font.excel);
  assert.equal(
    workbook.worksheets[0].getCell('A9').font.color?.argb,
    reportExportTheme.excel.surface,
  );
  const headingFill = workbook.worksheets[0].getCell('A9').fill;
  assert.match(String(workbook.worksheets[0].getCell('A3').value), /2026\/2027/);
  assert.equal(workbook.worksheets[1].getCell('N10').value, '2026/2027');
  assert.equal(headingFill.type, 'pattern');
  if (headingFill.type === 'pattern')
    assert.equal(headingFill.fgColor?.argb, reportExportTheme.excel.brand);
  const pdf = await createTahfidzPdf(data);
  const content = Buffer.from(pdf).toString('latin1');
  assert.ok(content.startsWith('%PDF-'));
  assert.ok((content.match(/\/Type \/Page\b/g) || []).length >= 2);
  const directory = process.env.TAHFIDZ_EXPORT_QA_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'recap.pdf'), Buffer.from(pdf));
    writeFileSync(join(directory, 'recap.xlsx'), Buffer.from(bytes));
    console.log(`Export QA: ${directory}`);
  }
});

test('recap and exports follow group academic year rather than session date', () => {
  const oldGroup = randomUUID();
  sql
    .prepare('INSERT INTO tahfidz_groups VALUES(?,?,?,?)')
    .run(oldGroup, 'school', 'Halaqah lama', oldYear);
  session('old-year', '2026-10-02', oldGroup);
  record('old-year', student);
  const current = tahfidzRecap(
    'school',
    request({ group_id: '', student_id: student, export: '1' }),
  );
  assert.equal(current.filters.academic_year_id, currentYear);
  assert.ok(current.records?.every((row) => row.academic_year_id === currentYear));
  assert.ok(current.options.groups.every((row) => row.value !== oldGroup));
  const historical = tahfidzRecap(
    'school',
    request({ academic_year_id: oldYear, group_id: '', student_id: student, export: '1' }),
  );
  assert.equal(historical.summary.total, 1);
  assert.equal(historical.records?.[0].academic_year_name, '2025/2026');
  assert.throws(() => tahfidzRecap('school', request({ academic_year_id: foreignYear })));
  assert.throws(() => tahfidzRecap('school', request({ group_id: oldGroup })));
  const all = tahfidzRecap(
    'school',
    request({ academic_year_id: 'all', group_id: '', student_id: student }),
  );
  assert.equal(all.summary.total, current.summary.total + 1);
});
