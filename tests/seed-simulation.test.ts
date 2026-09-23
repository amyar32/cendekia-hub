import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';

for (const [level, expectedGrades] of [
  ['sd', 6],
  ['smp', 3],
  ['sma', 3],
] as const) {
  test(`seed simulasi ${level.toUpperCase()} membuat struktur onboarding lengkap`, () => {
    const directory = mkdtempSync(join(tmpdir(), `cendekia-seed-${level}-`));
    const databasePath = join(directory, 'simulation.sqlite');
    try {
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/seed-simulation.ts', '--level', level],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_PATH: databasePath,
            UPLOAD_STORAGE_PATH: join(directory, 'uploads'),
            SEED_ADMIN_EMAIL: `admin-${level}@test.local`,
            SEED_ADMIN_PASSWORD: 'simulation-password-123',
          },
        },
      );
      const database = new Database(databasePath, { readonly: true });
      const scalar = (table: string) =>
        (database.prepare(`SELECT count(*) AS total FROM ${table}`).get() as { total: number })
          .total;
      assert.equal(
        (
          database.prepare('SELECT education_level FROM schools').get() as {
            education_level: string;
          }
        ).education_level,
        level,
      );
      assert.equal(scalar('grades'), expectedGrades);
      assert.equal(scalar('teachers'), 15);
      assert.equal(scalar('students'), 180);
      assert.ok(scalar('teaching_assignments') > 0);
      assert.ok(scalar('homeroom_assignments') > 0);
      assert.ok(scalar('extracurricular_assignments') > 0);
      assert.equal(
        (
          database
            .prepare("SELECT count(*) AS total FROM class_memberships WHERE status='active'")
            .get() as { total: number }
        ).total,
        179,
      );
      assert.deepEqual(database.pragma('foreign_key_check'), []);
      for (const session of database
        .prepare(
          `SELECT sa.attendance_date,cs.weekday FROM student_attendance_sessions sa
        JOIN class_schedules cs ON cs.id=sa.class_schedule_id`,
        )
        .all() as { attendance_date: string; weekday: number }[]) {
        const date = new Date(`${session.attendance_date}T12:00:00Z`);
        assert.equal(date.toISOString().slice(0, 10), session.attendance_date);
        assert.equal(date.getUTCDay(), session.weekday);
      }
      for (const table of [
        'guardians',
        'student_documents',
        'promotion_batches',
        'student_attendance_records',
        'student_checkins',
        'teacher_checkins',
        'extracurricular_attendance_sessions',
        'extracurricular_attendance_records',
        'admission_periods',
        'application_guardians',
        'application_documents',
        'application_status_history',
        'rooms',
        'exam_sessions',
        'exam_schedule_entries',
        'exam_schedule_classes',
        'exam_schedule_students',
        'exam_supervisors',
        'exam_schedule_versions',
      ]) {
        assert.ok(scalar(table) > 0, `${table} harus terisi`);
      }
      assert.equal(scalar('student_applications'), 40);
      assert.equal(scalar('exam_periods'), 3);
      assert.equal(
        (
          database
            .prepare('SELECT count(DISTINCT status) AS total FROM student_applications')
            .get() as { total: number }
        ).total,
        10,
      );
      assert.equal(
        (
          database
            .prepare(
              "SELECT count(*) AS total FROM students WHERE qr_token='' OR nik='' OR family_card_number=''",
            )
            .get() as { total: number }
        ).total,
        0,
      );
      assert.equal(
        (
          database
            .prepare(
              `SELECT count(*) AS total FROM class_schedules cs JOIN schedule_time_slots ts ON ts.id=cs.time_slot_id WHERE ts.is_break=1`,
            )
            .get() as { total: number }
        ).total,
        0,
      );
      assert.equal(
        (
          database
            .prepare(
              `SELECT count(*) AS total FROM class_schedules a
        JOIN teaching_assignments ta ON ta.id=a.teaching_assignment_id
        JOIN class_schedules b ON a.id<b.id AND a.weekday=b.weekday AND a.time_slot_id=b.time_slot_id
        JOIN teaching_assignments tb ON tb.id=b.teaching_assignment_id
        WHERE ta.class_id=tb.class_id OR ta.teacher_id=tb.teacher_id`,
            )
            .get() as { total: number }
        ).total,
        0,
      );
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            ['--import', 'tsx', 'scripts/seed-simulation.ts', '--level', level],
            {
              env: {
                ...process.env,
                DATABASE_PATH: databasePath,
                UPLOAD_STORAGE_PATH: join(directory, 'uploads'),
                SEED_ADMIN_PASSWORD: 'simulation-password-123',
              },
              stdio: 'pipe',
            },
          ),
        /database kosong/,
      );
      assert.equal(scalar('students'), 180);
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
