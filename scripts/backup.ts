import { resolve } from 'node:path';
import { argument, createBackup } from './backup-core';

async function main() {
  const destination = await createBackup({
    databasePath: resolve(process.env.DATABASE_PATH || './data/cms.sqlite'),
    uploadsPath: resolve(process.env.UPLOAD_STORAGE_PATH || './data/uploads'),
    outputRoot: resolve(
      argument('--output') || process.env.BACKUP_STORAGE_PATH || './data/backups',
    ),
  });
  console.log(`Backup selesai: ${destination}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
