import { randomUUID } from 'node:crypto';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError } from '@/lib/auth';
import { admissionRateLimit } from '@/lib/admissions-public';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';
import {
  removeUpload,
  safeOriginalName,
  storeUpload,
  uploadUrl,
  validateDocument,
} from '@/lib/uploads';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    checkOrigin(request);
    admissionRateLimit(request);
    const form = await request.formData();
    const file = form.get('file');
    const trackingToken = form.get('tracking_token');
    const type = form.get('type');
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Pilih dokumen.');
    if (file.size > 10 * 1024 * 1024) throw new HttpError(413, 'Ukuran dokumen maksimal 10 MB.');
    if (typeof trackingToken !== 'string' || !/^(?:\d{6}|[a-f0-9]{48})$/.test(trackingToken))
      throw new HttpError(400, 'Token pendaftaran tidak valid.');
    if (typeof type !== 'string' || !type.trim() || type.length > 100)
      throw new HttpError(400, 'Jenis dokumen wajib diisi.');
    const schoolId = currentSchoolId();
    const application = db()
      .prepare('SELECT id,status FROM student_applications WHERE school_id=? AND tracking_token=?')
      .get(schoolId, trackingToken) as { id: string; status: string } | undefined;
    if (!application || !['submitted', 'needs_revision'].includes(application.status))
      throw new HttpError(409, 'Dokumen pendaftaran ini tidak dapat diubah.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let extension: string;
    try {
      extension = validateDocument(bytes, file.type);
    } catch (error) {
      throw new HttpError(
        415,
        error instanceof Error ? error.message : 'Format dokumen tidak valid.',
      );
    }
    storedKey = await storeUpload(bytes, extension, 'documents');
    const uploadId = randomUUID();
    const documentId = randomUUID();
    db().transaction(() => {
      db()
        .prepare(
          'INSERT INTO uploads(id,storage_key,original_name,mime_type,size,scope,created_by) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          uploadId,
          storedKey,
          safeOriginalName(file.name),
          file.type,
          file.size,
          'admission.document',
          `public:${application.id}`,
        );
      db()
        .prepare(
          'INSERT INTO application_documents(id,application_id,type,file_url,description) VALUES(?,?,?,?,?)',
        )
        .run(
          documentId,
          application.id,
          type.trim(),
          uploadUrl(uploadId),
          'Diupload oleh pendaftar',
        );
    })();
    storedKey = null;
    return Response.json({ ok: true, id: documentId, url: uploadUrl(uploadId) }, { status: 201 });
  } catch (error) {
    if (storedKey) await removeUpload(storedKey);
    return failure(error);
  }
}
