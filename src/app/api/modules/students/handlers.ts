import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const optionalDate = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.'),
]);
const schema = z.object({
  nis: z
    .string()
    .trim()
    .min(1, 'NIS wajib diisi.')
    .max(30)
    .transform((v) => v.toUpperCase()),
  nisn: z.string().trim().max(30).default(''),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  gender: z.enum(['male', 'female'], { error: 'Jenis kelamin wajib dipilih.' }),
  birth_date: optionalDate.default(''),
  birth_place: z.string().trim().max(100).default(''),
  address: z.string().trim().max(500).default(''),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email('Email tidak valid.')]).default(''),
  enrollment_date: optionalDate.default(''),
  is_active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await requireUser('students.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `s.school_id=? AND (s.nis LIKE ? OR s.nisn LIKE ? OR s.name LIKE ? OR s.email LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT s.*,CASE s.gender WHEN 'male' THEN 'Laki-laki' ELSE 'Perempuan' END AS gender_label
       FROM students s WHERE ${where} ORDER BY s.is_active DESC,s.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM students s WHERE ${where}`)
        .get(schoolId, filter, filter, filter, filter) as { n: number }
    ).n;
    return Response.json({ rows, total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('students.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM students WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE')
        db().prepare('DELETE FROM students WHERE id=? AND school_id=?').run(id, schoolId);
      else {
        const data = schema.parse(input);
        details = data;
        const args = [
          data.nis,
          data.nisn,
          data.name,
          data.gender,
          data.birth_date || null,
          data.birth_place,
          data.address,
          data.phone,
          data.email,
          data.enrollment_date || null,
          Number(data.is_active),
        ];
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO students(id,school_id,nis,nisn,name,gender,birth_date,birth_place,address,phone,email,enrollment_date,is_active)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(id, schoolId, ...args);
        else
          db()
            .prepare(
              `UPDATE students SET nis=?,nisn=?,name=?,gender=?,birth_date=?,birth_place=?,address=?,phone=?,email=?,enrollment_date=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(...args, id, schoolId);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'students',
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
