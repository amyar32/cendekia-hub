import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Permission } from '@/config/modules';

export const uploadScopes = {
  'school.logo': {
    readPermission: 'school.read',
    writePermission: 'school.write',
    public: true,
    maxBytes: 5 * 1024 * 1024,
  },
} as const satisfies Record<
  string,
  {
    readPermission: Permission;
    writePermission: Permission;
    public: boolean;
    maxBytes: number;
  }
>;

export type UploadScope = keyof typeof uploadScopes;

export type UploadRow = {
  id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size: number;
  scope: UploadScope;
  created_by: string;
  created_at: string;
};

const imageTypes = {
  'image/jpeg': {
    extension: '.jpg',
    matches: (bytes: Uint8Array) =>
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9,
  },
  'image/png': {
    extension: '.png',
    matches: (bytes: Uint8Array) =>
      bytes.length >= 33 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a &&
      String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR' &&
      new DataView(bytes.buffer, bytes.byteOffset + 16, 8).getUint32(0) > 0 &&
      new DataView(bytes.buffer, bytes.byteOffset + 16, 8).getUint32(4) > 0,
  },
  'image/webp': {
    extension: '.webp',
    matches: (bytes: Uint8Array) =>
      bytes.length >= 16 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16))) &&
      new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true) === bytes.length - 8,
  },
} as const;

export function isUploadScope(value: string): value is UploadScope {
  return Object.hasOwn(uploadScopes, value);
}

export function validateImage(bytes: Uint8Array, mimeType: string) {
  const type = imageTypes[mimeType as keyof typeof imageTypes];
  if (!type || !type.matches(bytes)) {
    throw new Error('File harus berupa gambar PNG, JPEG, atau WebP yang valid.');
  }
  return type.extension;
}

function storageRoot() {
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_STORAGE_PATH || './data/uploads');
}

function storagePath(key: string) {
  const root = storageRoot();
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error('Storage key tidak valid.');
  return path;
}

export async function storeUpload(bytes: Uint8Array, extension: string) {
  const now = new Date();
  const key = `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${extension}`;
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

export function safeOriginalName(name: string) {
  const normalized = name.trim().replace(/[\\/\0\r\n]/g, '_');
  return (normalized || 'image').slice(0, 255);
}

export function uploadUrl(id: string) {
  return `/api/uploads/${id}`;
}

export function uploadIdFromUrl(url: string) {
  return /^\/api\/uploads\/([0-9a-f-]{36})$/.exec(url)?.[1] ?? null;
}
