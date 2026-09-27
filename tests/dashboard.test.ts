import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { db } from '../src/lib/db';
import { dashboardFollowUps } from '../src/features/dashboard/server/follow-ups';
import type { SessionUser } from '../src/lib/auth';

test('dashboard follow-ups respect permissions, school, dates, attendance state and exam suspension', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-test-'));
  const previousPath = process.env.DATABASE_PATH;
  const previousDate = process.env.APP_CURRENT_DATE;
  process.env.DATABASE_PATH = join(directory, 'test.sqlite');
  process.env.APP_CURRENT_DATE = '2026-09-28';
  try {
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/seed-simulation.ts', '--level', 'sma'],
      {
        env: {
          ...process.env,
          UPLOAD_STORAGE_PATH: join(directory, 'uploads'),
          SEED_ADMIN_EMAIL: 'dashboard@test.local',
          SEED_ADMIN_PASSWORD: 'dashboard-test-password',
        },
        stdio: 'pipe',
      },
    );
    const connection = db();
    const school = connection.prepare('SELECT id FROM schools LIMIT 1').get() as { id: string };
    const account = connection
      .prepare("SELECT id FROM users WHERE email='dashboard@test.local'")
      .get() as { id: string };
    const user: SessionUser = {
      id: account.id,
      name: 'Test',
      email: 'dashboard@test.local',
      role_id: '',
      role: '',
      permissions: ['dashboard.read'],
      must_change_password: false,
    };
    assert.deepEqual(dashboardFollowUps(user, school.id).items, []);
    user.permissions = ['admissions.read'];
    assert.deepEqual(dashboardFollowUps(user, school.id).items, []);
    user.permissions = ['dashboard.read', 'admissions.read'];
    connection.prepare("UPDATE student_applications SET status='submitted'").run();
    const submitted = dashboardFollowUps(user, school.id).items;
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].count, 40);
    assert.equal(submitted[0].href, '/admissions?status=submitted');
    connection.prepare("UPDATE student_applications SET status='verified'").run();
    assert.equal(dashboardFollowUps(user, school.id).items[0].count, 0);
    assert.equal(dashboardFollowUps(user, 'another-school').items[0].count, 0);

    user.permissions = ['dashboard.read', 'academic-reports.read'];
    connection.prepare("UPDATE students SET nisn='' WHERE is_active=1").run();
    assert.equal(
      dashboardFollowUps(user, school.id).items.find((i) => i.id === 'nisn')?.count,
      179,
    );
    connection.prepare('DELETE FROM guardians WHERE is_primary=1').run();
    assert.equal(
      dashboardFollowUps(user, school.id).items.find((i) => i.id === 'guardian')?.count,
      179,
    );

    connection.prepare("UPDATE class_schedules SET archived_at=datetime('now')").run();
    const schedules = connection
      .prepare(
        `SELECT cs.id,ta.teacher_id,t.user_id FROM class_schedules cs
      JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
      JOIN teachers t ON t.id=ta.teacher_id JOIN semesters s ON s.id=cs.semester_id
      JOIN academic_years ay ON ay.id=s.academic_year_id
      WHERE ay.is_active=1 AND s.start_date<=? AND s.end_date>=?
      GROUP BY ta.teacher_id LIMIT 2`,
      )
      .all('2026-09-28', '2026-09-28') as { id: string; teacher_id: string; user_id: string }[];
    assert.equal(schedules.length, 2);
    for (const schedule of schedules)
      connection
        .prepare('UPDATE class_schedules SET archived_at=NULL,weekday=1 WHERE id=?')
        .run(schedule.id);
    user.permissions = ['dashboard.read', 'student-attendance.read', 'student-attendance.report'];
    const attendanceCount = () =>
      dashboardFollowUps(user, school.id).items.find((i) => i.id === 'attendance')?.count;
    assert.equal(attendanceCount(), 2);
    user.permissions = ['dashboard.read', 'student-attendance.read'];
    assert.equal(attendanceCount(), undefined); // Admin account has no linked teacher.
    connection
      .prepare('UPDATE teachers SET user_id=? WHERE id=?')
      .run(account.id, schedules[0].teacher_id);
    assert.equal(attendanceCount(), 1);
    connection
      .prepare(
        `INSERT INTO student_attendance_sessions
      (id,school_id,class_schedule_id,teaching_assignment_id,class_id,teacher_id,attendance_date,
       subject_name,class_name,teacher_name,created_by,status)
      SELECT 'dashboard-session',?,cs.id,ta.id,ta.class_id,ta.teacher_id,?,
        'Mapel','Kelas','Guru',?,'open' FROM class_schedules cs
      JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id WHERE cs.id=?`,
      )
      .run(school.id, '2026-09-28', account.id, schedules[0].id);
    assert.equal(attendanceCount(), 1);
    connection
      .prepare(
        "UPDATE student_attendance_sessions SET status='closed' WHERE id='dashboard-session'",
      )
      .run();
    assert.equal(attendanceCount(), 0);
    user.permissions.push('student-attendance.report');
    assert.equal(attendanceCount(), 1);
    connection
      .prepare(
        `UPDATE exam_periods SET status='published',start_date='2026-09-28',
      end_date='2026-09-28',regular_schedule_policy='suspend_all_classes' WHERE id=(SELECT id FROM exam_periods LIMIT 1)`,
      )
      .run();
    assert.equal(attendanceCount(), 0);
    process.env.APP_CURRENT_DATE = '2026-09-27'; // Sunday has no schedules.
    assert.equal(attendanceCount(), 0);
    connection.prepare('UPDATE academic_years SET is_active=0').run();
    assert.equal(attendanceCount(), undefined);
    assert.deepEqual(dashboardFollowUps(user, '').items, []);
  } finally {
    const globalDb = globalThis as unknown as { cmsDb?: ReturnType<typeof db> };
    globalDb.cmsDb?.close();
    delete globalDb.cmsDb;
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    if (previousDate === undefined) delete process.env.APP_CURRENT_DATE;
    else process.env.APP_CURRENT_DATE = previousDate;
    rmSync(directory, { recursive: true, force: true });
  }
});
