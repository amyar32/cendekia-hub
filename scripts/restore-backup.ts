import { resolve } from 'node:path';
import { argument, restoreBackup } from './backup-core';

async function main() {
  const backupPath = argument('--from');
  if (!backupPath) throw new Error('Gunakan --from <direktori-backup>.');
  if (!process.argv.includes('--confirm'))
    throw new Error('Restore membuang data aktif. Hentikan aplikasi lalu tambahkan --confirm.');

  const rollback = await restoreBackup({
    backupPath,
    databasePath: resolve(
      argument('--database') || process.env.DATABASE_PATH || './data/cms.sqlite',
    ),
    uploadsPath: resolve(
      argument('--uploads') || process.env.UPLOAD_STORAGE_PATH || './data/uploads',
    ),
    rollbackRoot: resolve(
      argument('--rollback-output') ||
        process.env.BACKUP_STORAGE_PATH ||
        './data/restore-rollbacks',
    ),
  });

  console.log('Restore selesai dan backup telah diverifikasi.');
  if (rollback) console.log(`Salinan data sebelum restore: ${rollback}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
