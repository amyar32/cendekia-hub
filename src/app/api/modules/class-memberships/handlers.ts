import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
  requireClass,
  requireStudent,
  studentOptions,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal mulai wajib diisi.');
const optionalDate = z.union([z.literal(''), date]);
const schema = z
  .object({
    student_id: z.string().uuid('Murid tidak valid.'),
    class_id: z.string().uuid('Rombel tidak valid.'),
    academic_year_id: z.string().uuid('Tahun ajaran tidak valid.'),
    start_date: date,
    end_date: optionalDate.default(''),
    status: z.enum(['active', 'completed', 'transferred', 'withdrawn'], {
      error: 'Status wajib dipilih.',
    }),
  })
  .refine((data) => !data.end_date || data.start_date <= data.end_date, {
    message: 'Tanggal selesai harus setelah tanggal mulai.',
  });

export async function GET(request: Request) {
  try {
    await requireUser('class-memberships.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const from = `class_memberships cm JOIN students s ON s.id=cm.student_id JOIN classes c ON c.id=cm.class_id JOIN academic_years ay ON ay.id=cm.academic_year_id`;
    const where = `s.school_id=? AND (s.name LIKE ? OR s.nis LIKE ? OR c.name LIKE ? OR ay.name LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT cm.*,s.name AS student_name,s.name AS name,s.nis,c.name AS class_name,ay.name AS academic_year_name,
       CASE cm.status WHEN 'active' THEN 'Aktif' WHEN 'completed' THEN 'Selesai' WHEN 'transferred' THEN 'Pindah' ELSE 'Keluar' END AS status_label
       FROM ${from} WHERE ${where} ORDER BY ay.is_active DESC,ay.start_date DESC,c.name,s.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)
        .get(schoolId, filter, filter, filter, filter) as { n: number }
    ).n;
    return Response.json(
      {
        rows,
        total,
        options: {
          student_id: studentOptions(schoolId),
          class_id: classOptions(schoolId),
          academic_year_id: academicYearOptions(schoolId),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('class-memberships.write');
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
                `SELECT cm.* FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         WHERE cm.id=? AND s.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM class_memberships WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireStudent(schoolId, data.student_id);
        requireAcademicYear(schoolId, data.academic_year_id);
        const classroom = requireClass(schoolId, data.class_id);
        if (classroom.academic_year_id !== data.academic_year_id)
          throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
        details = data;
        const args = [
          data.student_id,
          data.class_id,
          data.academic_year_id,
          data.start_date,
          data.end_date || null,
          data.status,
        ];
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,end_date,status)
                        VALUES(?,?,?,?,?,?,?)`,
            )
            .run(id, ...args);
        else
          db()
            .prepare(
              `UPDATE class_memberships SET student_id=?,class_id=?,academic_year_id=?,start_date=?,end_date=?,status=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(...args, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'class_memberships',
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
