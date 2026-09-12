import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { hashPassword } from '@/lib/password';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';

const userSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  role_id: z.string().min(1),
  teacher_id: z.union([z.literal(''), z.string().uuid('Guru tidak valid.')]).default(''),
  active: z.boolean().default(true),
  password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128).optional(),
});

type StoredUser = {
  id: string;
  name: string;
  email: string;
  role_id: string;
  active: number;
};

export async function GET(request: Request) {
  try {
    const user = await requireUser('users.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare(
        `SELECT u.id,u.name,u.email,u.role_id,u.active,u.created_at,r.name AS role,
                COALESCE(t.id,'') AS teacher_id,COALESCE(t.name,'') AS teacher_name
         FROM users u JOIN roles r ON r.id=u.role_id
         LEFT JOIN teachers t ON t.user_id=u.id AND t.school_id=?
         WHERE u.name LIKE ? OR u.email LIKE ?
         ORDER BY u.created_at DESC,u.id LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, offset);
    const total = (
      db()
        .prepare('SELECT count(*) AS n FROM users WHERE name LIKE ? OR email LIKE ?')
        .get(filter, filter) as { n: number }
    ).n;
    const roles = user.permissions.includes('users.write')
      ? db().prepare('SELECT id,name FROM roles ORDER BY name').all()
      : [];
    const teacherRows = user.permissions.includes('users.write')
      ? (db()
          .prepare(
            `SELECT id AS value,name,email,
                    name || ' — ' || employee_code ||
                      CASE WHEN is_active=0 THEN ' (nonaktif)'
                           WHEN user_id IS NOT NULL THEN ' (sudah terhubung)'
                           ELSE '' END AS label,
                    CASE WHEN is_active=0 OR user_id IS NOT NULL THEN 1 ELSE 0 END AS disabled
             FROM teachers WHERE school_id=? ORDER BY is_active DESC,name`,
          )
          .all(schoolId) as Array<{
          value: string;
          name: string;
          email: string;
          label: string;
          disabled: number;
        }>)
      : [];
    const teachers = teacherRows.map(({ disabled, ...teacher }) =>
      disabled ? { ...teacher, disabled: true } : teacher,
    );

    return Response.json(
      { rows, total, roles, options: { teacher_id: teachers } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('users.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id = method === 'POST' ? randomUUID() : z.string().min(1).parse(input.id);

    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM users WHERE id=?').get(id) as StoredUser | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      if (id === actor.id)
        throw new HttpError(400, 'Gunakan pengaturan akun untuk akun Anda sendiri.');

      if (previous && actor.role_id !== 'admin') {
        const oldRole = db()
          .prepare('SELECT permissions FROM roles WHERE id=?')
          .get(previous.role_id) as { permissions: string };
        if (
          (JSON.parse(oldRole.permissions) as string[]).some(
            (permission) => !actor.permissions.includes(permission),
          )
        ) {
          throw new HttpError(403, 'Pengguna ini berada di luar akses Anda.');
        }
      }

      if (
        previous?.role_id === 'admin' &&
        previous.active &&
        (method === 'DELETE' || input.role_id !== 'admin' || input.active === false)
      ) {
        const count = db()
          .prepare("SELECT count(*) AS n FROM users WHERE role_id='admin' AND active=1")
          .get() as { n: number };
        if (count.n <= 1)
          throw new HttpError(400, 'Minimal satu administrator aktif harus tersedia.');
      }

      if (
        actor.role_id !== 'admin' &&
        (previous?.role_id === 'admin' || input.role_id === 'admin')
      ) {
        throw new HttpError(403, 'Hanya administrator yang dapat mengelola administrator.');
      }

      let details: unknown;
      if (method === 'DELETE') {
        db().prepare('DELETE FROM users WHERE id=?').run(id);
        details = { name: previous?.name };
      } else {
        const data = userSchema.parse(input);
        if (method === 'POST' && !data.password)
          throw new HttpError(400, 'Kata sandi wajib diisi.');

        const teacher = data.teacher_id
          ? (db()
              .prepare('SELECT id,user_id,is_active FROM teachers WHERE id=? AND school_id=?')
              .get(data.teacher_id, schoolId) as
              { id: string; user_id: string | null; is_active: number } | undefined)
          : undefined;
        if (data.teacher_id && (!teacher || (!teacher.is_active && teacher.user_id !== id)))
          throw new HttpError(400, 'Guru tidak aktif atau tidak valid.');
        if (teacher?.user_id && teacher.user_id !== id)
          throw new HttpError(409, 'Guru tersebut sudah terhubung ke akun pengguna lain.');

        const role = db().prepare('SELECT permissions FROM roles WHERE id=?').get(data.role_id) as
          { permissions: string } | undefined;
        if (!role) throw new HttpError(400, 'Role tidak ditemukan.');
        const previousRole = previous
          ? (db().prepare('SELECT permissions FROM roles WHERE id=?').get(previous.role_id) as {
              permissions: string;
            })
          : undefined;
        if (
          actor.role_id !== 'admin' &&
          [...JSON.parse(role.permissions), ...JSON.parse(previousRole?.permissions || '[]')].some(
            (permission: string) => !actor.permissions.includes(permission),
          )
        ) {
          throw new HttpError(403, 'Role ini berada di luar akses Anda.');
        }

        details = {
          name: data.name,
          email: data.email,
          role_id: data.role_id,
          teacher_id: data.teacher_id || null,
          active: data.active,
        };
        if (method === 'POST') {
          db()
            .prepare(
              'INSERT INTO users(id,name,email,password,role_id,active) VALUES (?,?,?,?,?,?)',
            )
            .run(
              id,
              data.name,
              data.email,
              hashPassword(data.password!),
              data.role_id,
              Number(data.active),
            );
        } else {
          db()
            .prepare('UPDATE users SET name=?,email=?,role_id=?,active=? WHERE id=?')
            .run(data.name, data.email, data.role_id, Number(data.active), id);
          if (data.password) {
            db()
              .prepare('UPDATE users SET password=? WHERE id=?')
              .run(hashPassword(data.password), id);
          }
          db().prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        }

        db()
          .prepare(
            `UPDATE teachers SET user_id=NULL,updated_at=datetime('now')
             WHERE user_id=? AND (?='' OR id<>?)`,
          )
          .run(id, data.teacher_id, data.teacher_id);
        if (data.teacher_id)
          db()
            .prepare("UPDATE teachers SET user_id=?,updated_at=datetime('now') WHERE id=?")
            .run(id, data.teacher_id);
      }

      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'users',
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
