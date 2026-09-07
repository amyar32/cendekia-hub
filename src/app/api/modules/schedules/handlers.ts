import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
  requireClass,
  requireSemester,
  semesterOptions,
  teacherOptions,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  teaching_assignment_id: z.string().uuid('Penugasan mengajar tidak valid.'),
  semester_id: z.string().uuid('Semester tidak valid.'),
  time_slot_id: z.string().uuid('Slot waktu tidak valid.'),
  weekday: z.coerce.number().int().min(1).max(6),
});

type Assignment = {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  academic_year_id: string;
  semester_id: string | null;
};

function requireAssignment(schoolId: string, id: string) {
  const assignment = db()
    .prepare(
      `SELECT ta.* FROM teaching_assignments ta
       JOIN teachers t ON t.id=ta.teacher_id
       WHERE ta.id=? AND t.school_id=?`,
    )
    .get(id, schoolId) as Assignment | undefined;
  if (!assignment) throw new HttpError(400, 'Penugasan mengajar tidak valid.');
  return assignment;
}

function validateSchedule(schoolId: string, id: string, data: z.infer<typeof schema>) {
  const assignment = requireAssignment(schoolId, data.teaching_assignment_id);
  const semester = requireSemester(schoolId, data.semester_id);
  if (semester.academic_year_id !== assignment.academic_year_id)
    throw new HttpError(400, 'Semester dan penugasan harus berada pada tahun ajaran yang sama.');
  if (assignment.semester_id && assignment.semester_id !== semester.id)
    throw new HttpError(400, 'Penugasan mengajar tidak berlaku pada semester ini.');
  const slot = db()
    .prepare('SELECT id,is_break,is_active FROM schedule_time_slots WHERE id=? AND school_id=?')
    .get(data.time_slot_id, schoolId) as
    { id: string; is_break: number; is_active: number } | undefined;
  if (!slot || !slot.is_active)
    throw new HttpError(400, 'Slot waktu tidak aktif atau tidak valid.');
  if (slot.is_break) throw new HttpError(400, 'Slot istirahat tidak dapat diisi pelajaran.');

  const classConflict = db()
    .prepare(
      `SELECT cs.id FROM class_schedules cs
       JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       WHERE cs.semester_id=? AND cs.weekday=? AND cs.time_slot_id=?
         AND ta.class_id=? AND cs.id<>?`,
    )
    .get(data.semester_id, data.weekday, data.time_slot_id, assignment.class_id, id);
  if (classConflict)
    throw new HttpError(409, 'Rombel sudah memiliki pelajaran pada waktu tersebut.');

  const teacherConflict = db()
    .prepare(
      `SELECT cs.id FROM class_schedules cs
       JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       WHERE cs.semester_id=? AND cs.weekday=? AND cs.time_slot_id=?
         AND ta.teacher_id=? AND cs.id<>?`,
    )
    .get(data.semester_id, data.weekday, data.time_slot_id, assignment.teacher_id, id);
  if (teacherConflict)
    throw new HttpError(409, 'Guru sudah mengajar rombel lain pada waktu tersebut.');
  return assignment;
}

export async function GET(request: Request) {
  try {
    await requireUser('schedules.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const academicYearId =
      (url.searchParams.get('academic_year_id') || '').trim() || activeAcademicYear(schoolId).id;
    const selectedAcademicYear = requireAcademicYear(schoolId, academicYearId);
    const availableSemesters = semesterOptions(schoolId, academicYearId);
    const semesterId =
      (url.searchParams.get('semester_id') || '').trim() ||
      ((
        db()
          .prepare(
            `SELECT id FROM semesters WHERE academic_year_id=? ORDER BY is_active DESC,period LIMIT 1`,
          )
          .get(academicYearId) as { id: string } | undefined
      )?.id ??
        '');
    if (semesterId) {
      const semester = requireSemester(schoolId, semesterId);
      if (semester.academic_year_id !== academicYearId)
        throw new HttpError(400, 'Semester tidak berada pada tahun ajaran yang dipilih.');
    }

    const view = url.searchParams.get('view') === 'teacher' ? 'teacher' : 'class';
    const requestedEntity = (
      url.searchParams.get(view === 'class' ? 'class_id' : 'teacher_id') || ''
    ).trim();
    const defaultEntity =
      view === 'class'
        ? (classOptions(schoolId, academicYearId)[0]?.value ?? '')
        : ((
            db()
              .prepare(
                `SELECT DISTINCT t.id AS value FROM teachers t
               JOIN teaching_assignments ta ON ta.teacher_id=t.id
               WHERE t.school_id=? AND ta.academic_year_id=? ORDER BY t.name LIMIT 1`,
              )
              .get(schoolId, academicYearId) as { value: string } | undefined
          )?.value ?? '');
    const entityId = requestedEntity || defaultEntity;
    if (view === 'class' && entityId) {
      const classroom = requireClass(schoolId, entityId);
      if (classroom.academic_year_id !== academicYearId)
        throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
    }

    const entityClause = view === 'class' ? 'ta.class_id=?' : 'ta.teacher_id=?';
    const entries =
      semesterId && entityId
        ? db()
            .prepare(
              `SELECT cs.*,ta.teacher_id,ta.subject_id,ta.class_id,t.name AS teacher_name,
                      s.name AS subject_name,s.code AS subject_code,c.name AS class_name
               FROM class_schedules cs
               JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
               JOIN teachers t ON t.id=ta.teacher_id
               JOIN subjects s ON s.id=ta.subject_id
               JOIN classes c ON c.id=ta.class_id
               WHERE cs.semester_id=? AND ${entityClause}
               ORDER BY cs.weekday,cs.time_slot_id`,
            )
            .all(semesterId, entityId)
        : [];
    const slots = db()
      .prepare(
        `SELECT * FROM schedule_time_slots sts WHERE sts.school_id=? AND
         (sts.is_active=1 OR EXISTS (
           SELECT 1 FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           WHERE cs.time_slot_id=sts.id AND cs.semester_id=? AND ${entityClause}
         )) ORDER BY sts.slot_order,sts.start_time`,
      )
      .all(schoolId, semesterId || '', entityId || '');
    const assignments =
      semesterId && entityId
        ? db()
            .prepare(
              `SELECT ta.id AS value,s.code || ' — ' || s.name || ' · ' || t.name ||
                      CASE WHEN ?='teacher' THEN ' · ' || c.name ELSE '' END AS label
               FROM teaching_assignments ta
               JOIN teachers t ON t.id=ta.teacher_id
               JOIN subjects s ON s.id=ta.subject_id
               JOIN classes c ON c.id=ta.class_id
               WHERE ta.academic_year_id=? AND ${entityClause}
                 AND (ta.semester_id IS NULL OR ta.semester_id=?)
               ORDER BY s.name,t.name,c.name`,
            )
            .all(view, academicYearId, entityId, semesterId)
        : [];
    const copySemesters = db()
      .prepare(
        `SELECT s.id AS value,ay.name || ' · ' || s.name AS label,s.academic_year_id
         FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id
         WHERE ay.school_id=? AND ay.start_date<=? AND s.id<>?
         ORDER BY ay.start_date DESC,s.period`,
      )
      .all(schoolId, selectedAcademicYear.start_date, semesterId || '') as Array<{
      value: string;
      label: string;
      academic_year_id: string;
    }>;
    const copyClasses = db()
      .prepare(
        `SELECT c.id AS value,c.name || ' — ' || ay.name AS label,c.name,c.grade_id,
                c.academic_year_id
         FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id
         WHERE c.school_id=? AND ay.start_date<=? AND c.is_active=1
         ORDER BY ay.start_date DESC,c.name`,
      )
      .all(schoolId, selectedAcademicYear.start_date);

    return Response.json(
      {
        entries,
        slots,
        assignments,
        selected: {
          academic_year_id: academicYearId,
          semester_id: semesterId,
          view,
          [view === 'class' ? 'class_id' : 'teacher_id']: entityId,
        },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          semester_id: availableSemesters,
          class_id: classOptions(schoolId, academicYearId),
          teacher_id: teacherOptions(schoolId),
          copy_semester_id: copySemesters,
          copy_class_id: copyClasses,
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
    const actor = await requireUser('schedules.write');
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
                `SELECT cs.* FROM class_schedules cs
                 JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
                 JOIN teachers t ON t.id=ta.teacher_id
                 WHERE cs.id=? AND t.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Jadwal tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') {
        db().prepare('DELETE FROM class_schedules WHERE id=?').run(id);
      } else {
        const data = schema.parse(input);
        validateSchedule(schoolId, id, data);
        details = data;
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO class_schedules(id,teaching_assignment_id,semester_id,time_slot_id,weekday)
               VALUES(?,?,?,?,?)`,
            )
            .run(
              id,
              data.teaching_assignment_id,
              data.semester_id,
              data.time_slot_id,
              data.weekday,
            );
        else
          db()
            .prepare(
              `UPDATE class_schedules SET teaching_assignment_id=?,semester_id=?,time_slot_id=?,weekday=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              data.teaching_assignment_id,
              data.semester_id,
              data.time_slot_id,
              data.weekday,
              id,
            );
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'class_schedules',
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
