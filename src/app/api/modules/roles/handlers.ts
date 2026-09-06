import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { permissions } from '@/config/modules';
import { listParams } from '@/app/api/modules/_shared/list-params';

const roleSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  description: z.string().trim().max(500).default(''),
  permissions: z.array(z.enum(permissions)).max(permissions.length),
});

type StoredRole = {
  id: string;
  name: string;
  permissions: string;
  system: number;
};

export async function GET(request: Request) {
  try {
    await requireUser('roles.read');
    const { filter, offset } = listParams(request);
    const storedRows = db()
      .prepare('SELECT * FROM roles WHERE name LIKE ? ORDER BY name LIMIT 10 OFFSET ?')
      .all(filter, offset) as StoredRole[];
    const rows = storedRows.map((role) => ({
      ...role,
      permissions: JSON.parse(role.permissions) as string[],
    }));
    const total = (
      db().prepare('SELECT count(*) AS n FROM roles WHERE name LIKE ?').get(filter) as { n: number }
    ).n;

    return Response.json({ rows, total, roles: [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('roles.write');
    const input = await request.json();
    const id = method === 'POST' ? randomUUID() : z.string().min(1).parse(input.id);

    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM roles WHERE id=?').get(id) as StoredRole | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      if (previous?.system)
        throw new HttpError(403, 'Role sistem tidak dapat diubah atau dihapus.');
      if (
        previous &&
        actor.role_id !== 'admin' &&
        (JSON.parse(previous.permissions) as string[]).some(
          (permission) => !actor.permissions.includes(permission),
        )
      ) {
        throw new HttpError(403, 'Role ini berada di luar akses Anda.');
      }
      if (id === actor.role_id) throw new HttpError(403, 'Anda tidak dapat mengubah role sendiri.');

      let details: unknown;
      if (method === 'DELETE') {
        db().prepare('DELETE FROM roles WHERE id=?').run(id);
        details = { name: previous?.name };
      } else {
        const data = roleSchema.parse(input);
        const oldGrants = previous ? (JSON.parse(previous.permissions) as string[]) : [];
        if (
          actor.role_id !== 'admin' &&
          [...data.permissions, ...oldGrants].some(
            (permission) => !actor.permissions.includes(permission),
          )
        ) {
          throw new HttpError(403, 'Anda tidak dapat mengelola permission di luar akses Anda.');
        }

        details = data;
        if (method === 'POST') {
          db()
            .prepare('INSERT INTO roles(id,name,description,permissions) VALUES (?,?,?,?)')
            .run(id, data.name, data.description, JSON.stringify(data.permissions));
        } else {
          db()
            .prepare('UPDATE roles SET name=?,description=?,permissions=? WHERE id=?')
            .run(data.name, data.description, JSON.stringify(data.permissions), id);
        }
      }

      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'roles',
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
