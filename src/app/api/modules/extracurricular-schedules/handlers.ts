import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  currentSchoolId,
  requireAcademicYear,
  requireSemester,
  semesterOptions,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  extracurricular_assignment_id: z.string().uuid('Penugasan ekstrakurikuler tidak valid.'),
  semester_id: z.string().uuid('Semester tidak valid.'),
  time_slot_id: z.string().uuid('Slot waktu tidak valid.'),
  weekday: z.coerce.number().int().min(1).max(6),
});

type Assignment = {
  id: string;
  teacher_id: string;
  academic_year_id: string;
  semester_id: string | null;
  location: string;
};

function requireAssignment(schoolId: string, id: string) {
  const assignment = db()
    .prepare(
      `SELECT ea.* FROM extracurricular_assignments ea
       JOIN extracurriculars e ON e.id=ea.extracurricular_id
       WHERE ea.id=? AND e.school_id=?`,
    )
    .get(id, schoolId) as Assignment | undefined;
  if (!assignment) throw new HttpError(400, 'Penugasan ekstrakurikuler tidak valid.');
  return assignment;
}

function validateSchedule(schoolId: string, id: string, data: z.infer<typeof schema>) {
  const assignment = requireAssignment(schoolId, data.extracurricular_assignment_id);
  const semester = requireSemester(schoolId, data.semester_id);
  if (semester.academic_year_id !== assignment.academic_year_id)
    throw new HttpError(400, 'Semester dan penugasan harus berada pada tahun ajaran yang sama.');
  if (assignment.semester_id && assignment.semester_id !== semester.id)
    throw new HttpError(400, 'Penugasan ekstrakurikuler tidak berlaku pada semester ini.');
  const slot = db()
    .prepare(
      'SELECT id,start_time,end_time,is_active,is_break FROM schedule_time_slots WHERE id=? AND school_id=?',
    )
    .get(data.time_slot_id, schoolId) as
    | { id: string; start_time: string; end_time: string; is_active: number; is_break: number }
    | undefined;
  if (!slot || !slot.is_active || slot.is_break)
    throw new HttpError(400, 'Slot waktu tidak aktif atau tidak dapat digunakan.');

  const lessonConflict = db()
    .prepare(
      `SELECT cs.id FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
       WHERE cs.semester_id=? AND cs.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND ta.teacher_id=? LIMIT 1`,
    )
    .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.teacher_id);
  if (lessonConflict)
    throw new HttpError(409, 'Pembina memiliki jadwal pelajaran pada waktu tersebut.');

  const teacherConflict = db()
    .prepare(
      `SELECT es.id FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
       JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
       WHERE es.semester_id=? AND es.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND ea.teacher_id=? AND es.id<>? LIMIT 1`,
    )
    .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.teacher_id, id);
  if (teacherConflict)
    throw new HttpError(409, 'Pembina sudah memiliki jadwal ekstrakurikuler pada waktu tersebut.');

  if (assignment.location) {
    const locationConflict = db()
      .prepare(
        `SELECT es.id FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
         JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
         WHERE es.semester_id=? AND es.weekday=?
           AND NOT (sts.end_time<=? OR sts.start_time>=?)
           AND lower(ea.location)=lower(?) AND ea.location<>'' AND es.id<>? LIMIT 1`,
      )
      .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.location, id);
    if (locationConflict)
      throw new HttpError(409, 'Lokasi sudah digunakan ekstrakurikuler lain pada waktu tersebut.');
  }

  const participants = db()
    .prepare('SELECT student_id FROM extracurricular_participants WHERE assignment_id=?')
    .all(assignment.id) as Array<{ student_id: string }>;
  for (const participant of participants) {
    const extracurricularConflict = db()
      .prepare(
        `SELECT es.id FROM extracurricular_schedules es
         JOIN extracurricular_participants ep ON ep.assignment_id=es.assignment_id
         JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
         WHERE es.semester_id=? AND es.weekday=?
           AND NOT (sts.end_time<=? OR sts.start_time>=?)
           AND ep.student_id=? AND es.id<>? LIMIT 1`,
      )
      .get(
        data.semester_id,
        data.weekday,
        slot.start_time,
        slot.end_time,
        participant.student_id,
        id,
      );
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
         JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
         WHERE cs.semester_id=? AND cs.weekday=?
           AND NOT (sts.end_time<=? OR sts.start_time>=?)
           AND cm.student_id=? AND cm.status='active' LIMIT 1`,
      )
      .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, participant.student_id);
    if (classConflict)
      throw new HttpError(
        409,
        'Salah satu peserta masih memiliki jadwal pelajaran pada waktu tersebut.',
      );
  }
}

export async function GET(request: Request) {
  try {
    await requireUser('schedules.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const academicYearId =
      (url.searchParams.get('academic_year_id') || '').trim() || activeAcademicYear(schoolId).id;
    requireAcademicYear(schoolId, academicYearId);
    const semesterId =
      (url.searchParams.get('semester_id') || '').trim() ||
      semesterOptions(schoolId, academicYearId)[0]?.value ||
      '';
    if (semesterId && requireSemester(schoolId, semesterId).academic_year_id !== academicYearId)
      throw new HttpError(400, 'Semester tidak berada pada tahun ajaran yang dipilih.');
    const assignments = semesterId
      ? (db()
          .prepare(
            `SELECT ea.id AS value,e.code || ' — ' || e.name || ' · ' || t.name AS label
           FROM extracurricular_assignments ea JOIN extracurriculars e ON e.id=ea.extracurricular_id
           JOIN teachers t ON t.id=ea.teacher_id
           WHERE e.school_id=? AND ea.academic_year_id=? AND (ea.semester_id IS NULL OR ea.semester_id=?)
           ORDER BY e.name,t.name`,
          )
          .all(schoolId, academicYearId, semesterId) as Array<{ value: string; label: string }>)
      : [];
    const assignmentId =
      (url.searchParams.get('extracurricular_assignment_id') || '').trim() ||
      assignments[0]?.value ||
      '';
    if (assignmentId) {
      const assignment = requireAssignment(schoolId, assignmentId);
      if (assignment.academic_year_id !== academicYearId)
        throw new HttpError(400, 'Penugasan tidak berada pada tahun ajaran yang dipilih.');
    }
    const entries =
      semesterId && assignmentId
        ? db()
            .prepare(
              `SELECT es.*,e.name AS extracurricular_name,e.code AS extracurricular_code,t.name AS teacher_name
           FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
           JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id
           WHERE es.semester_id=? AND es.assignment_id=? ORDER BY es.weekday,es.time_slot_id`,
            )
            .all(semesterId, assignmentId)
        : [];
    const slots = db()
      .prepare(
        `SELECT sts.* FROM schedule_time_slots sts WHERE sts.school_id=? AND
       (sts.is_active=1 OR EXISTS (SELECT 1 FROM extracurricular_schedules es WHERE es.time_slot_id=sts.id AND es.semester_id=? AND es.assignment_id=?))
       ORDER BY sts.slot_order,sts.start_time`,
      )
      .all(schoolId, semesterId, assignmentId);
    return Response.json(
      {
        entries,
        slots,
        assignments,
        selected: {
          academic_year_id: academicYearId,
          semester_id: semesterId,
          extracurricular_assignment_id: assignmentId,
        },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          semester_id: semesterOptions(schoolId, academicYearId),
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
                `SELECT es.* FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
         JOIN extracurriculars e ON e.id=ea.extracurricular_id WHERE es.id=? AND e.school_id=?`,
              )
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous)
        throw new HttpError(404, 'Jadwal ekstrakurikuler tidak ditemukan.');
      if (method === 'DELETE') {
        db().prepare('DELETE FROM extracurricular_schedules WHERE id=?').run(id);
      } else {
        const data = schema.parse(input);
        validateSchedule(schoolId, id, data);
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO extracurricular_schedules(id,assignment_id,semester_id,time_slot_id,weekday) VALUES(?,?,?,?,?)`,
            )
            .run(
              id,
              data.extracurricular_assignment_id,
              data.semester_id,
              data.time_slot_id,
              data.weekday,
            );
        else
          db()
            .prepare(
              `UPDATE extracurricular_schedules SET assignment_id=?,semester_id=?,time_slot_id=?,weekday=? WHERE id=?`,
            )
            .run(
              data.extracurricular_assignment_id,
              data.semester_id,
              data.time_slot_id,
              data.weekday,
              id,
            );
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'extracurricular_schedules',
        id,
        method === 'DELETE' ? previous : input,
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
