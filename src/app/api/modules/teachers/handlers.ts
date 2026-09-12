import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';
import { hashPassword } from '@/lib/password';

const optionalDate = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.'),
]);
const schema = z.object({
  create_account: z.boolean().default(true),
  user_id: z.union([z.literal(''), z.string().uuid('Akun pengguna tidak valid.')]).default(''),
  photo_url: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || Boolean(uploadIdFromUrl(value)), 'Foto guru tidak valid.')
    .default(''),
  employee_code: z
    .string()
    .trim()
    .min(1, 'Kode Guru wajib diisi.')
    .max(30)
    .transform((v) => v.toUpperCase()),
  nip: z.string().trim().max(30).default(''),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  gender: z.enum(['male', 'female'], { error: 'Jenis kelamin wajib dipilih.' }),
  birth_date: optionalDate.default(''),
  blood_type: z.enum(['', 'A', 'B', 'AB', 'O']).default(''),
  phone: z.string().trim().max(30).default(''),
  email: z
    .email('Email guru wajib diisi dan harus valid.')
    .transform((value) => value.toLowerCase()),
  address: z.string().trim().max(500).default(''),
  join_date: optionalDate.default(''),
  employment_status: z.enum(['permanent', 'contract', 'honorary'], {
    error: 'Status kepegawaian wajib dipilih.',
  }),
  is_active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await requireUser('teachers.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `t.school_id=? AND (t.employee_code LIKE ? OR t.nip LIKE ? OR t.name LIKE ? OR t.email LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT t.*,u.email AS account_email,u.active AS account_active,u.must_change_password,
                CASE WHEN u.id IS NULL THEN 'none' WHEN u.active=0 THEN 'inactive'
                     WHEN u.must_change_password=1 THEN 'pending' ELSE 'active' END AS account_status,
                CASE t.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label,
                CASE t.employment_status WHEN 'permanent' THEN 'Tetap' WHEN 'contract' THEN 'Kontrak' ELSE 'Honorer' END AS employment_status_label
         FROM teachers t LEFT JOIN users u ON u.id=t.user_id WHERE ${where}
         ORDER BY t.is_active DESC,t.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM teachers t WHERE ${where}`)
        .get(schoolId, filter, filter, filter, filter) as { n: number }
    ).n;
    const users = db()
      .prepare(
        `SELECT u.id AS value,u.name || ' — ' || u.email AS label FROM users u WHERE u.active=1 AND (NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id=u.id) OR EXISTS (SELECT 1 FROM teachers t WHERE t.user_id=u.id AND t.school_id=?)) ORDER BY u.name`,
      )
      .all(schoolId);
    return Response.json(
      { rows, total, options: { user_id: users } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('teachers.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    let createdAccount: { email: string; temporary_password: string } | undefined;
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM teachers WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE') {
        if (previous?.user_id) {
          const linkedUser = db()
            .prepare('SELECT role_id FROM users WHERE id=?')
            .get(previous.user_id) as { role_id: string } | undefined;
          if (linkedUser?.role_id === 'teacher') {
            db().prepare('UPDATE users SET active=0 WHERE id=?').run(previous.user_id);
            db().prepare('DELETE FROM sessions WHERE user_id=?').run(previous.user_id);
          }
        }
        db().prepare('DELETE FROM teachers WHERE id=? AND school_id=?').run(id, schoolId);
      } else {
        const data = schema.parse(input);
        if (data.user_id && !db().prepare('SELECT id FROM users WHERE id=?').get(data.user_id))
          throw new HttpError(400, 'Akun pengguna tidak valid.');
        const photoUploadId = uploadIdFromUrl(data.photo_url);
        if (
          photoUploadId &&
          !db()
            .prepare("SELECT id FROM uploads WHERE id=? AND scope='teacher.photo'")
            .get(photoUploadId)
        )
          throw new HttpError(400, 'Foto hasil upload tidak valid.');
        let linkedUserId = data.user_id || null;
        if (method === 'POST' && !linkedUserId && data.create_account) {
          if (!data.email)
            throw new HttpError(400, 'Email wajib diisi untuk membuat akun aplikasi guru.');
          const duplicate = db().prepare('SELECT id FROM users WHERE email=?').get(data.email);
          if (duplicate) throw new HttpError(409, 'Email sudah digunakan oleh akun pengguna lain.');
          const teacherRole = db()
            .prepare("SELECT permissions FROM roles WHERE id='teacher'")
            .get() as { permissions: string } | undefined;
          if (!teacherRole)
            throw new HttpError(500, 'Role Guru belum tersedia. Jalankan seed database kembali.');
          if (
            (JSON.parse(teacherRole.permissions) as string[]).some(
              (permission) => !actor.permissions.includes(permission),
            )
          )
            throw new HttpError(403, 'Akses Anda tidak cukup untuk membuat akun dengan role Guru.');
          linkedUserId = randomUUID();
          const temporaryPassword = `Guru-${randomBytes(9).toString('base64url')}`;
          db()
            .prepare(
              `INSERT INTO users(id,name,email,password,role_id,active,must_change_password)
               VALUES(?,?,?,?,'teacher',?,1)`,
            )
            .run(
              linkedUserId,
              data.name,
              data.email,
              hashPassword(temporaryPassword),
              Number(data.is_active),
            );
          createdAccount = { email: data.email, temporary_password: temporaryPassword };
        }
        details = {
          ...data,
          account_created: Boolean(createdAccount),
          create_account: undefined,
        };
        const args = [
          linkedUserId,
          data.photo_url,
          data.employee_code,
          data.nip,
          data.name,
          data.gender,
          data.birth_date || null,
          data.blood_type,
          data.phone,
          data.email,
          data.address,
          data.join_date || null,
          data.employment_status,
          Number(data.is_active),
        ];
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO teachers(id,school_id,user_id,photo_url,employee_code,nip,name,gender,birth_date,blood_type,phone,email,address,join_date,employment_status,is_active,qr_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(id, schoolId, ...args, randomBytes(24).toString('hex'));
        else
          db()
            .prepare(
              `UPDATE teachers SET user_id=?,photo_url=?,employee_code=?,nip=?,name=?,gender=?,birth_date=?,blood_type=?,phone=?,email=?,address=?,join_date=?,employment_status=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(...args, id, schoolId);

        if (method === 'PATCH') {
          const previousUserId = previous?.user_id ? String(previous.user_id) : '';
          if (previousUserId && previousUserId !== linkedUserId) {
            const oldUser = db()
              .prepare('SELECT role_id FROM users WHERE id=?')
              .get(previousUserId) as { role_id: string } | undefined;
            if (oldUser?.role_id === 'teacher') {
              db().prepare('UPDATE users SET active=0 WHERE id=?').run(previousUserId);
              db().prepare('DELETE FROM sessions WHERE user_id=?').run(previousUserId);
            }
          }
          if (linkedUserId) {
            const linkedUser = db()
              .prepare('SELECT role_id FROM users WHERE id=?')
              .get(linkedUserId) as { role_id: string } | undefined;
            if (linkedUser?.role_id === 'teacher') {
              if (!data.email)
                throw new HttpError(400, 'Email wajib diisi selama akun aplikasi terhubung.');
              const duplicate = db()
                .prepare('SELECT id FROM users WHERE email=? AND id<>?')
                .get(data.email, linkedUserId);
              if (duplicate)
                throw new HttpError(409, 'Email sudah digunakan oleh akun pengguna lain.');
              db()
                .prepare('UPDATE users SET name=?,email=?,active=? WHERE id=?')
                .run(data.name, data.email, Number(data.is_active), linkedUserId);
              db().prepare('DELETE FROM sessions WHERE user_id=?').run(linkedUserId);
            }
          }
        }
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'teachers',
        id,
        details,
      );
    })();
    return Response.json(
      {
        ok: true,
        id,
        ...(createdAccount
          ? {
              account_email: createdAccount.email,
              temporary_password: createdAccount.temporary_password,
            }
          : {}),
      },
      { status: method === 'POST' ? 201 : 200 },
    );
  } catch (error) {
    return failure(error);
  }
}
export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
export const DELETE = (request: Request) => mutate(request, 'DELETE');
