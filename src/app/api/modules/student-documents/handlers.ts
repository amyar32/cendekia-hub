import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  currentSchoolId,
  requireStudent,
  studentOptions,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const schema = z.object({
  student_id: z.string().uuid('Murid tidak valid.'),
  type: z.string().trim().min(1, 'Jenis dokumen wajib diisi.').max(100),
  file_url: z
    .string()
    .trim()
    .refine((value) => Boolean(uploadIdFromUrl(value)), 'File dokumen wajib diupload.'),
  description: z.string().trim().max(500).default(''),
});

export async function GET(request: Request) {
  try {
    await requireUser('student-documents.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const from = 'student_documents sd JOIN students s ON s.id=sd.student_id';
    const where = `s.school_id=? AND (sd.type LIKE ? OR sd.description LIKE ? OR s.name LIKE ? OR s.nis LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT sd.*,s.name AS student_name,s.nis,sd.type AS name FROM ${from} WHERE ${where}
       ORDER BY sd.created_at DESC LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)
        .get(schoolId, filter, filter, filter, filter) as { n: number }
    ).n;
    return Response.json(
      { rows, total, options: { student_id: studentOptions(schoolId) } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('student-documents.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db()
              .prepare(
                `SELECT sd.* FROM student_documents sd JOIN students s ON s.id=sd.student_id
         WHERE sd.id=? AND s.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM student_documents WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireStudent(schoolId, data.student_id);
        const uploadId = uploadIdFromUrl(data.file_url)!;
        if (
          !db()
            .prepare("SELECT id FROM uploads WHERE id=? AND scope='student.document'")
            .get(uploadId)
        )
          throw new HttpError(400, 'File hasil upload tidak valid.');
        details = data;
        const args = [data.student_id, data.type, data.file_url, data.description];
        if (method === 'POST')
          db()
            .prepare(
              'INSERT INTO student_documents(id,student_id,type,file_url,description) VALUES(?,?,?,?,?)',
            )
            .run(id, ...args);
        else
          db()
            .prepare(
              `UPDATE student_documents SET student_id=?,type=?,file_url=?,description=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(...args, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'student_documents',
        id,
        details,
      );
    })();
    return Response.json({ ok: true, id }, { status: method === 'POST' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}
export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
export const DELETE = (request: Request) => mutate(request, 'DELETE');
