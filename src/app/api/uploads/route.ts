import { randomUUID } from 'node:crypto';
import { HttpError, checkOrigin, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import {
  isUploadScope,
  removeUpload,
  safeOriginalName,
  storeUpload,
  uploadScopes,
  uploadUrl,
  validateImage,
  validateDocument,
  validateAudio,
} from '@/lib/uploads';
import { runUploadMaintenance } from '@/lib/uploads/maintenance';
import { assertUploadRequestSize } from '@/lib/uploads/request';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    checkOrigin(request);
    const largestUpload = Math.max(...Object.values(uploadScopes).map((scope) => scope.maxBytes));
    assertUploadRequestSize(request, {
      maxFileBytes: largestUpload,
      missingContentLengthMessage: 'Content-Length wajib dikirim untuk upload file.',
    });
    const form = await request.formData();
    const scopeValue = form.get('scope');
    const file = form.get('file');

    if (typeof scopeValue !== 'string' || !isUploadScope(scopeValue)) {
      throw new HttpError(400, 'Tujuan upload tidak valid.');
    }
    const scope = uploadScopes[scopeValue];
    const actor = await requireUser(scope.writePermission);
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(400, 'Pilih file yang akan diupload.');
    }
    if (file.size > scope.maxBytes) {
      throw new HttpError(413, `Ukuran file maksimal ${scope.maxBytes / 1024 / 1024} MB.`);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let extension: string;
    try {
      extension =
        scope.kind === 'image'
          ? validateImage(bytes, file.type)
          : scope.kind === 'audio'
            ? validateAudio(bytes, file.type)
            : validateDocument(bytes, file.type);
    } catch (error) {
      throw new HttpError(415, error instanceof Error ? error.message : 'Format file tidak valid.');
    }

    const id = randomUUID();
    const originalName = safeOriginalName(file.name);
    storedKey = await storeUpload(
      bytes,
      extension,
      scope.kind === 'image' ? 'images' : scope.kind === 'audio' ? 'audio' : 'documents',
    );
    const storageKey = storedKey;
    db().transaction(() => {
      db()
        .prepare(
          `INSERT INTO uploads(id, storage_key, original_name, mime_type, size, scope, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, storageKey, originalName, file.type, file.size, scopeValue, actor.id);
      audit(actor.email, 'upload', 'uploads', id, {
        name: originalName,
        mime_type: file.type,
        size: file.size,
        scope: scopeValue,
      });
    })();
    storedKey = null;
    runUploadMaintenance();

    return Response.json(
      {
        upload: {
          id,
          url: uploadUrl(id),
          name: originalName,
          mime_type: file.type,
          size: file.size,
          scope: scopeValue,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (storedKey) await removeUpload(storedKey);
    return failure(error);
  }
}
