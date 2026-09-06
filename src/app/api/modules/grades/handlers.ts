import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi.').max(50),
  level_order: z.coerce.number().int().min(1, 'Urutan minimal 1.').max(99),
  description: z.string().trim().max(500).default(''),
  is_active: z.boolean().default(true),
});
export async function GET(request: Request) {
  try {
    await requireUser('grades.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare(
        `SELECT * FROM grades WHERE school_id=? AND (name LIKE ? OR description LIKE ?) ORDER BY level_order,name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, offset);
    const total = (
      db()
        .prepare(
          `SELECT count(*) AS n FROM grades WHERE school_id=? AND (name LIKE ? OR description LIKE ?)`,
        )
        .get(schoolId, filter, filter) as { n: number }
    ).n;
    return Response.json({ rows, total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('grades.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM grades WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE')
        db().prepare('DELETE FROM grades WHERE id=? AND school_id=?').run(id, schoolId);
      else {
        const data = schema.parse(input);
        details = data;
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO grades(id,school_id,name,level_order,description,is_active) VALUES(?,?,?,?,?,?)`,
            )
            .run(
              id,
              schoolId,
              data.name,
              data.level_order,
              data.description,
              Number(data.is_active),
            );
        else
          db()
            .prepare(
              `UPDATE grades SET name=?,level_order=?,description=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(
              data.name,
              data.level_order,
              data.description,
              Number(data.is_active),
              id,
              schoolId,
            );
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'grades',
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
