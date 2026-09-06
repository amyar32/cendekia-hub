import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  currentSchoolId,
  gradeOptions,
  requireAcademicYear,
  requireGrade,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  academic_year_id: z.string().uuid('Tahun ajaran tidak valid.'),
  grade_id: z.string().uuid('Tingkat / kelas tidak valid.'),
  name: z.string().trim().min(1, 'Nama wajib diisi.').max(50),
  capacity: z.coerce.number().int().min(0, 'Kapasitas tidak boleh negatif.').max(1000),
  is_active: z.boolean().default(true),
});
export async function GET(request: Request) {
  try {
    await requireUser('classes.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `c.school_id=? AND (c.name LIKE ? OR ay.name LIKE ? OR g.name LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT c.*,ay.name AS academic_year_name,g.name AS grade_name FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id JOIN grades g ON g.id=c.grade_id WHERE ${where} ORDER BY ay.is_active DESC,ay.start_date DESC,g.level_order,c.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, filter, filter, offset);
    const total = (
      db()
        .prepare(
          `SELECT count(*) AS n FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id JOIN grades g ON g.id=c.grade_id WHERE ${where}`,
        )
        .get(schoolId, filter, filter, filter) as { n: number }
    ).n;
    return Response.json(
      {
        rows,
        total,
        options: {
          academic_year_id: academicYearOptions(schoolId),
          grade_id: gradeOptions(schoolId),
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
    const actor = await requireUser('classes.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db().prepare('SELECT * FROM classes WHERE id=? AND school_id=?').get(id, schoolId) as
              Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = { name: previous?.name };
      if (method === 'DELETE')
        db().prepare('DELETE FROM classes WHERE id=? AND school_id=?').run(id, schoolId);
      else {
        const data = schema.parse(input);
        requireAcademicYear(schoolId, data.academic_year_id);
        requireGrade(schoolId, data.grade_id);
        details = data;
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO classes(id,school_id,academic_year_id,grade_id,name,capacity,is_active) VALUES(?,?,?,?,?,?,?)`,
            )
            .run(
              id,
              schoolId,
              data.academic_year_id,
              data.grade_id,
              data.name,
              data.capacity,
              Number(data.is_active),
            );
        else
          db()
            .prepare(
              `UPDATE classes SET academic_year_id=?,grade_id=?,name=?,capacity=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(
              data.academic_year_id,
              data.grade_id,
              data.name,
              data.capacity,
              Number(data.is_active),
              id,
              schoolId,
            );
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'classes',
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
