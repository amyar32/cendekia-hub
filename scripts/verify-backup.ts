import { argument, verifyBackup } from './backup-core';

const backupPath = argument('--from');
if (!backupPath) throw new Error('Gunakan --from <direktori-backup>.');
const manifest = verifyBackup(backupPath);
console.log(`Backup valid: ${backupPath} (${manifest.files.length} file)`);
