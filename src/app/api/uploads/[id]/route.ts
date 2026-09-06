import { db } from '@/lib/db';
import { failure } from '@/lib/http';
import { HttpError, requireUser } from '@/lib/auth';
import { readUpload, type UploadRow, uploadScopes } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const upload = db().prepare('SELECT * FROM uploads WHERE id = ?').get(id) as
      UploadRow | undefined;
    if (!upload) throw new HttpError(404, 'Gambar tidak ditemukan.');

    const scope = uploadScopes[upload.scope];
    if (!scope) throw new HttpError(404, 'Gambar tidak ditemukan.');
    if (!scope.public) await requireUser(scope.readPermission);

    let bytes: Buffer;
    try {
      bytes = await readUpload(upload.storage_key);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new HttpError(404, 'Gambar tidak ditemukan.');
      }
      throw error;
    }

    const body = Uint8Array.from(bytes).buffer;
    return new Response(body, {
      headers: {
        'Content-Type': upload.mime_type,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
