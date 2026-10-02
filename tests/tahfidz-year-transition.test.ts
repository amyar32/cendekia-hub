import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  copyTahfidzGroups,
  reconcileTahfidzParticipants,
  restoreTahfidzParticipants,
} from '../src/features/tahfidz/server/annual-transition';
import {
  createTahfidzSessionSchema,
  openTahfidzSession,
  updateTahfidzRecords,
} from '../src/features/tahfidz/server/mobile';
import type { MobileTeacherActor } from '../src/lib/mobile-api';

const sql = new Database(':memory:');
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
globalDb.cmsDb = sql;
after(() => {
  sql.close();
  delete globalDb.cmsDb;
});
sql.exec(`
  CREATE TABLE academic_years(id TEXT PRIMARY KEY,school_id TEXT,start_date TEXT,end_date TEXT,is_active INTEGER);
  CREATE TABLE semesters(id TEXT PRIMARY KEY,academic_year_id TEXT,period INTEGER,start_date TEXT,end_date TEXT);
  CREATE TABLE teachers(id TEXT PRIMARY KEY,school_id TEXT,is_active INTEGER,name TEXT);
  CREATE TABLE schedule_time_slots(id TEXT PRIMARY KEY,is_active INTEGER,is_break INTEGER);
  CREATE TABLE students(id TEXT PRIMARY KEY,school_id TEXT,is_active INTEGER);
  CREATE TABLE class_memberships(student_id TEXT,academic_year_id TEXT,status TEXT);
  CREATE TABLE tahfidz_groups(id TEXT PRIMARY KEY,school_id TEXT,name TEXT,teacher_id TEXT,academic_year_id TEXT,
    semester_id TEXT,time_slot_id TEXT,weekday INTEGER,weekdays TEXT,location TEXT,quota INTEGER,status TEXT);
  CREATE TABLE tahfidz_group_members(id TEXT PRIMARY KEY,group_id TEXT,student_id TEXT,UNIQUE(group_id,student_id));
  CREATE TABLE tahfidz_sessions(id TEXT PRIMARY KEY,school_id TEXT,group_id TEXT,teacher_id TEXT,status TEXT,attendance_date TEXT);
  INSERT INTO academic_years VALUES('source','school','2026-07-01','2027-06-30',1),('target','school','2027-07-01','2028-06-30',0);
  INSERT INTO semesters VALUES('old-sem','source',1,'2026-07-01','2026-12-31'),('new-sem','target',1,'2027-07-01','2027-12-31');
  INSERT INTO teachers VALUES('teacher','school',1,'Guru'),('inactive','school',0,'Nonaktif');
  INSERT INTO schedule_time_slots VALUES('slot',1,0);
  INSERT INTO students VALUES('stays','school',1),('graduates','school',1),('foreign','other',1);
  INSERT INTO class_memberships VALUES('stays','source','active'),('graduates','source','active'),('foreign','source','active');
  INSERT INTO tahfidz_groups VALUES('old','school','Halaqah','teacher','source','old-sem','slot',1,'[1,3]','Ruang',10,'active');
  INSERT INTO tahfidz_groups VALUES('done','school','Selesai','teacher','source',NULL,'slot',1,'[1]','',10,'completed');
  INSERT INTO tahfidz_groups VALUES('inactive-group','school','Nonaktif','inactive','source',NULL,'slot',1,'[1]','',10,'active');
  INSERT INTO tahfidz_groups VALUES('other','other','Luar','teacher','source',NULL,'slot',1,'[1]','',10,'active');
  INSERT INTO tahfidz_groups VALUES('all-sem','school','Semua semester','teacher','source',NULL,'slot',2,'[2]','',10,'active');
  INSERT INTO tahfidz_group_members VALUES('m1','old','stays'),('m2','old','graduates'),('m3','old','foreign');
  INSERT INTO tahfidz_sessions VALUES('historical','school','old','teacher','closed','2026-07-06');
`);

test('copy remaps semesters and preserves schedules as draft without copying sessions', () => {
  const copied = sql.transaction(() => copyTahfidzGroups('school', 'source', 'target'))();
  assert.equal(copied, 2);
  const groups = sql
    .prepare("SELECT * FROM tahfidz_groups WHERE academic_year_id='target' ORDER BY name")
    .all() as Array<Record<string, unknown>>;
  assert.equal(groups[0].status, 'draft');
  assert.equal(groups[0].semester_id, 'new-sem');
  assert.equal(groups[0].weekdays, '[1,3]');
  assert.equal(groups[1].semester_id, null);
  assert.deepEqual(
    sql
      .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=? ORDER BY student_id')
      .pluck()
      .all(String(groups[0].id)),
    ['graduates', 'stays'],
  );
  assert.equal(
    (sql.prepare('SELECT count(*) n FROM tahfidz_sessions').get() as { n: number }).n,
    1,
  );
});

test('finalization excludes graduates; undo restores draft participants and protects subsequent changes', () => {
  sql.exec(
    "UPDATE students SET is_active=0 WHERE id='graduates'; INSERT INTO class_memberships VALUES('stays','target','active');",
  );
  const snapshot = sql.transaction(() => reconcileTahfidzParticipants('school', 'target'))();
  const targetGroup = (
    sql
      .prepare("SELECT id FROM tahfidz_groups WHERE name='Halaqah' AND academic_year_id='target'")
      .get() as { id: string }
  ).id;
  assert.deepEqual(
    sql
      .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=?')
      .pluck()
      .all(targetGroup),
    ['stays'],
  );
  assert.equal(
    (
      sql.prepare("SELECT count(*) n FROM tahfidz_group_members WHERE group_id='old'").get() as {
        n: number;
      }
    ).n,
    3,
  );
  sql
    .prepare('INSERT INTO tahfidz_sessions VALUES(?,?,?,?,?,?)')
    .run('new-session', 'school', targetGroup, 'teacher', 'closed', '2027-07-05');
  assert.throws(
    () => sql.transaction(() => restoreTahfidzParticipants('school', 'target', snapshot))(),
    /sesi tahfidz/,
  );
  sql.prepare("DELETE FROM tahfidz_sessions WHERE id='new-session'").run();
  sql.prepare('DELETE FROM tahfidz_group_members WHERE group_id=?').run(targetGroup);
  assert.throws(
    () => sql.transaction(() => restoreTahfidzParticipants('school', 'target', snapshot))(),
    /Peserta tahfidz/,
  );
  sql
    .prepare('INSERT INTO tahfidz_group_members VALUES(?,?,?)')
    .run('restore-stays', targetGroup, 'stays');
  sql.transaction(() => restoreTahfidzParticipants('school', 'target', snapshot))();
  assert.deepEqual(
    sql
      .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=? ORDER BY student_id')
      .pluck()
      .all(targetGroup),
    ['graduates', 'stays'],
  );
});

const actor = { school_id: 'school', teacher_id: 'teacher' } as MobileTeacherActor;
test('session dates must be within the academic year even for all-semester groups', () => {
  for (const date of ['2026-06-30', '2027-07-06'])
    assert.throws(
      () => openTahfidzSession(actor, { schedule_id: 'all-sem', attendance_date: date }),
      /Jadwal halaqah tidak berlaku/,
    );
  assert.equal(
    createTahfidzSessionSchema.safeParse({
      schedule_id: '00000000-0000-4000-8000-000000000001',
      attendance_date: '2026-02-30',
    }).success,
    false,
  );
});

test('open sessions from an inactive year cannot be edited', () => {
  sql.exec(
    "UPDATE academic_years SET is_active=0 WHERE id='source'; UPDATE tahfidz_sessions SET status='open' WHERE id='historical';",
  );
  assert.throws(
    () => updateTahfidzRecords(actor, 'historical', { records: [] }),
    /tahun ajaran yang sudah selesai/,
  );
});

test('thirty halaqah groups retain the previous arrangement in a new draft year', () => {
  sql.exec(
    "INSERT INTO academic_years VALUES('batch-source','school','2030-07-01','2031-06-30',0),('batch-target','school','2031-07-01','2032-06-30',0)",
  );
  for (let index = 1; index <= 30; index++) {
    sql
      .prepare('INSERT INTO teachers VALUES(?,?,?,?)')
      .run(`batch-teacher-${index}`, 'school', 1, `Guru ${index}`);
    sql.prepare('INSERT INTO students VALUES(?,?,?)').run(`batch-student-${index}`, 'school', 1);
    sql
      .prepare('INSERT INTO class_memberships VALUES(?,?,?)')
      .run(`batch-student-${index}`, 'batch-source', 'active');
    sql
      .prepare('INSERT INTO tahfidz_groups VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        `batch-group-${index}`,
        'school',
        `Halaqah ${index}`,
        `batch-teacher-${index}`,
        'batch-source',
        null,
        'slot',
        1,
        '[1,3]',
        `Ruang ${index}`,
        10,
        'active',
      );
    sql
      .prepare('INSERT INTO tahfidz_group_members VALUES(?,?,?)')
      .run(`batch-member-${index}`, `batch-group-${index}`, `batch-student-${index}`);
  }
  assert.equal(
    sql.transaction(() => copyTahfidzGroups('school', 'batch-source', 'batch-target'))(),
    30,
  );
  const groups = sql
    .prepare("SELECT * FROM tahfidz_groups WHERE academic_year_id='batch-target'")
    .all() as Array<{
    id: string;
    name: string;
    teacher_id: string;
    weekdays: string;
    quota: number;
    location: string;
    status: string;
  }>;
  assert.equal(groups.length, 30);
  for (const group of groups) {
    const index = Number(group.name.replace('Halaqah ', ''));
    assert.equal(group.status, 'draft');
    assert.equal(group.teacher_id, `batch-teacher-${index}`);
    assert.equal(group.weekdays, '[1,3]');
    assert.equal(group.quota, 10);
    assert.equal(group.location, `Ruang ${index}`);
    assert.deepEqual(
      sql
        .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=?')
        .pluck()
        .all(group.id),
      [`batch-student-${index}`],
    );
  }
});
