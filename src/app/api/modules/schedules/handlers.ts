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
  weekday: z.coerce.number().int().min(1).max(7),
});

type Assignment = {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  academic_year_id: string;
  semester_id: string | null;
};

function activeWeekdays(schoolId: string) {
  const row = db().prepare('SELECT schedule_weekdays FROM schools WHERE id=?').get(schoolId) as
    { schedule_weekdays: string } | undefined;
  try {
    const weekdays = z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .parse(JSON.parse(row?.schedule_weekdays || '[1,2,3,4,5]'));
    return [...new Set(weekdays)];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

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
  if (!activeWeekdays(schoolId).includes(data.weekday))
    throw new HttpError(400, 'Hari tersebut tidak aktif pada pengaturan jadwal.');
  const assignment = requireAssignment(schoolId, data.teaching_assignment_id);
  const semester = requireSemester(schoolId, data.semester_id);
  if (semester.academic_year_id !== assignment.academic_year_id)
    throw new HttpError(400, 'Semester dan penugasan harus berada pada tahun ajaran yang sama.');
  if (assignment.semester_id && assignment.semester_id !== semester.id)
    throw new HttpError(400, 'Penugasan mengajar tidak berlaku pada semester ini.');
  const slot = db()
    .prepare(
      'SELECT id,start_time,end_time,is_break,is_active FROM schedule_time_slots WHERE id=? AND school_id=?',
    )
    .get(data.time_slot_id, schoolId) as
    | { id: string; start_time: string; end_time: string; is_break: number; is_active: number }
    | undefined;
  if (!slot || !slot.is_active)
    throw new HttpError(400, 'Slot waktu tidak aktif atau tidak valid.');
  if (slot.is_break) throw new HttpError(400, 'Slot istirahat tidak dapat diisi pelajaran.');

  const classConflict = db()
    .prepare(
      `SELECT cs.id FROM class_schedules cs
       JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
       WHERE cs.semester_id=? AND cs.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND ta.class_id=? AND cs.id<>?`,
    )
    .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.class_id, id);
  if (classConflict)
    throw new HttpError(409, 'Rombel sudah memiliki pelajaran pada waktu tersebut.');

  const teacherConflict = db()
    .prepare(
      `SELECT cs.id FROM class_schedules cs
       JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
       WHERE cs.semester_id=? AND cs.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND ta.teacher_id=? AND cs.id<>?`,
    )
    .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.teacher_id, id);
  if (teacherConflict)
    throw new HttpError(409, 'Guru sudah mengajar rombel lain pada waktu tersebut.');
  const extracurricularTeacherConflict = db()
    .prepare(
      `SELECT es.id FROM extracurricular_schedules es
       JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
       JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
       WHERE es.semester_id=? AND es.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND ea.teacher_id=? LIMIT 1`,
    )
    .get(data.semester_id, data.weekday, slot.start_time, slot.end_time, assignment.teacher_id);
  if (extracurricularTeacherConflict)
    throw new HttpError(409, 'Guru sudah membina ekstrakurikuler pada waktu tersebut.');
  const participantConflict = db()
    .prepare(
      `SELECT es.id FROM extracurricular_schedules es
       JOIN extracurricular_participants ep ON ep.assignment_id=es.assignment_id
       JOIN class_memberships cm ON cm.student_id=ep.student_id
       JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
       WHERE es.semester_id=? AND es.weekday=?
         AND NOT (sts.end_time<=? OR sts.start_time>=?)
         AND cm.class_id=? AND cm.academic_year_id=? AND cm.status='active' LIMIT 1`,
    )
    .get(
      data.semester_id,
      data.weekday,
      slot.start_time,
      slot.end_time,
      assignment.class_id,
      assignment.academic_year_id,
    );
  if (participantConflict)
    throw new HttpError(
      409,
      'Salah satu murid rombel ini memiliki ekstrakurikuler pada waktu tersebut.',
    );
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
               WHERE t.school_id=? AND EXISTS (
                 SELECT 1 FROM teaching_assignments ta WHERE ta.teacher_id=t.id AND ta.academic_year_id=?
                 UNION ALL
                 SELECT 1 FROM extracurricular_assignments ea WHERE ea.teacher_id=t.id AND ea.academic_year_id=?
               ) ORDER BY t.name LIMIT 1`,
              )
              .get(schoolId, academicYearId, academicYearId) as { value: string } | undefined
          )?.value ?? '');
    const entityId = requestedEntity || defaultEntity;
    if (view === 'class' && entityId) {
      const classroom = requireClass(schoolId, entityId);
      if (classroom.academic_year_id !== academicYearId)
        throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
    }

    const entries =
      !semesterId || !entityId
        ? []
        : view === 'class'
          ? db()
              .prepare(
                `SELECT cs.id,'lesson' AS entry_type,ta.id AS assignment_id,cs.semester_id,cs.time_slot_id,cs.weekday,
                  t.name AS teacher_name,s.name AS entry_name,s.code AS entry_code,c.name AS class_name
           FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           JOIN teachers t ON t.id=ta.teacher_id JOIN subjects s ON s.id=ta.subject_id JOIN classes c ON c.id=ta.class_id
           WHERE cs.semester_id=? AND ta.class_id=?
           UNION ALL
           SELECT DISTINCT es.id,'extracurricular' AS entry_type,ea.id AS assignment_id,es.semester_id,es.time_slot_id,es.weekday,
                  t.name AS teacher_name,e.name AS entry_name,e.code AS entry_code,'' AS class_name
           FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
           JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id
           JOIN extracurricular_participants ep ON ep.assignment_id=ea.id JOIN class_memberships cm ON cm.student_id=ep.student_id
           WHERE es.semester_id=? AND cm.class_id=? AND cm.academic_year_id=? AND cm.status='active'
           ORDER BY weekday,time_slot_id`,
              )
              .all(semesterId, entityId, semesterId, entityId, academicYearId)
          : db()
              .prepare(
                `SELECT cs.id,'lesson' AS entry_type,ta.id AS assignment_id,cs.semester_id,cs.time_slot_id,cs.weekday,
                  t.name AS teacher_name,s.name AS entry_name,s.code AS entry_code,c.name AS class_name
           FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           JOIN teachers t ON t.id=ta.teacher_id JOIN subjects s ON s.id=ta.subject_id JOIN classes c ON c.id=ta.class_id
           WHERE cs.semester_id=? AND ta.teacher_id=?
           UNION ALL
           SELECT es.id,'extracurricular' AS entry_type,ea.id AS assignment_id,es.semester_id,es.time_slot_id,es.weekday,
                  t.name AS teacher_name,e.name AS entry_name,e.code AS entry_code,'' AS class_name
           FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
           JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id
           WHERE es.semester_id=? AND ea.teacher_id=?
           ORDER BY weekday,time_slot_id`,
              )
              .all(semesterId, entityId, semesterId, entityId);
    const slots = db()
      .prepare(
        `SELECT * FROM schedule_time_slots sts WHERE sts.school_id=? AND
         (sts.is_active=1 OR EXISTS (
           SELECT 1 FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           WHERE cs.time_slot_id=sts.id AND cs.semester_id=? AND (?='class' AND ta.class_id=? OR ?='teacher' AND ta.teacher_id=?)
         ) OR EXISTS (
           SELECT 1 FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
           WHERE es.time_slot_id=sts.id AND es.semester_id=? AND ?='teacher' AND ea.teacher_id=?
         )) ORDER BY sts.slot_order,sts.start_time`,
      )
      .all(
        schoolId,
        semesterId || '',
        view,
        entityId || '',
        view,
        entityId || '',
        semesterId || '',
        view,
        entityId || '',
      );
    const assignments =
      !semesterId || !entityId
        ? []
        : view === 'class'
          ? db()
              .prepare(
                `SELECT ta.id AS value,'lesson' AS type,s.code || ' — ' || s.name || ' · ' || t.name AS label
           FROM teaching_assignments ta JOIN teachers t ON t.id=ta.teacher_id JOIN subjects s ON s.id=ta.subject_id
           WHERE ta.academic_year_id=? AND ta.class_id=? AND (ta.semester_id IS NULL OR ta.semester_id=?)
           UNION ALL
           SELECT DISTINCT ea.id AS value,'extracurricular' AS type,'Ekstrakurikuler · ' || e.name AS label
           FROM extracurricular_assignments ea JOIN extracurriculars e ON e.id=ea.extracurricular_id
           JOIN extracurricular_participants ep ON ep.assignment_id=ea.id JOIN class_memberships cm ON cm.student_id=ep.student_id
           WHERE ea.academic_year_id=? AND (ea.semester_id IS NULL OR ea.semester_id=?)
             AND cm.class_id=? AND cm.academic_year_id=? AND cm.status='active'
           ORDER BY label`,
              )
              .all(
                academicYearId,
                entityId,
                semesterId,
                academicYearId,
                semesterId,
                entityId,
                academicYearId,
              )
          : db()
              .prepare(
                `SELECT ta.id AS value,'lesson' AS type,s.code || ' — ' || s.name || ' · ' || c.name AS label
           FROM teaching_assignments ta JOIN subjects s ON s.id=ta.subject_id JOIN classes c ON c.id=ta.class_id
           WHERE ta.academic_year_id=? AND ta.teacher_id=? AND (ta.semester_id IS NULL OR ta.semester_id=?)
           UNION ALL
           SELECT ea.id AS value,'extracurricular' AS type,'Ekstrakurikuler · ' || e.name AS label
           FROM extracurricular_assignments ea JOIN extracurriculars e ON e.id=ea.extracurricular_id
           WHERE ea.academic_year_id=? AND ea.teacher_id=? AND (ea.semester_id IS NULL OR ea.semester_id=?)
           ORDER BY label`,
              )
              .all(academicYearId, entityId, semesterId, academicYearId, entityId, semesterId);
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
    const school = db().prepare('SELECT timezone FROM schools WHERE id=?').get(schoolId) as
      { timezone: string } | undefined;

    return Response.json(
      {
        entries,
        slots,
        assignments,
        timezone: school?.timezone || 'Asia/Jakarta',
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
