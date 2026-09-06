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

const schema = z.object({
  student_id: z.string().uuid('Murid tidak valid.'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  relation: z.string().trim().min(1, 'Hubungan wajib diisi.').max(50),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email('Email tidak valid.')]).default(''),
  address: z.string().trim().max(500).default(''),
  is_primary: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    await requireUser('guardians.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const from = 'guardians g JOIN students s ON s.id=g.student_id';
    const where = `s.school_id=? AND (g.name LIKE ? OR g.relation LIKE ? OR g.phone LIKE ? OR s.name LIKE ? OR s.nis LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT g.*,s.name AS student_name,s.nis,g.name AS name,
       CASE WHEN g.is_primary=1 THEN 'Utama' ELSE 'Pendamping' END AS primary_label
       FROM ${from} WHERE ${where} ORDER BY g.is_primary DESC,s.name,g.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)
        .get(schoolId, filter, filter, filter, filter, filter) as { n: number }
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
    const actor = await requireUser('guardians.write');
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
                `SELECT g.* FROM guardians g JOIN students s ON s.id=g.student_id
         WHERE g.id=? AND s.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM guardians WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireStudent(schoolId, data.student_id);
        details = data;
        const args = [
          data.student_id,
          data.name,
          data.relation,
          data.phone,
          data.email,
          data.address,
          Number(data.is_primary),
        ];
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO guardians(id,student_id,name,relation,phone,email,address,is_primary)
                        VALUES(?,?,?,?,?,?,?,?)`,
            )
            .run(id, ...args);
        else
          db()
            .prepare(
              `UPDATE guardians SET student_id=?,name=?,relation=?,phone=?,email=?,address=?,is_primary=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(...args, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'guardians',
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
