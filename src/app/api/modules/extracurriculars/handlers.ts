import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kode wajib diisi.')
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  category: z.string().trim().max(50).default(''),
  description: z.string().trim().max(500).default(''),
  is_required: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await requireUser('extracurriculars.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `school_id=? AND (code LIKE ? OR name LIKE ? OR category LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT *,CASE WHEN is_required=1 THEN 'Wajib' ELSE 'Pilihan' END AS requirement_label
         FROM extracurriculars WHERE ${where}
         ORDER BY is_active DESC,name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM extracurriculars WHERE ${where}`)
        .get(schoolId, filter, filter, filter) as { n: number }
    ).n;
    return Response.json({ rows, total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('extracurriculars.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db()
              .prepare('SELECT * FROM extracurriculars WHERE id=? AND school_id=?')
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') {
        db().prepare('DELETE FROM extracurriculars WHERE id=? AND school_id=?').run(id, schoolId);
      } else {
        const data = schema.parse(input);
        details = data;
        const args = [
          data.code,
          data.name,
          data.category,
          data.description,
          Number(data.is_required),
          Number(data.is_active),
        ];
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO extracurriculars(id,school_id,code,name,category,description,is_required,is_active)
                        VALUES(?,?,?,?,?,?,?,?)`,
            )
            .run(id, schoolId, ...args);
        else
          db()
            .prepare(
              `UPDATE extracurriculars SET code=?,name=?,category=?,description=?,is_required=?,is_active=?,updated_at=datetime('now')
                        WHERE id=? AND school_id=?`,
            )
            .run(...args, id, schoolId);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'extracurriculars',
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
