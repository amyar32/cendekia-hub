import { unlinkSync } from 'node:fs';
import { db } from '@/lib/db';
import { storagePath } from './storage';
import { uploadUrl } from './url';

function uploadIsReferenced(id: string) {
  const url = uploadUrl(id);
  const row = db()
    .prepare(
      `SELECT (
        EXISTS(SELECT 1 FROM schools WHERE logo_url=? OR principal_signature_url=? OR schedule_bell_sound_url=?) OR
        EXISTS(SELECT 1 FROM teachers WHERE photo_url=?) OR
        EXISTS(SELECT 1 FROM students WHERE photo_url=?) OR
        EXISTS(SELECT 1 FROM student_documents WHERE file_url=?) OR
        EXISTS(SELECT 1 FROM student_applications WHERE photo_url=?) OR
        EXISTS(SELECT 1 FROM application_documents WHERE file_url=?)
      ) AS referenced`,
    )
    .get(url, url, url, url, url, url, url, url) as { referenced: number };
  return Boolean(row.referenced);
}

/** Removes old uploads that were never attached or are no longer referenced by application data. */
export function pruneOrphanedUploads(options: { graceHours?: number; limit?: number } = {}) {
  const graceHours = Math.max(1, Math.floor(options.graceHours ?? 24));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 50)));
  const candidates = db()
    .prepare(
      `SELECT id,storage_key FROM uploads
       WHERE created_at<datetime('now',?) ORDER BY created_at LIMIT ?`,
    )
    .all(`-${graceHours} hours`, limit) as Array<{ id: string; storage_key: string }>;
  let removed = 0;
  for (const candidate of candidates) {
    const didRemove = db().transaction(() => {
      if (uploadIsReferenced(candidate.id)) return false;
      try {
        unlinkSync(storagePath(candidate.storage_key));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      const result = db().prepare('DELETE FROM uploads WHERE id=?').run(candidate.id);
      return result.changes === 1;
    })();
    if (didRemove) removed += 1;
  }
  return removed;
}

export function runUploadMaintenance() {
  try {
    pruneOrphanedUploads();
  } catch (error) {
    console.error('Cleanup upload yatim gagal.', error);
  }
}
