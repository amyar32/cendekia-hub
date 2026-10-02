import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { db } from '../src/lib/db';
import { liveDisplaySnapshot } from '../src/features/live/server/snapshot';
import {
  liveActivityOrder,
  livePage,
  liveScenePageCounts,
  nextLiveFrame,
  type LiveFrame,
} from '../src/lib/live-display';

test('Live TV follows operational schedules, exam suspension, sessions and unique scheduled teachers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'live-display-test-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, 'test.sqlite');
  try {
    const sql = db();
    sql.exec(`
      INSERT INTO schools(id,name) VALUES ('school','Sekolah Cendekia'),('other','Sekolah Lain');
      INSERT INTO roles(id,name,permissions) VALUES ('role','Operator','["live-display.read"]');
      INSERT INTO users(id,name,email,password,role_id) VALUES ('user','Operator','operator@test.local','x','role');
      INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active) VALUES
        ('year','school','2026/2027','2026-07-01','2027-06-30',1),
        ('old','school','2025/2026','2025-07-01','2026-06-30',0),
        ('foreign-year','other','2026/2027','2026-07-01','2027-06-30',1);
      INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active)
        VALUES ('semester','year','Ganjil',1,'2026-07-01','2026-12-31',1);
      INSERT INTO grades(id,school_id,name,level_order) VALUES ('grade','school','Kelas 7',1);
      INSERT INTO classes(id,school_id,academic_year_id,grade_id,name) VALUES
        ('a','school','year','grade','7A'),('b','school','year','grade','7B'),('old-class','school','old','grade','Kelas lama');
      INSERT INTO subjects(id,school_id,code,name) VALUES ('subject','school','MAT','Matematika');
      INSERT INTO teachers(id,school_id,employee_code,name,gender,employment_status) VALUES
        ('lesson-teacher','school','G1','Guru Pelajaran','male','permanent'),('program-teacher','school','G2','Pembina Kegiatan','male','permanent'),
        ('archived-teacher','school','G3','Guru Arsip','male','permanent'),('supervisor','school','G4','Pengawas Ujian','male','permanent'),
        ('foreign-teacher','other','G1','Guru Sekolah Lain','male','permanent');
      INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order) VALUES
        ('lesson-slot','school','Jam 1','07:30','08:30',1),('tahfidz-slot','school','Tahfidz','08:30','09:00',2),
        ('extra-slot','school','Ekskul','13:00','14:00',3);
      INSERT INTO teaching_assignments(id,class_id,subject_id,teacher_id,academic_year_id,semester_id) VALUES
        ('ta','a','subject','lesson-teacher','year','semester'),('tb','b','subject','lesson-teacher','year','semester'),
        ('archived-ta','a','subject','archived-teacher','year','semester');
      INSERT INTO class_schedules(id,teaching_assignment_id,semester_id,time_slot_id,weekday,archived_at) VALUES
        ('lesson-a','ta','semester','lesson-slot',5,NULL),('lesson-b','tb','semester','lesson-slot',5,NULL),
        ('archived','archived-ta','semester','lesson-slot',5,'2026-10-01');
      INSERT INTO tahfidz_groups(id,school_id,name,teacher_id,academic_year_id,semester_id,time_slot_id,weekday,weekdays) VALUES
        ('halaqah','school','Halaqah A','program-teacher','year','semester','tahfidz-slot',1,'[1,5]'),
        ('foreign-group','other','Halaqah asing','foreign-teacher','foreign-year',NULL,'tahfidz-slot',5,'[5]');
      INSERT INTO extracurriculars(id,school_id,code,name) VALUES ('extra','school','PR','Pramuka');
      INSERT INTO extracurricular_assignments(id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,status)
        VALUES ('assignment','extra','program-teacher','year','semester','Lapangan Utama','active');
      INSERT INTO extracurricular_schedules(id,assignment_id,semester_id,time_slot_id,weekday)
        VALUES ('extra-schedule','assignment','semester','extra-slot',5);
      INSERT INTO student_attendance_sessions(id,school_id,class_schedule_id,teaching_assignment_id,class_id,teacher_id,attendance_date,
        subject_name,class_name,teacher_name,created_by,status)
        VALUES ('lesson-session','school','lesson-a','ta','a','lesson-teacher','2026-10-02','Matematika','7A','Guru Pelajaran','user','closed');
      INSERT INTO tahfidz_sessions(id,school_id,group_id,teacher_id,attendance_date,group_name,teacher_name,created_by,status)
        VALUES ('tahfidz-session','school','halaqah','program-teacher','2026-10-02','Halaqah A','Pembina Kegiatan','user','open');
      INSERT INTO extracurricular_attendance_sessions(id,school_id,extracurricular_schedule_id,assignment_id,extracurricular_id,teacher_id,
        attendance_date,extracurricular_name,teacher_name,created_by,status)
        VALUES ('extra-session','school','extra-schedule','assignment','extra','program-teacher','2026-10-02','Pramuka','Pembina Kegiatan','user','closed');
      INSERT INTO students(id,school_id,nis,name,gender) VALUES
        ('student','school','001','Murid Hadir','male'),('missing','school','002','Murid Belum Hadir','male'),('absent','school','003','Murid Tidak Hadir','male');
      INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,status) VALUES
        ('member','student','a','year','2026-07-01','active'),('old-member','student','old-class','old','2025-07-01','active');
      INSERT INTO student_checkins(id,school_id,student_id,attendance_date,status,recorded_by) VALUES
        ('checkin','school','student','2026-10-02','present','user'),('absent-checkin','school','absent','2026-10-02','absent','user');
      INSERT INTO teacher_checkins(id,school_id,teacher_id,attendance_date,status,recorded_by) VALUES
        ('teacher-checkin','school','lesson-teacher','2026-10-02','late','user');
      INSERT INTO rooms(id,school_id,code,name) VALUES ('room','school','R1','Ruang 1');
      INSERT INTO exam_periods(id,school_id,academic_year_id,semester_id,name,start_date,end_date,status,regular_schedule_policy)
        VALUES ('period','school','year','semester','UTS','2026-10-01','2026-10-05','draft','suspend_participating_classes');
      INSERT INTO exam_sessions(id,exam_period_id,exam_date,name,start_time,end_time,session_order)
        VALUES ('exam-session','period','2026-10-02','Sesi 1','07:30','09:00',1);
      INSERT INTO exam_schedule_entries(id,exam_period_id,exam_session_id,subject_id,room_id,duration_minutes,subject_name,room_name)
        VALUES ('exam','period','exam-session','subject','room',90,'Matematika','Ruang 1');
      INSERT INTO exam_schedule_classes(id,exam_schedule_entry_id,class_id,class_name) VALUES ('exam-class','exam','a','7A');
      INSERT INTO exam_supervisors(id,exam_schedule_entry_id,teacher_id,teacher_name) VALUES ('exam-supervisor','exam','supervisor','Pengawas Ujian');
    `);
    const at = new Date('2026-10-02T01:00:00Z'); // Friday, 08:00 Jakarta.
    let snapshot = liveDisplaySnapshot('school', at);
    assert.equal(snapshot.date, '2026-10-02');
    assert.equal(snapshot.current_schedules.length, 2);
    assert.equal(snapshot.activities.length, 4);
    assert.deepEqual(snapshot.attendance.teachers, {
      total: 2,
      present: 0,
      late: 1,
      absent: 0,
      missing: 1,
    });
    assert.equal(snapshot.recent_checkins.filter((p) => p.person_type === 'student').length, 1);
    assert.equal(
      snapshot.recent_checkins.find((p) => p.person_type === 'student')?.group_label,
      '7A',
    );
    assert.equal(snapshot.missing_students.length, 1);
    assert.equal(snapshot.attendance.students.absent, 1);
    assert.equal(
      snapshot.activities.find((a) => a.id === 'lesson:lesson-a')?.session_status,
      'closed',
    );
    assert.equal(snapshot.activities.find((a) => a.kind === 'tahfidz')?.session_status, 'open');
    assert.equal(
      snapshot.activities.find((a) => a.kind === 'extracurricular')?.session_status,
      'closed',
    );
    assert.deepEqual(liveScenePageCounts(snapshot), [1, 1, 1, 1, 1]);
    assert.deepEqual(
      liveActivityOrder(snapshot.activities)
        .slice(0, 3)
        .map((a) => a.kind),
      ['lesson', 'tahfidz', 'extracurricular'],
    );
    for (let index = 0; index < 25; index++)
      sql
        .prepare("INSERT INTO students(id,school_id,nis,name,gender) VALUES(?,'school',?,?,'male')")
        .run('missing-' + index, 'M' + index, 'Murid ' + index);
    assert.equal(liveDisplaySnapshot('school', at).missing_students.length, 26);
    assert.equal(liveScenePageCounts(liveDisplaySnapshot('school', at))[1], 5);

    for (let index = 0; index < 25; index++)
      sql
        .prepare(
          "INSERT INTO tahfidz_groups(id,school_id,name,teacher_id,academic_year_id,time_slot_id,weekday,weekdays) VALUES(?,'school',?,'program-teacher','year','tahfidz-slot',5,'[5]')",
        )
        .run('halaqah-' + index, 'Halaqah ' + index);
    const manyGroups = liveDisplaySnapshot('school', at);
    const halaqah = manyGroups.activities.filter((activity) => activity.kind === 'tahfidz');
    assert.equal(halaqah.length, 26);
    assert.equal(liveScenePageCounts(manyGroups)[4], 3);
    assert.equal(livePage(halaqah, 2, 12).length, 2);
    assert.equal(manyGroups.attendance.teachers.total, 2);
    sql.prepare("DELETE FROM tahfidz_groups WHERE id LIKE 'halaqah-%'").run();
    sql.prepare("UPDATE exam_periods SET status='published'").run();
    snapshot = liveDisplaySnapshot('school', at);
    assert.equal(snapshot.suspended_lessons, 1);
    assert.deepEqual(
      snapshot.current_schedules.map((s) => s.id),
      ['lesson-b'],
    );
    assert.equal(
      snapshot.activities.find((a) => a.kind === 'exam')?.teachers[0].name,
      'Pengawas Ujian',
    );
    assert.equal(snapshot.attendance.teachers.total, 3);
    sql.prepare("UPDATE exam_periods SET regular_schedule_policy='suspend_all_classes'").run();
    snapshot = liveDisplaySnapshot('school', at);
    assert.equal(snapshot.suspended_lessons, 2);
    assert.equal(snapshot.day_schedules.length, 0);
    assert.equal(snapshot.attendance.teachers.total, 2);
    assert.equal(snapshot.attendance.teachers.missing, 2);
    assert.ok(snapshot.notices.some((n) => n.title.includes('ditangguhkan')));
    sql.prepare('DELETE FROM exam_supervisors').run();
    assert.ok(
      liveDisplaySnapshot('school', at).notices.some((n) => n.title.includes('tanpa pengawas')),
    );
    sql.prepare("UPDATE exam_periods SET status='draft'").run();
    snapshot = liveDisplaySnapshot('school', new Date('2026-10-02T01:30:00Z'));
    assert.equal(snapshot.current_schedules.length, 0);
    assert.equal(snapshot.activities.find((a) => a.kind === 'tahfidz')?.phase, 'current');
    assert.equal(snapshot.activities.find((a) => a.kind === 'lesson')?.phase, 'finished');
    sql.prepare("UPDATE tahfidz_groups SET weekdays='[1]' WHERE id='halaqah'").run();
    assert.ok(!liveDisplaySnapshot('school', at).activities.some((a) => a.kind === 'tahfidz'));
    sql.prepare("UPDATE extracurricular_assignments SET status='draft'").run();
    assert.ok(
      !liveDisplaySnapshot('school', at).activities.some((a) => a.kind === 'extracurricular'),
    );
    sql.prepare("UPDATE schedule_time_slots SET is_active=0 WHERE id='lesson-slot'").run();
    assert.equal(liveDisplaySnapshot('school', at).day_schedules.length, 0);
    snapshot = liveDisplaySnapshot('school', new Date('2026-10-04T01:00:00Z'));
    assert.equal(snapshot.bell.current_slot, null);
    assert.equal(snapshot.bell.next_slot, null);
    snapshot = liveDisplaySnapshot('school', new Date('2028-10-02T01:00:00Z'));
    assert.equal(snapshot.activities.length, 0);
    assert.equal(snapshot.attendance.teachers.total, 0);
  } finally {
    const globalDb = globalThis as unknown as { cmsDb?: ReturnType<typeof db> };
    globalDb.cmsDb?.close();
    delete globalDb.cmsDb;
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('automatic TV rotation resumes long lists and gives every scene a turn without input', () => {
  const counts = [4, 3, 1, 5, 3];
  const visited = counts.map(() => new Set<number>());
  let frame: LiveFrame = { scene: 0, pages: [0, 0, 0, 0, 0], step: 0 };
  let run = 0,
    previousScene = -1;
  for (let tick = 0; tick < 120; tick++) {
    visited[frame.scene].add(frame.pages[frame.scene]);
    run = frame.scene === previousScene ? run + 1 : 1;
    assert.ok(run <= (frame.scene === 4 ? 3 : 2));
    previousScene = frame.scene;
    frame = nextLiveFrame(frame, counts[frame.scene]);
  }
  counts.forEach((count, scene) => assert.equal(visited[scene].size, count));
  assert.deepEqual(livePage([1, 2, 3, 4, 5], 1, 3), [4, 5]);
  assert.deepEqual(livePage([1, 2, 3, 4, 5], 2, 3), [1, 2, 3]);
  assert.deepEqual(livePage([], 7, 3), []);
  assert.equal(nextLiveFrame({ scene: 0, pages: [3, 0, 0, 0], step: 0 }, 1).pages[0], 0);
});
