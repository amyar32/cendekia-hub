import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('validasi konflik ujian dan kebijakan penghentian KBM bekerja', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exam-schedule-test-'));
  const databasePath = join(directory, 'exam.sqlite');
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = databasePath;
  try {
    const { db } = await import('../src/lib/db');
    const { examConflicts, regularScheduleBlock } = await import('../src/lib/exam-schedules');
    const connection = db();
    connection.exec(`
      INSERT INTO schools(id,name) VALUES ('school','Sekolah Uji');
      INSERT INTO roles(id,name,permissions) VALUES ('role','Role','[]');
      INSERT INTO users(id,name,email,password,role_id) VALUES ('user','Admin','admin@test.local','x','role');
      INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active) VALUES ('year','school','2029/2030','2029-07-01','2030-06-30',1);
      INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active) VALUES ('semester','year','Ganjil',1,'2029-07-01','2029-12-31',1);
      INSERT INTO grades(id,school_id,name,level_order) VALUES ('grade','school','Kelas 7',1);
      INSERT INTO classes(id,school_id,academic_year_id,grade_id,name) VALUES ('class','school','year','grade','7A');
      INSERT INTO subjects(id,school_id,code,name) VALUES ('subject','school','MAT','Matematika');
      INSERT INTO rooms(id,school_id,code,name,capacity) VALUES ('room','school','R1','Ruang 1',10);
      INSERT INTO exam_periods(id,school_id,academic_year_id,semester_id,name,start_date,end_date,status,regular_schedule_policy,supervisors_per_room)
        VALUES ('period','school','year','semester','UTS','2029-09-10','2029-09-20','published','suspend_participating_classes',2);
      INSERT INTO exam_sessions(id,exam_period_id,exam_date,name,start_time,end_time,session_order)
        VALUES ('session','period','2029-09-12','Sesi 1','07:30','09:00',1);
      INSERT INTO exam_schedule_entries(id,exam_period_id,exam_session_id,subject_id,room_id,duration_minutes,subject_name,room_name)
        VALUES ('entry','period','session','subject','room',90,'Matematika','Ruang 1');
      INSERT INTO exam_schedule_classes(id,exam_schedule_entry_id,class_id,class_name,participant_count)
        VALUES ('entry-class','entry','class','7A',30);
    `);
    const conflicts = examConflicts('period');
    const block = regularScheduleBlock('school', 'class', '2029-09-12');
    assert.ok(conflicts.some((item) => item.code === 'ROOM_CAPACITY' && item.severity === 'error'));
    assert.ok(
      conflicts.some((item) => item.code === 'SUPERVISOR_SHORTAGE' && item.severity === 'warning'),
    );
    assert.equal(block?.name, 'UTS');
    connection.close();
  } finally {
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
