import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';

const manifestName = 'manifest.json';
const databaseName = 'database.sqlite';

type BackupFile = { path: string; bytes: number; sha256: string };
type BackupManifest = {
  format: 1;
  created_at: string;
  database: string;
  uploads: string;
  files: BackupFile[];
};

function pathInside(parent: string, child: string) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace('.', '-');
}

function hashFile(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function filesIn(root: string, current = root): BackupFile[] {
  if (!existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return filesIn(root, path);
    if (!entry.isFile() || path === join(root, manifestName)) return [];
    return [
      {
        path: relative(root, path).split(sep).join('/'),
        bytes: statSync(path).size,
        sha256: hashFile(path),
      },
    ];
  });
}

function assertHealthyDatabase(path: string) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('quick_check') as Array<Record<string, string>>;
    if (result.length !== 1 || Object.values(result[0])[0] !== 'ok')
      throw new Error(`Pemeriksaan SQLite gagal: ${JSON.stringify(result)}`);
  } finally {
    database.close();
  }
}

export function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function createBackup(options: {
  databasePath: string;
  uploadsPath: string;
  outputRoot: string;
}) {
  const databasePath = resolve(options.databasePath);
  const uploadsPath = resolve(options.uploadsPath);
  const outputRoot = resolve(options.outputRoot);
  if (!existsSync(databasePath)) throw new Error(`Database tidak ditemukan: ${databasePath}`);
  if (pathInside(uploadsPath, outputRoot))
    throw new Error('Direktori backup tidak boleh berada di dalam direktori upload.');

  mkdirSync(outputRoot, { recursive: true });
  const name = `cendekia-backup-${timestamp()}`;
  const partial = join(outputRoot, `.${name}.partial-${process.pid}`);
  const destination = join(outputRoot, name);
  mkdirSync(partial);
  try {
    const source = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(join(partial, databaseName));
    } finally {
      source.close();
    }
    assertHealthyDatabase(join(partial, databaseName));
    const uploadsDestination = join(partial, 'uploads');
    if (existsSync(uploadsPath)) cpSync(uploadsPath, uploadsDestination, { recursive: true });
    else mkdirSync(uploadsDestination);

    const manifest: BackupManifest = {
      format: 1,
      created_at: new Date().toISOString(),
      database: databaseName,
      uploads: 'uploads',
      files: filesIn(partial).sort((left, right) => left.path.localeCompare(right.path)),
    };
    writeFileSync(join(partial, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(partial, destination);
    return destination;
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}

export function verifyBackup(backupPath: string) {
  const root = resolve(backupPath);
  const manifestPath = join(root, manifestName);
  if (!existsSync(manifestPath))
    throw new Error(`Manifest backup tidak ditemukan: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
  if (manifest.format !== 1 || manifest.database !== databaseName || manifest.uploads !== 'uploads')
    throw new Error('Format manifest backup tidak didukung.');
  if (!Array.isArray(manifest.files)) throw new Error('Daftar file pada manifest tidak valid.');

  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (!pathInside(root, path)) throw new Error(`Path backup tidak aman: ${file.path}`);
    if (!existsSync(path) || !statSync(path).isFile())
      throw new Error(`File backup tidak ditemukan: ${file.path}`);
    if (statSync(path).size !== file.bytes || hashFile(path) !== file.sha256)
      throw new Error(`Checksum backup tidak cocok: ${file.path}`);
  }
  const actualFiles = filesIn(root)
    .map((file) => file.path)
    .sort();
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
    throw new Error('Isi backup berbeda dari manifest.');
  assertHealthyDatabase(join(root, manifest.database));
  return manifest;
}

export async function restoreBackup(options: {
  backupPath: string;
  databasePath: string;
  uploadsPath: string;
  rollbackRoot: string;
}) {
  const backupPath = resolve(options.backupPath);
  const databasePath = resolve(options.databasePath);
  const uploadsPath = resolve(options.uploadsPath);
  verifyBackup(backupPath);
  if (pathInside(backupPath, databasePath) || pathInside(backupPath, uploadsPath))
    throw new Error('Target restore tidak boleh berada di dalam direktori backup.');

  const rollbackRoot = resolve(options.rollbackRoot);
  let rollbackPath: string | null = null;
  if (existsSync(databasePath)) {
    rollbackPath = await createBackup({ databasePath, uploadsPath, outputRoot: rollbackRoot });
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(dirname(uploadsPath), { recursive: true });
  const stagedDatabase = join(
    dirname(databasePath),
    `.${basename(databasePath)}.restore-${process.pid}`,
  );
  const stagedUploads = join(
    dirname(uploadsPath),
    `.${basename(uploadsPath)}.restore-${process.pid}`,
  );
  try {
    copyFileSync(join(backupPath, databaseName), stagedDatabase);
    assertHealthyDatabase(stagedDatabase);
    cpSync(join(backupPath, 'uploads'), stagedUploads, { recursive: true });

    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    renameSync(stagedDatabase, databasePath);
    rmSync(uploadsPath, { recursive: true, force: true });
    renameSync(stagedUploads, uploadsPath);
    return rollbackPath;
  } catch (error) {
    rmSync(stagedDatabase, { force: true });
    rmSync(stagedUploads, { recursive: true, force: true });
    throw error;
  }
}
