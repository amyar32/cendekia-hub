import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  currentSchoolId,
  requireSubject,
  requireTeacher,
  subjectOptions,
  teacherOptions,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  teacher_id: z.string().uuid('Guru tidak valid.'),
  subject_id: z.string().uuid('Mata pelajaran tidak valid.'),
});
export async function GET(request: Request) {
  try {
    await requireUser('teacher-subjects.read');
    const schoolId = currentSchoolId();
    const { filter, offset } = listParams(request);
    const where = `t.school_id=? AND (t.name LIKE ? OR t.employee_code LIKE ? OR s.name LIKE ? OR s.code LIKE ?)`;
    const from = `teacher_subjects ts JOIN teachers t ON t.id=ts.teacher_id JOIN subjects s ON s.id=ts.subject_id`;
    const rows = db()
      .prepare(
        `SELECT ts.*,t.name AS teacher_name,t.name AS name,t.employee_code,s.name AS subject_name,s.code AS subject_code FROM ${from} WHERE ${where} ORDER BY t.name,s.name LIMIT 10 OFFSET ?`,
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
        options: { teacher_id: teacherOptions(schoolId), subject_id: subjectOptions(schoolId) },
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
    const actor = await requireUser('teacher-subjects.write');
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
                `SELECT ts.* FROM teacher_subjects ts JOIN teachers t ON t.id=ts.teacher_id WHERE ts.id=? AND t.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM teacher_subjects WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireTeacher(schoolId, data.teacher_id);
        requireSubject(schoolId, data.subject_id);
        details = data;
        if (method === 'POST')
          db()
            .prepare('INSERT INTO teacher_subjects(id,teacher_id,subject_id) VALUES(?,?,?)')
            .run(id, data.teacher_id, data.subject_id);
        else
          db()
            .prepare(
              `UPDATE teacher_subjects SET teacher_id=?,subject_id=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(data.teacher_id, data.subject_id, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'teacher_subjects',
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
