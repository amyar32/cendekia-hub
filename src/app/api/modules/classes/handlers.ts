import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
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
  is_active: z.boolean().default(true),
});
export async function GET(request: Request) {
  try {
    await requireUser('classes.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const viewClassId = url.searchParams.get('view_class_id');
    if (viewClassId) {
      const classId = z.string().uuid('ID rombel tidak valid.').parse(viewClassId);
      const classroom = db()
        .prepare(
          `SELECT c.id,c.name,g.name AS grade_name,ay.name AS academic_year_name
           FROM classes c JOIN grades g ON g.id=c.grade_id JOIN academic_years ay ON ay.id=c.academic_year_id
           WHERE c.id=? AND c.school_id=?`,
        )
        .get(classId, schoolId) as
        { id: string; name: string; grade_name: string; academic_year_name: string } | undefined;
      if (!classroom) throw new HttpError(404, 'Rombel tidak ditemukan.');
      const students = db()
        .prepare(
          `SELECT s.id,s.nis,s.name,s.gender
           FROM class_memberships cm JOIN students s ON s.id=cm.student_id
           WHERE cm.class_id=? AND cm.status='active' AND s.school_id=?
           ORDER BY s.name`,
        )
        .all(classId, schoolId);
      return Response.json({ classroom, students }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const { filter, offset } = listParams(request);
    const selectedYear =
      (url.searchParams.get('academic_year_id') || '').trim() || activeAcademicYear(schoolId).id;
    requireAcademicYear(schoolId, selectedYear);
    const whereParts = ['c.school_id=?', '(c.name LIKE ? OR ay.name LIKE ? OR g.name LIKE ?)'];
    const params: unknown[] = [schoolId, filter, filter, filter];
    if (selectedYear) {
      whereParts.push('c.academic_year_id = ?');
      params.push(selectedYear);
    }
    const where = whereParts.join(' AND ');
    const rows = db()
      .prepare(
        `SELECT c.*,ay.name AS academic_year_name,g.name AS grade_name,
          (SELECT count(*) FROM class_memberships cm WHERE cm.class_id=c.id AND cm.status='active') AS student_count
         FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id JOIN grades g ON g.id=c.grade_id
         WHERE ${where} ORDER BY ay.is_active DESC,ay.start_date DESC,g.level_order,c.name LIMIT 10 OFFSET ?`,
      )
      .all(...params, offset);
    const total = (
      db()
        .prepare(
          `SELECT count(*) AS n FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id JOIN grades g ON g.id=c.grade_id WHERE ${where}`,
        )
        .get(...params) as { n: number }
    ).n;
    return Response.json(
      {
        rows,
        total,
        selected: { academic_year_id: selectedYear },
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
        const academicYearId = data.academic_year_id;
        requireAcademicYear(schoolId, academicYearId);
        requireGrade(schoolId, data.grade_id);
        details = data;
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO classes(id,school_id,academic_year_id,grade_id,name,is_active) VALUES(?,?,?,?,?,?)`,
            )
            .run(id, schoolId, academicYearId, data.grade_id, data.name, Number(data.is_active));
        else
          db()
            .prepare(
              `UPDATE classes SET academic_year_id=?,grade_id=?,name=?,is_active=?,updated_at=datetime('now') WHERE id=? AND school_id=?`,
            )
            .run(academicYearId, data.grade_id, data.name, Number(data.is_active), id, schoolId);
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
