import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const optionalDate = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.'),
]);
const schema = z.object({
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
    .min(1, 'Kode pegawai wajib diisi.')
    .max(30)
    .transform((v) => v.toUpperCase()),
  nip: z.string().trim().max(30).default(''),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  gender: z.enum(['male', 'female'], { error: 'Jenis kelamin wajib dipilih.' }),
  birth_date: optionalDate.default(''),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email('Email tidak valid.')]).default(''),
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
        `SELECT t.*, CASE t.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label, CASE t.employment_status WHEN 'permanent' THEN 'Tetap' WHEN 'contract' THEN 'Kontrak' ELSE 'Honorer' END AS employment_status_label FROM teachers t WHERE ${where} ORDER BY t.is_active DESC,t.name LIMIT 10 OFFSET ?`,
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
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM teachers WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE')
        db().prepare('DELETE FROM teachers WHERE id=? AND school_id=?').run(id, schoolId);
      else {
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
        details = data;
        const args = [
          data.user_id || null,
          data.photo_url,
          data.employee_code,
          data.nip,
          data.name,
          data.gender,
          data.birth_date || null,
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
              `INSERT INTO teachers(id,school_id,user_id,photo_url,employee_code,nip,name,gender,birth_date,phone,email,address,join_date,employment_status,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(id, schoolId, ...args);
        else
          db()
            .prepare(
              `UPDATE teachers SET user_id=?,photo_url=?,employee_code=?,nip=?,name=?,gender=?,birth_date=?,phone=?,email=?,address=?,join_date=?,employment_status=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(...args, id, schoolId);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'teachers',
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
