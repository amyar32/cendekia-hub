import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Tanggal tidak valid.');

const academicYearSchema = z
  .object({
    name: z.string().trim().min(4, 'Nama minimal 4 karakter.').max(50),
    start_date: isoDate,
    end_date: isoDate,
    is_active: z.boolean().default(false),
  })
  .refine((data) => data.start_date < data.end_date, {
    message: 'Tanggal selesai harus setelah tanggal mulai.',
    path: ['end_date'],
  });

type AcademicYearRow = {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
};

function currentSchoolId() {
  const school = db()
    .prepare('SELECT id FROM schools ORDER BY is_active DESC, created_at LIMIT 1')
    .get() as { id: string } | undefined;
  if (!school)
    throw new HttpError(409, 'Lengkapi Pengaturan Sekolah sebelum membuat tahun ajaran.');
  return school.id;
}

export async function GET(request: Request) {
  try {
    await requireUser('academic-years.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare(
        `SELECT id, school_id, name, start_date, end_date, is_active, created_at, updated_at
         FROM academic_years
         WHERE school_id = ? AND name LIKE ?
         ORDER BY is_active DESC, start_date DESC
         LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, offset);
    const total = (
      db()
        .prepare('SELECT count(*) AS n FROM academic_years WHERE school_id = ? AND name LIKE ?')
        .get(schoolId, filter) as { n: number }
    ).n;
    return Response.json({ rows, total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('academic-years.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);

    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db()
              .prepare('SELECT * FROM academic_years WHERE id = ? AND school_id = ?')
              .get(id, schoolId) as AcademicYearRow | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');

      let details: unknown;
      if (method === 'DELETE') {
        db().prepare('DELETE FROM academic_years WHERE id = ? AND school_id = ?').run(id, schoolId);
        details = { name: previous?.name };
      } else {
        const data = academicYearSchema.parse(input);
        if (data.is_active) {
          db()
            .prepare(
              "UPDATE academic_years SET is_active = 0, updated_at = datetime('now') WHERE school_id = ? AND id <> ? AND is_active = 1",
            )
            .run(schoolId, id);
        }
        if (method === 'POST') {
          db()
            .prepare(
              'INSERT INTO academic_years(id, school_id, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(id, schoolId, data.name, data.start_date, data.end_date, Number(data.is_active));
        } else {
          db()
            .prepare(
              `UPDATE academic_years
               SET name = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = datetime('now')
               WHERE id = ? AND school_id = ?`,
            )
            .run(data.name, data.start_date, data.end_date, Number(data.is_active), id, schoolId);
        }
        details = data;
      }

      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'academic_years',
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
