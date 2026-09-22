import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

test('database lama dimigrasikan sampai skema jadwal ujian dan role terbaru', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cms-migration-test-'));
  const databasePath = join(directory, 'legacy.sqlite');
  try {
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        photo_url TEXT NOT NULL DEFAULT '',
        nis TEXT NOT NULL,
        nisn TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        gender TEXT NOT NULL,
        birth_date TEXT,
        birth_place TEXT NOT NULL DEFAULT '',
        blood_type TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        enrollment_date TEXT,
        previous_school_name TEXT NOT NULL DEFAULT '',
        previous_school_npsn TEXT NOT NULL DEFAULT '',
        previous_school_address TEXT NOT NULL DEFAULT '',
        previous_school_last_grade TEXT NOT NULL DEFAULT '',
        previous_school_graduation_year TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        qr_token TEXT NOT NULL DEFAULT ''
      );
      PRAGMA user_version = 42;
    `);
    legacy.close();

    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--eval', "import('./src/lib/db.ts').then(({db}) => db().close())"],
      { env: { ...process.env, DATABASE_PATH: databasePath } },
    );

    const migrated = new Database(databasePath);
    const columns = migrated.pragma('table_info(students)') as { name: string }[];
    const indexes = migrated.pragma('index_list(students)') as { name: string }[];
    assert.ok(columns.some((column) => column.name === 'nik'));
    assert.ok(columns.some((column) => column.name === 'family_card_number'));
    assert.ok(columns.some((column) => column.name === 'has_special_needs'));
    assert.ok(columns.some((column) => column.name === 'province_code'));
    assert.ok(columns.some((column) => column.name === 'domicile_matches_family_card'));
    assert.ok(indexes.some((index) => index.name === 'students_school_nik'));
    assert.equal(migrated.pragma('user_version', { simple: true }), 52);
    const schoolColumns = migrated.pragma('table_info(schools)') as { name: string }[];
    assert.ok(schoolColumns.some((column) => column.name === 'teacher_checkin_late_enabled'));
    const scheduleColumns = migrated.pragma('table_info(class_schedules)') as { name: string }[];
    const scheduleIndexes = migrated.pragma('index_list(class_schedules)') as { name: string }[];
    assert.ok(scheduleColumns.some((column) => column.name === 'archived_at'));
    assert.ok(scheduleIndexes.some((index) => index.name === 'class_schedules_unique_active'));
    const examTables = migrated
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'exam_%'")
      .all() as { name: string }[];
    assert.ok(examTables.some((table) => table.name === 'exam_periods'));
    assert.ok(examTables.some((table) => table.name === 'exam_schedule_versions'));
    assert.ok(examTables.some((table) => table.name === 'exam_schedule_students'));
    assert.ok(
      migrated.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get(),
    );
    const displayRole = migrated
      .prepare("SELECT permissions FROM roles WHERE id='live-display'")
      .get() as { permissions: string } | undefined;
    assert.deepEqual(JSON.parse(displayRole?.permissions || '[]'), ['live-display.read']);
    migrated.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
