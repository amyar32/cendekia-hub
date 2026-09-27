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

export function safeOriginalName(name: string) {
  const normalized = name.trim().replace(/[\\/\0\r\n]/g, '_');
  return (normalized || 'image').slice(0, 255);
}
