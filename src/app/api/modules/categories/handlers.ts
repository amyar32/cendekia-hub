import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { failure } from '@/lib/http';
import { listParams } from '@/app/api/modules/_shared/list-params';

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  description: z.string().trim().max(500).default(''),
  active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await requireUser('categories.read');
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare('SELECT * FROM categories WHERE name LIKE ? ORDER BY name LIMIT 10 OFFSET ?')
      .all(filter, offset);
    const total = (
      db().prepare('SELECT count(*) AS n FROM categories WHERE name LIKE ?').get(filter) as {
        n: number;
      }
    ).n;

    return Response.json({ rows, total, roles: [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('categories.write');
    const input = await request.json();
    const id = method === 'POST' ? randomUUID() : z.string().min(1).parse(input.id);

    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM categories WHERE id=?').get(id) as
              { name: string } | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');

      let details: unknown;
      if (method === 'DELETE') {
        db().prepare('DELETE FROM categories WHERE id=?').run(id);
        details = { name: previous?.name };
      } else {
        const data = categorySchema.parse(input);
        details = data;
        if (method === 'POST') {
          db()
            .prepare('INSERT INTO categories(id,name,description,active) VALUES (?,?,?,?)')
            .run(id, data.name, data.description, Number(data.active));
        } else {
          db()
            .prepare('UPDATE categories SET name=?,description=?,active=? WHERE id=?')
            .run(data.name, data.description, Number(data.active), id);
        }
      }

      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'categories',
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
