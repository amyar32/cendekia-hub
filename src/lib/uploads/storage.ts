import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

function storageRoot() {
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_STORAGE_PATH || './data/uploads');
}

export function storagePath(key: string) {
  const root = storageRoot();
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error('Storage key tidak valid.');
  return path;
}

export async function storeUpload(bytes: Uint8Array, extension: string, folder = 'images') {
  const now = new Date();
  const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${extension}`;
  const path = storagePath(key);
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
  return key;
}

export async function readUpload(key: string) {
  return readFile(storagePath(key));
}

export async function removeUpload(key: string) {
  try {
    await unlink(storagePath(key));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}
