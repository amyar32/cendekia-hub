import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  academicYearOptions,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
  requireClass,
  requireSemester,
  requireSubject,
  requireTeacher,
  semesterOptions,
  subjectOptions,
  teacherOptions,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  academic_year_id: z.string().uuid('Tahun ajaran tidak valid.').optional(),
  teacher_id: z.string().uuid('Guru tidak valid.'),
  subject_id: z.string().uuid('Mata pelajaran tidak valid.'),
  class_id: z.string().uuid('Rombel tidak valid.'),
  semester_id: z
    .union([z.literal(''), z.literal('all'), z.string().uuid('Semester tidak valid.')])
    .default('all'),
});
export async function GET(request: Request) {
  try {
    await requireUser('teaching-assignments.read');
    const schoolId = currentSchoolId();
    const activeYear = activeAcademicYear(schoolId);
    const url = new URL(request.url);
    const selectedYear = (url.searchParams.get('academic_year_id') || '').trim() || activeYear.id;
    requireAcademicYear(schoolId, selectedYear);
    const selectedClass = z
      .union([z.literal(''), z.string().uuid('Filter rombel tidak valid.')])
      .parse((url.searchParams.get('class_id') || '').trim());
    const selectedSubject = z
      .union([z.literal(''), z.string().uuid('Filter mata pelajaran tidak valid.')])
      .parse((url.searchParams.get('subject_id') || '').trim());
    if (selectedClass) {
      const classroom = requireClass(schoolId, selectedClass);
      if (classroom.academic_year_id !== selectedYear)
        throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
    }
    if (selectedSubject) requireSubject(schoolId, selectedSubject);
    const { filter, offset } = listParams(request);
    const from = `teaching_assignments ta JOIN teachers t ON t.id=ta.teacher_id JOIN subjects s ON s.id=ta.subject_id JOIN classes c ON c.id=ta.class_id JOIN academic_years ay ON ay.id=ta.academic_year_id LEFT JOIN semesters sm ON sm.id=ta.semester_id`;
    const whereParts = [
      't.school_id=?',
      'ta.academic_year_id=?',
      `(t.name LIKE ? OR s.name LIKE ? OR c.name LIKE ? OR ay.name LIKE ? OR COALESCE(sm.name,'') LIKE ?)`,
    ];
    const params: unknown[] = [schoolId, selectedYear, filter, filter, filter, filter, filter];
    if (selectedClass) {
      whereParts.push('ta.class_id=?');
      params.push(selectedClass);
    }
    if (selectedSubject) {
      whereParts.push('ta.subject_id=?');
      params.push(selectedSubject);
    }
    const where = whereParts.join(' AND ');
    const rows = db()
      .prepare(
        `SELECT ta.*,t.name AS teacher_name,t.name AS name,s.name AS subject_name,c.name AS class_name,ay.name AS academic_year_name,COALESCE(sm.name,'Semua Semester') AS semester_name FROM ${from} WHERE ${where} ORDER BY ay.is_active DESC,ay.start_date DESC,c.name,s.name,t.name LIMIT 10 OFFSET ?`,
      )
      .all(...params, offset);
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)
        .get(...params) as { n: number }
    ).n;
    return Response.json(
      {
        rows,
        total,
        selected: {
          academic_year_id: selectedYear,
          class_id: selectedClass,
          subject_id: selectedSubject,
        },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          teacher_id: teacherOptions(schoolId),
          subject_id: subjectOptions(schoolId),
          class_id: classOptions(schoolId, selectedYear),
          semester_id: [
            { value: 'all', label: 'Semua Semester' },
            ...semesterOptions(schoolId, selectedYear),
          ],
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
    const actor = await requireUser('teaching-assignments.write');
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
                `SELECT ta.* FROM teaching_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.id=? AND t.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') db().prepare('DELETE FROM teaching_assignments WHERE id=?').run(id);
      else {
        const data = schema.parse(input);
        requireTeacher(schoolId, data.teacher_id);
        requireSubject(schoolId, data.subject_id);
        const academicYearId =
          method === 'POST'
            ? data.academic_year_id || activeAcademicYear(schoolId).id
            : String(previous!.academic_year_id);
        requireAcademicYear(schoolId, academicYearId);
        const classroom = requireClass(schoolId, data.class_id);
        if (classroom.academic_year_id !== academicYearId)
          throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
        if (data.semester_id && data.semester_id !== 'all') {
          const semester = requireSemester(schoolId, data.semester_id);
          if (semester.academic_year_id !== academicYearId)
            throw new HttpError(400, 'Semester tidak berada pada tahun ajaran yang dipilih.');
        }
        details = data;
        const args = [
          data.teacher_id,
          data.subject_id,
          data.class_id,
          academicYearId,
          data.semester_id === 'all' || !data.semester_id ? null : data.semester_id,
        ];
        if (method === 'POST')
          db()
            .prepare(
              'INSERT INTO teaching_assignments(id,teacher_id,subject_id,class_id,academic_year_id,semester_id) VALUES(?,?,?,?,?,?)',
            )
            .run(id, ...args);
        else
          db()
            .prepare(
              `UPDATE teaching_assignments SET teacher_id=?,subject_id=?,class_id=?,academic_year_id=?,semester_id=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(...args, id);
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'teaching_assignments',
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
