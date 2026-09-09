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
      assert.equal(scalar('students'), 50);
      assert.ok(scalar('teaching_assignments') > 0);
      assert.ok(scalar('homeroom_assignments') > 0);
      assert.ok(scalar('extracurricular_assignments') > 0);
      assert.equal(
        (
          database
            .prepare("SELECT count(*) AS total FROM class_memberships WHERE status='active'")
            .get() as { total: number }
        ).total,
        49,
      );
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
