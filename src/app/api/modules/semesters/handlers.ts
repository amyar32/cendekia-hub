import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  currentSchoolId,
  requireAcademicYear,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.');
const schema = z
  .object({
    academic_year_id: z.string().uuid('Tahun ajaran tidak valid.'),
    name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(50),
    period: z.coerce.number().int().min(1).max(2),
    start_date: isoDate,
    end_date: isoDate,
    is_active: z.boolean().default(false),
  })
  .refine((value) => value.start_date < value.end_date, {
    message: 'Tanggal selesai harus setelah tanggal mulai.',
    path: ['end_date'],
  });

export async function GET(request: Request) {
  try {
    await requireUser('semesters.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `ay.school_id = ? AND (s.name LIKE ? OR ay.name LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT s.*, ay.name AS academic_year_name FROM semesters s
       JOIN academic_years ay ON ay.id = s.academic_year_id
       WHERE ${where} ORDER BY s.is_active DESC, ay.start_date DESC, s.period LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, offset);
    const total = (
      db()
        .prepare(
          `SELECT count(*) AS n FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id WHERE ${where}`,
        )
        .get(schoolId, filter, filter) as { n: number }
    ).n;
    return Response.json(
      { rows, total, options: { academic_year_id: academicYearOptions(schoolId) } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('semesters.write');
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
                `SELECT s.* FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id WHERE s.id=? AND ay.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE') db().prepare('DELETE FROM semesters WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        const year = requireAcademicYear(schoolId, data.academic_year_id);
        if (data.start_date < year.start_date || data.end_date > year.end_date)
          throw new HttpError(400, 'Periode semester harus berada dalam rentang tahun ajaran.');
        if (data.is_active)
          db()
            .prepare(
              `UPDATE semesters SET is_active=0, updated_at=datetime('now') WHERE id<>? AND academic_year_id IN (SELECT id FROM academic_years WHERE school_id=?) AND is_active=1`,
            )
            .run(id, schoolId);
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active) VALUES(?,?,?,?,?,?,?)`,
            )
            .run(
              id,
              data.academic_year_id,
              data.name,
              data.period,
              data.start_date,
              data.end_date,
              Number(data.is_active),
            );
        else
          db()
            .prepare(
              `UPDATE semesters SET academic_year_id=?,name=?,period=?,start_date=?,end_date=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              data.academic_year_id,
              data.name,
              data.period,
              data.start_date,
              data.end_date,
              Number(data.is_active),
              id,
            );
        details = data;
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'semesters',
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
