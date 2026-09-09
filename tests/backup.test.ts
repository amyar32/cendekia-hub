import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import Database from 'better-sqlite3';

const root = mkdtempSync(join(tmpdir(), 'cendekia-backup-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('backup dapat diverifikasi dan dipulihkan ke target kosong', () => {
  const sourceDatabase = join(root, 'source.sqlite');
  const sourceUploads = join(root, 'source-uploads');
  const backups = join(root, 'backups');
  const restoredDatabase = join(root, 'restored.sqlite');
  const restoredUploads = join(root, 'restored-uploads');
  mkdirSync(sourceUploads);
  writeFileSync(join(sourceUploads, 'document.txt'), 'dokumen penting');
  const database = new Database(sourceDatabase);
  database.exec("CREATE TABLE example(value TEXT); INSERT INTO example VALUES ('tersimpan')");
  database.close();

  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/backup.ts', '--output', backups],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_PATH: sourceDatabase,
        UPLOAD_STORAGE_PATH: sourceUploads,
      },
      encoding: 'utf8',
    },
  );
  const backupPath = output.trim().replace('Backup selesai: ', '');
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/verify-backup.ts', '--from', backupPath],
    { cwd: process.cwd() },
  );
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/restore-backup.ts',
      '--from',
      backupPath,
      '--database',
      restoredDatabase,
      '--uploads',
      restoredUploads,
      '--rollback-output',
      join(root, 'rollbacks'),
      '--confirm',
    ],
    { cwd: process.cwd() },
  );

  const restored = new Database(restoredDatabase, { readonly: true });
  assert.equal(
    (restored.prepare('SELECT value FROM example').get() as { value: string }).value,
    'tersimpan',
  );
  restored.close();
  assert.equal(readFileSync(join(restoredUploads, 'document.txt'), 'utf8'), 'dokumen penting');
});
