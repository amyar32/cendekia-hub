import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { assertTahfidzScheduleAvailable } from '../src/features/tahfidz/server/schedule-conflicts';

const sql = new Database(':memory:');
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
globalDb.cmsDb = sql;
after(() => {
  sql.close();
  delete globalDb.cmsDb;
});
sql.exec(`
  CREATE TABLE schedule_time_slots(id TEXT PRIMARY KEY,start_time TEXT,end_time TEXT);
  CREATE TABLE tahfidz_groups(id TEXT PRIMARY KEY,school_id TEXT,academic_year_id TEXT,semester_id TEXT,status TEXT,teacher_id TEXT,time_slot_id TEXT,weekdays TEXT);
  CREATE TABLE tahfidz_group_members(group_id TEXT,student_id TEXT);
  CREATE TABLE class_memberships(student_id TEXT,academic_year_id TEXT,class_id TEXT,status TEXT);
  INSERT INTO schedule_time_slots VALUES('slot','07:30','08:00');
  INSERT INTO tahfidz_groups VALUES('group','school','year','odd','active','teacher','slot','[1,3]');
  INSERT INTO tahfidz_group_members VALUES('group','student');
  INSERT INTO class_memberships VALUES('student','year','class','active');
`);
const base = {
  schoolId: 'school',
  yearId: 'year',
  semesterId: 'odd',
  weekday: 1,
  startTime: '07:45',
  endTime: '08:15',
  teacherId: 'teacher',
};

test('lesson and extracurricular schedules prevent collisions with tahfidz teachers and participants', () => {
  assert.throws(() => assertTahfidzScheduleAvailable(base), /Guru memiliki jadwal tahfidz/);
  assert.throws(
    () => assertTahfidzScheduleAvailable({ ...base, teacherId: 'other', classId: 'class' }),
    /murid rombel/,
  );
  assert.throws(
    () => assertTahfidzScheduleAvailable({ ...base, teacherId: 'other', studentIds: ['student'] }),
    /peserta memiliki jadwal tahfidz/,
  );
  assert.doesNotThrow(() =>
    assertTahfidzScheduleAvailable({ ...base, teacherId: 'other', studentIds: ['unrelated'] }),
  );
});
test('conflicts respect year, semester, weekday, school and adjacent time boundaries', () => {
  for (const variant of [
    { yearId: 'other-year' },
    { semesterId: 'even' },
    { weekday: 2 },
    { schoolId: 'other-school' },
    { startTime: '08:00', endTime: '08:30' },
    { startTime: '07:00', endTime: '07:30' },
  ])
    assert.doesNotThrow(() => assertTahfidzScheduleAvailable({ ...base, ...variant }));
  sql.exec("UPDATE tahfidz_groups SET semester_id=NULL WHERE id='group'");
  assert.throws(() => assertTahfidzScheduleAvailable({ ...base, semesterId: 'even' }));
  sql.exec("UPDATE tahfidz_groups SET status='draft' WHERE id='group'");
  assert.doesNotThrow(() => assertTahfidzScheduleAvailable(base));
});
