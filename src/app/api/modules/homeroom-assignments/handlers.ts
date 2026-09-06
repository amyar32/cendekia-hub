import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
  requireClass,
  requireTeacher,
  teacherOptions,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  teacher_id: z.string().uuid('Guru tidak valid.'),
  class_id: z.string().uuid('Rombel tidak valid.'),
  academic_year_id: z.string().uuid('Tahun ajaran tidak valid.'),
});
export async function GET(request: Request) {
  try {
    await requireUser('homeroom-assignments.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const from = `homeroom_assignments ha JOIN teachers t ON t.id=ha.teacher_id JOIN classes c ON c.id=ha.class_id JOIN academic_years ay ON ay.id=ha.academic_year_id`;
    const where = `t.school_id=? AND (t.name LIKE ? OR t.employee_code LIKE ? OR c.name LIKE ? OR ay.name LIKE ?)`;
    const rows = db()
      .prepare(
        `SELECT ha.*,t.name AS teacher_name,t.name AS name,t.employee_code,c.name AS class_name,ay.name AS academic_year_name FROM ${from} WHERE ${where} ORDER BY ay.is_active DESC,ay.start_date DESC,c.name LIMIT 10 OFFSET ?`,
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
          teacher_id: teacherOptions(schoolId),
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
    const actor = await requireUser('homeroom-assignments.write');
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
                `SELECT ha.* FROM homeroom_assignments ha JOIN teachers t ON t.id=ha.teacher_id WHERE ha.id=? AND t.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM homeroom_assignments WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireTeacher(schoolId, data.teacher_id);
        requireAcademicYear(schoolId, data.academic_year_id);
        const classroom = requireClass(schoolId, data.class_id);
        if (classroom.academic_year_id !== data.academic_year_id)
          throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
        details = data;
        const args = [data.teacher_id, data.class_id, data.academic_year_id];
        if (method === 'POST')
          db()
            .prepare(
              'INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id) VALUES(?,?,?,?)',
            )
            .run(id, ...args);
        else
          db()
            .prepare(
              `UPDATE homeroom_assignments SET teacher_id=?,class_id=?,academic_year_id=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(...args, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'homeroom_assignments',
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
