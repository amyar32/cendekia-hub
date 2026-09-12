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
    kind: 'image',
  },
  'school.principal-signature': {
    readPermission: 'school.read',
    writePermission: 'school.write',
    public: true,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'teacher.photo': {
    readPermission: 'teachers.read',
    writePermission: 'teachers.write',
    public: false,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'student.photo': {
    readPermission: 'students.read',
    writePermission: 'students.write',
    public: false,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'student.document': {
    readPermission: 'students.read',
    writePermission: 'students.write',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    kind: 'document',
  },
  'schedule.bell-audio': {
    readPermission: null,
    writePermission: 'schedules.write',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    kind: 'audio',
  },
} as const satisfies Record<
  string,
  {
    readPermission: Permission | null;
    writePermission: Permission;
    public: boolean;
    maxBytes: number;
    kind: 'image' | 'document' | 'audio';
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

export function validateDocument(bytes: Uint8Array, mimeType: string) {
  if (
    mimeType === 'application/pdf' &&
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  )
    return '.pdf';
  return validateImage(bytes, mimeType);
}

export function validateAudio(bytes: Uint8Array, mimeType: string) {
  const prefix = (length: number, offset = 0) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  const hasMpegFrame = (offset: number) =>
    bytes.length >= offset + 3 &&
    bytes[offset] === 0xff &&
    (bytes[offset + 1] & 0xe0) === 0xe0 &&
    ((bytes[offset + 1] >> 3) & 0x03) !== 0x01 &&
    ((bytes[offset + 1] >> 1) & 0x03) !== 0 &&
    bytes[offset + 2] >> 4 !== 0 &&
    bytes[offset + 2] >> 4 !== 0x0f &&
    ((bytes[offset + 2] >> 2) & 0x03) !== 0x03;
  let mp3FrameOffset = 0;
  if (bytes.length >= 10 && prefix(3) === 'ID3') {
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    mp3FrameOffset = 10 + tagSize + (bytes[5] & 0x10 ? 10 : 0);
  }
  const isMp3 =
    ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'].includes(mimeType) && hasMpegFrame(mp3FrameOffset);
  if (isMp3) return '.mp3';
  if (
    ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(mimeType) &&
    bytes.length >= 44 &&
    prefix(4) === 'RIFF' &&
    prefix(4, 8) === 'WAVE' &&
    new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true) <= bytes.length - 8
  )
    return '.wav';
  if (
    ['audio/ogg', 'application/ogg'].includes(mimeType) &&
    bytes.length >= 27 &&
    prefix(4) === 'OggS' &&
    bytes[4] === 0
  )
    return '.ogg';
  throw new Error('File harus berupa audio MP3, WAV, atau OGG yang valid.');
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
