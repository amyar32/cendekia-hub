import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  currentSchoolId,
  requireAcademicYear,
  requireSemester,
} from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z
  .object({
    academic_year_id: z.string().uuid('Tahun ajaran tidak valid.').optional(),
    extracurricular_id: z.string().uuid('Ekstrakurikuler tidak valid.'),
    teacher_id: z.string().uuid('Pembina tidak valid.'),
    semester_id: z
      .union([z.literal(''), z.literal('all'), z.string().uuid('Semester tidak valid.')])
      .default('all'),
    location: z.string().trim().max(100).default(''),
    map_url: z
      .union([z.literal(''), z.string().trim().url('Link Maps tidak valid.').max(1000)])
      .default(''),
    quota: z.coerce.number().int().min(0).max(1000).default(0),
    status: z.enum(['draft', 'active', 'completed']).default('draft'),
    student_ids: z.array(z.string().uuid('Murid tidak valid.')).max(1000).default([]),
  })
  .superRefine((data, context) => {
    if (new Set(data.student_ids).size !== data.student_ids.length)
      context.addIssue({
        code: 'custom',
        message: 'Daftar peserta memuat murid yang sama.',
        path: ['student_ids'],
      });
  });

type AssignmentRow = {
  id: string;
  extracurricular_id: string;
  teacher_id: string;
  academic_year_id: string;
  semester_id: string | null;
  location: string;
  map_url: string;
  quota: number;
  status: 'draft' | 'active' | 'completed';
};

function requireOwnedAssignment(schoolId: string, id: string) {
  const row = db()
    .prepare(
      `SELECT ea.* FROM extracurricular_assignments ea
       JOIN extracurriculars e ON e.id=ea.extracurricular_id
       WHERE ea.id=? AND e.school_id=?`,
    )
    .get(id, schoolId) as AssignmentRow | undefined;
  if (!row) throw new HttpError(404, 'Penugasan ekstrakurikuler tidak ditemukan.');
  return row;
}

function validateRelations(
  schoolId: string,
  id: string,
  academicYearId: string,
  data: z.infer<typeof schema>,
) {
  requireAcademicYear(schoolId, academicYearId);
  const extracurricular = db()
    .prepare('SELECT id,is_active,is_required FROM extracurriculars WHERE id=? AND school_id=?')
    .get(data.extracurricular_id, schoolId) as
    { id: string; is_active: number; is_required: number } | undefined;
  if (!extracurricular || (!extracurricular.is_active && data.status !== 'completed'))
    throw new HttpError(400, 'Ekstrakurikuler tidak aktif atau tidak valid.');
  const teacher = db()
    .prepare('SELECT id,is_active FROM teachers WHERE id=? AND school_id=?')
    .get(data.teacher_id, schoolId) as { id: string; is_active: number } | undefined;
  if (!teacher || (!teacher.is_active && data.status !== 'completed'))
    throw new HttpError(400, 'Pembina tidak aktif atau tidak valid.');

  const assignmentSemesterId =
    data.semester_id && data.semester_id !== 'all' ? data.semester_id : null;
  if (assignmentSemesterId) {
    const semester = requireSemester(schoolId, assignmentSemesterId);
    if (semester.academic_year_id !== academicYearId)
      throw new HttpError(400, 'Semester tidak berada pada tahun ajaran yang dipilih.');
  }

  const activeStudentIds = (
    db()
      .prepare(
        `SELECT DISTINCT s.id FROM students s
         JOIN class_memberships cm ON cm.student_id=s.id
         WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=? AND cm.status='active'
         ORDER BY s.name`,
      )
      .all(schoolId, academicYearId) as Array<{ id: string }>
  ).map((student) => student.id);
  const participantIds = extracurricular.is_required ? activeStudentIds : data.student_ids;
  const quota = extracurricular.is_required ? 0 : data.quota;
  if (quota > 0 && participantIds.length > quota)
    throw new HttpError(400, 'Jumlah peserta ekstrakurikuler melebihi kuota.');

  for (const studentId of participantIds) {
    const membership = db()
      .prepare(
        `SELECT s.id FROM students s JOIN class_memberships cm ON cm.student_id=s.id
         WHERE s.id=? AND s.school_id=? AND s.is_active=1 AND cm.academic_year_id=? AND cm.status='active'`,
      )
      .get(studentId, schoolId, academicYearId);
    if (!membership)
      throw new HttpError(
        400,
        'Semua peserta harus merupakan murid aktif pada tahun ajaran yang dipilih.',
      );
  }

  const schedules = db()
    .prepare(
      'SELECT id,semester_id,time_slot_id,weekday FROM extracurricular_schedules WHERE assignment_id=?',
    )
    .all(id) as Array<{ id: string; semester_id: string; time_slot_id: string; weekday: number }>;
  for (const schedule of schedules) {
    if (assignmentSemesterId && assignmentSemesterId !== schedule.semester_id)
      throw new HttpError(
        409,
        'Periode penugasan tidak dapat diubah karena jadwal berada pada semester lain.',
      );
    const lessonConflict = db()
      .prepare(
        `SELECT cs.id FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         WHERE cs.semester_id=? AND cs.weekday=? AND cs.time_slot_id=? AND ta.teacher_id=? LIMIT 1`,
      )
      .get(schedule.semester_id, schedule.weekday, schedule.time_slot_id, data.teacher_id);
    if (lessonConflict)
      throw new HttpError(409, 'Pembina memiliki jadwal pelajaran pada waktu tersebut.');
    const teacherConflict = db()
      .prepare(
        `SELECT es.id FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
         WHERE es.semester_id=? AND es.weekday=? AND es.time_slot_id=? AND ea.teacher_id=? AND ea.id<>? LIMIT 1`,
      )
      .get(schedule.semester_id, schedule.weekday, schedule.time_slot_id, data.teacher_id, id);
    if (teacherConflict)
      throw new HttpError(
        409,
        'Pembina sudah memiliki jadwal ekstrakurikuler pada waktu tersebut.',
      );
    if (data.location) {
      const locationConflict = db()
        .prepare(
          `SELECT es.id FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
           WHERE es.semester_id=? AND es.weekday=? AND es.time_slot_id=?
             AND lower(ea.location)=lower(?) AND ea.location<>'' AND ea.id<>? LIMIT 1`,
        )
        .get(schedule.semester_id, schedule.weekday, schedule.time_slot_id, data.location, id);
      if (locationConflict)
        throw new HttpError(
          409,
          'Lokasi sudah digunakan ekstrakurikuler lain pada waktu tersebut.',
        );
    }
    for (const studentId of participantIds) {
      const extracurricularConflict = db()
        .prepare(
          `SELECT es.id FROM extracurricular_schedules es
           JOIN extracurricular_participants ep ON ep.assignment_id=es.assignment_id
           WHERE es.semester_id=? AND es.weekday=? AND es.time_slot_id=?
             AND ep.student_id=? AND es.assignment_id<>? LIMIT 1`,
        )
        .get(schedule.semester_id, schedule.weekday, schedule.time_slot_id, studentId, id);
      if (extracurricularConflict)
        throw new HttpError(
          409,
          'Salah satu peserta memiliki jadwal ekstrakurikuler lain pada waktu tersebut.',
        );
      const classConflict = db()
        .prepare(
          `SELECT cs.id FROM class_schedules cs
           JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           JOIN class_memberships cm ON cm.class_id=ta.class_id AND cm.academic_year_id=ta.academic_year_id
           WHERE cs.semester_id=? AND cs.weekday=? AND cs.time_slot_id=?
             AND cm.student_id=? AND cm.status='active' LIMIT 1`,
        )
        .get(schedule.semester_id, schedule.weekday, schedule.time_slot_id, studentId);
      if (classConflict)
        throw new HttpError(
          409,
          'Salah satu peserta masih memiliki jadwal pelajaran pada waktu tersebut.',
        );
    }
  }

  return { assignmentSemesterId, participantIds, quota };
}

export async function GET(request: Request) {
  try {
    await requireUser('extracurricular-assignments.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const academicYearId =
      (url.searchParams.get('academic_year_id') || '').trim() || activeAcademicYear(schoolId).id;
    requireAcademicYear(schoolId, academicYearId);
    const { filter, offset } = listParams(request);
    const from = `extracurricular_assignments ea
      JOIN extracurriculars e ON e.id=ea.extracurricular_id
      JOIN teachers t ON t.id=ea.teacher_id
      JOIN academic_years ay ON ay.id=ea.academic_year_id
      LEFT JOIN semesters sm ON sm.id=ea.semester_id`;
    const where = `e.school_id=? AND ea.academic_year_id=? AND
      (e.name LIKE ? OR t.name LIKE ? OR ea.location LIKE ?)`;
    const baseRows = db()
      .prepare(
        `SELECT ea.*,e.name AS extracurricular_name,e.code AS extracurricular_code,e.is_required,
                t.name AS teacher_name,ay.name AS academic_year_name,
                COALESCE(sm.name,'Semua Semester') AS semester_name,
                CASE ea.status WHEN 'draft' THEN 'Draft' WHEN 'active' THEN 'Aktif' ELSE 'Selesai' END AS status_label,
                (SELECT count(*) FROM extracurricular_participants ep WHERE ep.assignment_id=ea.id) AS participant_count,
                (SELECT count(*) FROM extracurricular_schedules es WHERE es.assignment_id=ea.id) AS schedule_count
         FROM ${from} WHERE ${where}
         ORDER BY CASE ea.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,e.name
         LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, academicYearId, filter, filter, filter, offset) as Array<
      AssignmentRow & Record<string, unknown>
    >;
    const rows = baseRows.map((row) => ({
      ...row,
      name: row.extracurricular_name,
      student_ids: (
        db()
          .prepare(
            'SELECT student_id FROM extracurricular_participants WHERE assignment_id=? ORDER BY created_at',
          )
          .all(row.id) as Array<{ student_id: string }>
      ).map((item) => item.student_id),
    }));
    const total = (
      db()
        .prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)
        .get(schoolId, academicYearId, filter, filter, filter) as { n: number }
    ).n;
    const semesters = db()
      .prepare(
        `SELECT id AS value,name AS label FROM semesters WHERE academic_year_id=? ORDER BY period`,
      )
      .all(academicYearId);
    const students = db()
      .prepare(
        `SELECT DISTINCT s.id AS value,s.name || ' — ' || s.nis || ' · ' || c.name AS label
         FROM students s JOIN class_memberships cm ON cm.student_id=s.id JOIN classes c ON c.id=cm.class_id
         WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=? AND cm.status='active'
         ORDER BY s.name`,
      )
      .all(schoolId, academicYearId);
    return Response.json(
      {
        rows,
        total,
        selected: { academic_year_id: academicYearId },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          extracurricular_id: db()
            .prepare(
              `SELECT id AS value,code || ' — ' || name AS label,is_required FROM extracurriculars WHERE school_id=? AND is_active=1 ORDER BY name`,
            )
            .all(schoolId),
          teacher_id: db()
            .prepare(
              `SELECT id AS value,name || ' — ' || employee_code AS label FROM teachers WHERE school_id=? AND is_active=1 ORDER BY name`,
            )
            .all(schoolId),
          semester_id: [{ value: 'all', label: 'Semua Semester' }, ...semesters],
          student_ids: students,
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
    const actor = await requireUser('extracurricular-assignments.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous = method === 'POST' ? undefined : requireOwnedAssignment(schoolId, id);
      if (method === 'DELETE') {
        db().prepare('DELETE FROM extracurricular_assignments WHERE id=?').run(id);
        audit(actor.email, 'delete', 'extracurricular_assignments', id, previous);
        return;
      }
      const data = schema.parse(input);
      const academicYearId =
        method === 'POST'
          ? data.academic_year_id || activeAcademicYear(schoolId).id
          : previous!.academic_year_id;
      const {
        assignmentSemesterId: semesterId,
        participantIds,
        quota,
      } = validateRelations(schoolId, id, academicYearId, data);
      const args = [
        data.extracurricular_id,
        data.teacher_id,
        academicYearId,
        semesterId,
        data.location,
        data.map_url,
        quota,
        data.status,
      ];
      if (method === 'POST')
        db()
          .prepare(
            `INSERT INTO extracurricular_assignments(id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,map_url,quota,status)
                      VALUES(?,?,?,?,?,?,?,?,?)`,
          )
          .run(id, ...args);
      else
        db()
          .prepare(
            `UPDATE extracurricular_assignments SET extracurricular_id=?,teacher_id=?,academic_year_id=?,semester_id=?,location=?,map_url=?,quota=?,status=?,updated_at=datetime('now') WHERE id=?`,
          )
          .run(...args, id);
      db().prepare('DELETE FROM extracurricular_participants WHERE assignment_id=?').run(id);
      const insertParticipant = db().prepare(
        `INSERT INTO extracurricular_participants(id,assignment_id,student_id) VALUES(?,?,?)`,
      );
      for (const studentId of participantIds) insertParticipant.run(randomUUID(), id, studentId);
      audit(
        actor.email,
        method === 'POST' ? 'create' : 'update',
        'extracurricular_assignments',
        id,
        {
          extracurricular_id: data.extracurricular_id,
          teacher_id: data.teacher_id,
          academic_year_id: academicYearId,
          semester_id: semesterId,
          location: data.location,
          map_url: data.map_url,
          quota,
          status: data.status,
          participant_count: participantIds.length,
        },
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
