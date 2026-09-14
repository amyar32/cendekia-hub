import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
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
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { can } from '@/config/modules';
import { audit, db } from '@/lib/db';
import { examConflicts } from '@/lib/exam-schedules';
import { failure } from '@/lib/http';

const idSchema = z.string().uuid('ID tidak valid.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid.');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Waktu tidak valid.');
const periodSchema = z
  .object({
    academic_year_id: idSchema,
    semester_id: idSchema,
    name: z.string().trim().min(2).max(120),
    exam_type: z.enum(['midterm', 'final', 'practice', 'oral', 'computer', 'tryout', 'other']),
    start_date: dateSchema,
    end_date: dateSchema,
    regular_schedule_policy: z.enum([
      'unaffected',
      'suspend_participating_classes',
      'suspend_all_classes',
    ]),
    max_exams_per_class_per_day: z.coerce.number().int().min(1).max(10),
    max_supervisions_per_teacher_per_day: z.coerce.number().int().min(1).max(10),
    supervisors_per_room: z.coerce.number().int().min(1).max(10),
    minimum_break_minutes: z.coerce.number().int().min(0).max(240),
    allow_self_supervision: z.boolean(),
    enforce_room_capacity: z.boolean(),
    allow_warning_override: z.boolean(),
  })
  .refine((value) => value.start_date <= value.end_date, {
    message: 'Tanggal selesai harus sama atau setelah tanggal mulai.',
  });
const sessionSchema = z.object({
  exam_period_id: idSchema,
  exam_date: dateSchema,
  name: z.string().trim().min(1).max(80),
  start_time: timeSchema,
  end_time: timeSchema,
  session_order: z.coerce.number().int().min(1).max(50),
});
const sessionPatternSchema = z.object({
  exam_period_id: idSchema,
  dates: z.array(dateSchema).min(1).max(366),
  sessions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        start_time: timeSchema,
        end_time: timeSchema,
        session_order: z.coerce.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(20),
});
const roomSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(100),
  capacity: z.coerce.number().int().min(0).max(10000),
  room_type: z.enum(['classroom', 'laboratory', 'computer_lab', 'hall', 'other']),
  location: z.string().trim().max(200),
  facilities: z.array(z.string().trim().min(1).max(80)).max(30),
  is_active: z.boolean(),
});
const entrySchema = z
  .object({
    exam_period_id: idSchema,
    exam_session_id: idSchema,
    subject_id: idSchema,
    room_id: idSchema,
    participant_mode: z.enum(['class', 'student']).default('class'),
    class_ids: z.array(idSchema).max(30),
    student_ids: z.array(idSchema).max(2000).default([]),
    supervisor_ids: z.array(idSchema).max(10),
    lead_supervisor_id: idSchema.optional().or(z.literal('')),
    assessment_type: z.enum(['written', 'practice', 'oral', 'computer']),
    duration_minutes: z.coerce.number().int().min(1).max(600),
    notes: z.string().trim().max(1000),
  })
  .refine(
    (value) =>
      value.participant_mode === 'class'
        ? value.class_ids.length > 0
        : value.student_ids.length > 0,
    { message: 'Pilih minimal satu rombel atau murid sebagai peserta.' },
  );
const unavailableSchema = z.object({
  exam_period_id: idSchema,
  resource_type: z.enum(['teacher', 'room']),
  resource_id: idSchema,
  exam_date: dateSchema,
  exam_session_id: idSchema.optional().or(z.literal('')),
  reason: z.string().trim().max(500),
});

type Period = {
  id: string;
  school_id: string;
  academic_year_id: string;
  semester_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'published' | 'completed' | 'archived';
  allow_warning_override: number;
  allow_self_supervision: number;
  max_supervisions_per_teacher_per_day: number;
  supervisors_per_room: number;
  version: number;
};

function requirePeriod(schoolId: string, id: string) {
  const period = db()
    .prepare('SELECT * FROM exam_periods WHERE id=? AND school_id=?')
    .get(id, schoolId) as Period | undefined;
  if (!period) throw new HttpError(404, 'Periode ujian tidak ditemukan.');
  return period;
}

function requireDraft(period: Period) {
  if (period.status !== 'draft')
    throw new HttpError(
      409,
      'Jadwal yang sudah dipublikasikan harus dibuat revisi terlebih dahulu.',
    );
}

function validatePeriod(schoolId: string, data: z.infer<typeof periodSchema>) {
  const year = requireAcademicYear(schoolId, data.academic_year_id);
  const semester = requireSemester(schoolId, data.semester_id);
  if (semester.academic_year_id !== year.id)
    throw new HttpError(400, 'Semester tidak berada pada tahun ajaran yang dipilih.');
  const dates = db()
    .prepare('SELECT start_date,end_date FROM semesters WHERE id=?')
    .get(semester.id) as {
    start_date: string;
    end_date: string;
  };
  if (data.start_date < dates.start_date || data.end_date > dates.end_date)
    throw new HttpError(400, 'Periode ujian harus berada di dalam rentang semester.');
}

function participantCount(classId: string, academicYearId: string, date: string) {
  return (
    db()
      .prepare(
        `SELECT COUNT(DISTINCT cm.student_id) AS count FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         WHERE cm.class_id=? AND cm.academic_year_id=? AND s.is_active=1 AND cm.start_date<=?
           AND (cm.end_date IS NULL OR cm.end_date>=?)`,
      )
      .get(classId, academicYearId, date, date) as { count: number }
  ).count;
}

function saveEntry(id: string, data: z.infer<typeof entrySchema>) {
  const period = requirePeriod(currentSchoolId(), data.exam_period_id);
  requireDraft(period);
  const session = db()
    .prepare(
      'SELECT exam_date,start_time,end_time FROM exam_sessions WHERE id=? AND exam_period_id=?',
    )
    .get(data.exam_session_id, period.id) as
    { exam_date: string; start_time: string; end_time: string } | undefined;
  if (!session) throw new HttpError(400, 'Sesi tidak berada pada periode yang dipilih.');
  requireSubject(period.school_id, data.subject_id);
  const subject = db()
    .prepare('SELECT name,is_active FROM subjects WHERE id=?')
    .get(data.subject_id) as {
    name: string;
    is_active: number;
  };
  if (!subject.is_active) throw new HttpError(400, 'Mata pelajaran tidak aktif.');
  const room = db()
    .prepare('SELECT name,is_active FROM rooms WHERE id=? AND school_id=?')
    .get(data.room_id, period.school_id) as { name: string; is_active: number } | undefined;
  if (!room?.is_active) throw new HttpError(400, 'Ruangan tidak aktif atau tidak valid.');
  const selectedStudents =
    data.participant_mode === 'student'
      ? [...new Set(data.student_ids)].map((studentId) => {
          const student = db()
            .prepare(
              `SELECT s.id,s.name,c.id AS class_id,c.name AS class_name
               FROM students s JOIN class_memberships cm ON cm.student_id=s.id
               JOIN classes c ON c.id=cm.class_id
               WHERE s.id=? AND s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
                 AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
               ORDER BY cm.start_date DESC LIMIT 1`,
            )
            .get(
              studentId,
              period.school_id,
              period.academic_year_id,
              session.exam_date,
              session.exam_date,
            ) as { id: string; name: string; class_id: string; class_name: string } | undefined;
          if (!student)
            throw new HttpError(
              400,
              'Murid tidak aktif atau tidak memiliki rombel pada tanggal ujian.',
            );
          return student;
        })
      : [];
  if (data.participant_mode === 'student') {
    const assignedElsewhere = db().prepare(
      `SELECT e.id FROM exam_schedule_entries e
       LEFT JOIN exam_schedule_students ess ON ess.exam_schedule_entry_id=e.id
       LEFT JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
       WHERE e.exam_session_id=? AND e.id<>?
         AND (ess.student_id=? OR (e.participant_mode='class' AND ec.class_id=?))
       LIMIT 1`,
    );
    for (const student of selectedStudents)
      if (assignedElsewhere.get(data.exam_session_id, id, student.id, student.class_id))
        throw new HttpError(409, `${student.name} sudah ditempatkan di ruang lain pada sesi ini.`);
  }
  const classSelections = [...new Set(data.class_ids)].map((classId) => {
    const classroom = requireClass(period.school_id, classId);
    if (classroom.academic_year_id !== period.academic_year_id)
      throw new HttpError(400, 'Semua rombel harus berasal dari tahun ajaran periode ujian.');
    const row = db().prepare('SELECT name,is_active FROM classes WHERE id=?').get(classId) as {
      name: string;
      is_active: number;
    };
    if (!row.is_active) throw new HttpError(400, `${row.name} sudah tidak aktif.`);
    return {
      id: classId,
      name: row.name,
      count: participantCount(classId, period.academic_year_id, session.exam_date),
    };
  });
  const classes =
    data.participant_mode === 'class'
      ? classSelections
      : [
          ...selectedStudents
            .reduce((result, student) => {
              const current = result.get(student.class_id);
              result.set(student.class_id, {
                id: student.class_id,
                name: student.class_name,
                count: (current?.count || 0) + 1,
              });
              return result;
            }, new Map<string, { id: string; name: string; count: number }>())
            .values(),
        ];
  const supervisors = [...new Set(data.supervisor_ids)].map((teacherId) => {
    requireTeacher(period.school_id, teacherId);
    const row = db().prepare('SELECT name,is_active FROM teachers WHERE id=?').get(teacherId) as {
      name: string;
      is_active: number;
    };
    if (!row.is_active) throw new HttpError(400, `${row.name} sudah tidak aktif.`);
    return { id: teacherId, name: row.name };
  });
  if (data.lead_supervisor_id && !supervisors.some((item) => item.id === data.lead_supervisor_id))
    throw new HttpError(400, 'Pengawas utama harus termasuk dalam daftar pengawas.');

  db().transaction(() => {
    const exists = db().prepare('SELECT id FROM exam_schedule_entries WHERE id=?').get(id);
    if (exists) {
      db()
        .prepare(
          `UPDATE exam_schedule_entries SET exam_session_id=?,subject_id=?,room_id=?,participant_mode=?,assessment_type=?,duration_minutes=?,notes=?,subject_name=?,room_name=?,updated_at=datetime('now') WHERE id=?`,
        )
        .run(
          data.exam_session_id,
          data.subject_id,
          data.room_id,
          data.participant_mode,
          data.assessment_type,
          data.duration_minutes,
          data.notes,
          subject.name,
          room.name,
          id,
        );
      db().prepare('DELETE FROM exam_schedule_classes WHERE exam_schedule_entry_id=?').run(id);
      db().prepare('DELETE FROM exam_schedule_students WHERE exam_schedule_entry_id=?').run(id);
      db().prepare('DELETE FROM exam_supervisors WHERE exam_schedule_entry_id=?').run(id);
      db().prepare('DELETE FROM exam_conflict_overrides WHERE exam_schedule_entry_id=?').run(id);
    } else {
      db()
        .prepare(
          `INSERT INTO exam_schedule_entries(id,exam_period_id,exam_session_id,subject_id,room_id,participant_mode,assessment_type,duration_minutes,notes,subject_name,room_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          period.id,
          data.exam_session_id,
          data.subject_id,
          data.room_id,
          data.participant_mode,
          data.assessment_type,
          data.duration_minutes,
          data.notes,
          subject.name,
          room.name,
        );
    }
    const insertClass = db().prepare(
      'INSERT INTO exam_schedule_classes(id,exam_schedule_entry_id,class_id,class_name,participant_count) VALUES (?,?,?,?,?)',
    );
    for (const classroom of classes)
      insertClass.run(randomUUID(), id, classroom.id, classroom.name, classroom.count);
    const insertStudent = db().prepare(
      'INSERT INTO exam_schedule_students(id,exam_schedule_entry_id,student_id,student_name,class_id,class_name) VALUES (?,?,?,?,?,?)',
    );
    for (const student of selectedStudents)
      insertStudent.run(
        randomUUID(),
        id,
        student.id,
        student.name,
        student.class_id,
        student.class_name,
      );
    const insertSupervisor = db().prepare(
      'INSERT INTO exam_supervisors(id,exam_schedule_entry_id,teacher_id,role,teacher_name) VALUES (?,?,?,?,?)',
    );
    for (const supervisor of supervisors)
      insertSupervisor.run(
        randomUUID(),
        id,
        supervisor.id,
        supervisor.id === data.lead_supervisor_id ? 'lead' : 'assistant',
        supervisor.name,
      );
  })();
  return period;
}

function periodSnapshot(periodId: string) {
  const period = db().prepare('SELECT * FROM exam_periods WHERE id=?').get(periodId);
  const sessions = db()
    .prepare('SELECT * FROM exam_sessions WHERE exam_period_id=? ORDER BY exam_date,start_time')
    .all(periodId);
  const entries = db()
    .prepare(
      `SELECT e.*,se.exam_date,se.name AS session_name,se.start_time,se.end_time,
      GROUP_CONCAT(DISTINCT ec.class_name) AS class_names,
      GROUP_CONCAT(DISTINCT est.student_id) AS student_ids,
      GROUP_CONCAT(DISTINCT est.student_name) AS student_names,
      GROUP_CONCAT(DISTINCT es.teacher_name) AS supervisor_names
     FROM exam_schedule_entries e JOIN exam_sessions se ON se.id=e.exam_session_id
     LEFT JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
     LEFT JOIN exam_schedule_students est ON est.exam_schedule_entry_id=e.id
     LEFT JOIN exam_supervisors es ON es.exam_schedule_entry_id=e.id
     WHERE e.exam_period_id=? GROUP BY e.id ORDER BY se.exam_date,se.start_time,e.room_name`,
    )
    .all(periodId);
  return { period, sessions, entries, generated_at: new Date().toISOString() };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser('exam-schedules.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const rosterEntryId = (url.searchParams.get('entry_id') || '').trim();
    if (rosterEntryId) {
      if (!can(user.permissions, 'exam-schedules.report'))
        throw new HttpError(403, 'Anda tidak memiliki izin membuat dokumen ujian.');
      const entryId = idSchema.parse(rosterEntryId);
      const entry = db()
        .prepare(
          `SELECT e.id,e.subject_name,e.room_name,e.assessment_type,e.duration_minutes,e.notes,
                  ep.name AS period_name,ay.name AS academic_year_name,sm.name AS semester_name,
                  se.exam_date,se.name AS session_name,se.start_time,se.end_time,
                  GROUP_CONCAT(DISTINCT ec.class_name) AS class_names,
                  GROUP_CONCAT(DISTINCT es.teacher_name) AS supervisor_names
           FROM exam_schedule_entries e JOIN exam_periods ep ON ep.id=e.exam_period_id
           JOIN academic_years ay ON ay.id=ep.academic_year_id JOIN semesters sm ON sm.id=ep.semester_id
           JOIN exam_sessions se ON se.id=e.exam_session_id
           LEFT JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
           LEFT JOIN exam_supervisors es ON es.exam_schedule_entry_id=e.id
           WHERE e.id=? AND ep.school_id=? GROUP BY e.id`,
        )
        .get(entryId, schoolId);
      if (!entry) throw new HttpError(404, 'Jadwal ujian tidak ditemukan.');
      const students = db()
        .prepare(
          `SELECT s.nis,ess.student_name AS name,ess.class_name FROM exam_schedule_students ess
           JOIN students s ON s.id=ess.student_id WHERE ess.exam_schedule_entry_id=?
           UNION ALL
           SELECT DISTINCT s.nis,s.name,ec.class_name FROM exam_schedule_classes ec
           JOIN exam_schedule_entries e ON e.id=ec.exam_schedule_entry_id
           JOIN exam_sessions se ON se.id=e.exam_session_id
           JOIN class_memberships cm ON cm.class_id=ec.class_id
           JOIN students s ON s.id=cm.student_id
           WHERE ec.exam_schedule_entry_id=? AND s.is_active=1 AND cm.start_date<=se.exam_date
             AND (cm.end_date IS NULL OR cm.end_date>=se.exam_date)
             AND NOT EXISTS (SELECT 1 FROM exam_schedule_students selected WHERE selected.exam_schedule_entry_id=ec.exam_schedule_entry_id)
           ORDER BY class_name,name`,
        )
        .all(entryId, entryId);
      const school = db()
        .prepare(
          'SELECT name,code,npsn,address,email,phone,logo_url,principal_name,principal_nip,principal_signature_url FROM schools WHERE id=?',
        )
        .get(schoolId);
      return Response.json(
        { entry, students, school },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const periodId = (url.searchParams.get('period_id') || '').trim();
    const periods = db()
      .prepare(
        `SELECT ep.*,ay.name AS academic_year_name,s.name AS semester_name,
          (SELECT COUNT(*) FROM exam_schedule_entries e WHERE e.exam_period_id=ep.id) AS entry_count
         FROM exam_periods ep JOIN academic_years ay ON ay.id=ep.academic_year_id JOIN semesters s ON s.id=ep.semester_id
         WHERE ep.school_id=? ORDER BY ep.start_date DESC,ep.name`,
      )
      .all(schoolId) as Array<
      Period & { academic_year_name: string; semester_name: string; entry_count: number }
    >;
    const selectedId = periodId || periods[0]?.id || '';
    if (selectedId) requirePeriod(schoolId, selectedId);
    const teacher = db()
      .prepare('SELECT id FROM teachers WHERE school_id=? AND user_id=?')
      .get(schoolId, user.id) as { id: string } | undefined;
    const ownOnly =
      !can(user.permissions, 'exam-schedules.report') &&
      !can(user.permissions, 'exam-schedules.write');
    const school = db()
      .prepare(
        'SELECT name,code,npsn,address,email,phone,logo_url,principal_name,principal_nip,principal_signature_url FROM schools WHERE id=?',
      )
      .get(schoolId);
    const sessions = selectedId
      ? db()
          .prepare(
            'SELECT * FROM exam_sessions WHERE exam_period_id=? ORDER BY exam_date,start_time',
          )
          .all(selectedId)
      : [];
    const entries = selectedId
      ? db()
          .prepare(
            `SELECT e.*,se.exam_date,se.name AS session_name,se.start_time,se.end_time,r.capacity,
            GROUP_CONCAT(DISTINCT ec.class_name) AS class_names,
            GROUP_CONCAT(DISTINCT ec.class_id) AS class_ids,
            GROUP_CONCAT(DISTINCT es.teacher_name) AS supervisor_names,
            GROUP_CONCAT(DISTINCT es.teacher_id) AS supervisor_ids,
            GROUP_CONCAT(DISTINCT est.student_id) AS student_ids,
            MAX(CASE WHEN es.role='lead' THEN es.teacher_id ELSE '' END) AS lead_supervisor_id,
            (SELECT COALESCE(SUM(counts.participant_count),0) FROM exam_schedule_classes counts WHERE counts.exam_schedule_entry_id=e.id) AS participant_count
           FROM exam_schedule_entries e JOIN exam_sessions se ON se.id=e.exam_session_id JOIN rooms r ON r.id=e.room_id
           LEFT JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
           LEFT JOIN exam_schedule_students est ON est.exam_schedule_entry_id=e.id
           LEFT JOIN exam_supervisors es ON es.exam_schedule_entry_id=e.id
           WHERE e.exam_period_id=? AND (?=0 OR EXISTS (SELECT 1 FROM exam_supervisors own WHERE own.exam_schedule_entry_id=e.id AND own.teacher_id=?))
           GROUP BY e.id ORDER BY se.exam_date,se.start_time,e.room_name`,
          )
          .all(selectedId, ownOnly ? 1 : 0, teacher?.id || '')
      : [];
    const visibleEntryIds = new Set((entries as Array<{ id: string }>).map((entry) => entry.id));
    const rooms = db()
      .prepare('SELECT * FROM rooms WHERE school_id=? ORDER BY is_active DESC,name')
      .all(schoolId);
    const unavailabilities = selectedId
      ? db()
          .prepare(
            `SELECT eu.*,COALESCE(t.name,r.name) AS resource_name,es.name AS session_name
           FROM exam_unavailabilities eu LEFT JOIN teachers t ON t.id=eu.teacher_id LEFT JOIN rooms r ON r.id=eu.room_id
           LEFT JOIN exam_sessions es ON es.id=eu.exam_session_id WHERE eu.exam_period_id=?
             AND (?=0 OR (eu.resource_type='teacher' AND eu.teacher_id=?))
           ORDER BY eu.exam_date,resource_name`,
          )
          .all(selectedId, ownOnly ? 1 : 0, teacher?.id || '')
      : [];
    const versions = selectedId
      ? db()
          .prepare(
            `SELECT v.id,v.version,v.notes,v.published_at,u.name AS published_by_name FROM exam_schedule_versions v
           JOIN users u ON u.id=v.published_by WHERE v.exam_period_id=? ORDER BY v.version DESC`,
          )
          .all(selectedId)
      : [];
    return Response.json(
      {
        periods,
        selected_period_id: selectedId,
        sessions,
        entries,
        rooms,
        unavailabilities,
        versions,
        conflicts: selectedId
          ? examConflicts(selectedId).filter(
              (conflict) =>
                !ownOnly || (!!conflict.entry_id && visibleEntryIds.has(conflict.entry_id)),
            )
          : [],
        options: {
          academic_year_id: academicYearOptions(schoolId),
          semester_id: semesterOptions(schoolId),
          class_id:
            selectedId && !ownOnly
              ? classOptions(schoolId, requirePeriod(schoolId, selectedId).academic_year_id)
              : [],
          subject_id: ownOnly ? [] : subjectOptions(schoolId),
          teacher_id: ownOnly ? [] : teacherOptions(schoolId),
          student_id:
            selectedId && !ownOnly
              ? db()
                  .prepare(
                    `SELECT s.id AS value,s.name || ' · ' || c.name AS label,c.id AS class_id,c.name AS class_name
                     FROM students s JOIN class_memberships cm ON cm.student_id=s.id
                     JOIN classes c ON c.id=cm.class_id
                     WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
                       AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
                     ORDER BY c.name,s.name`,
                  )
                  .all(
                    schoolId,
                    requirePeriod(schoolId, selectedId).academic_year_id,
                    requirePeriod(schoolId, selectedId).end_date,
                    requirePeriod(schoolId, selectedId).start_date,
                  )
              : [],
        },
        access: {
          write: can(user.permissions, 'exam-schedules.write'),
          publish: can(user.permissions, 'exam-schedules.publish'),
          report: can(user.permissions, 'exam-schedules.report'),
          own_only: ownOnly,
        },
        school,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser('exam-schedules.write');
    const body = z
      .object({ action: z.string() })
      .passthrough()
      .parse(await request.json());
    const schoolId = currentSchoolId();
    let id: string = randomUUID();
    if (body.action === 'period') {
      const data = periodSchema.parse(body);
      validatePeriod(schoolId, data);
      db().transaction(() => {
        db()
          .prepare(
            `INSERT INTO exam_periods(id,school_id,academic_year_id,semester_id,name,exam_type,start_date,end_date,regular_schedule_policy,max_exams_per_class_per_day,max_supervisions_per_teacher_per_day,supervisors_per_room,minimum_break_minutes,allow_self_supervision,enforce_room_capacity,allow_warning_override)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            schoolId,
            data.academic_year_id,
            data.semester_id,
            data.name,
            data.exam_type,
            data.start_date,
            data.end_date,
            data.regular_schedule_policy,
            data.max_exams_per_class_per_day,
            data.max_supervisions_per_teacher_per_day,
            data.supervisors_per_room,
            data.minimum_break_minutes,
            Number(data.allow_self_supervision),
            Number(data.enforce_room_capacity),
            Number(data.allow_warning_override),
          );
        audit(user.email, 'create', 'exam_periods', id, data);
      })();
    } else if (body.action === 'session') {
      const data = sessionSchema.parse(body);
      const period = requirePeriod(schoolId, data.exam_period_id);
      requireDraft(period);
      if (data.exam_date < period.start_date || data.exam_date > period.end_date)
        throw new HttpError(400, 'Tanggal sesi harus berada dalam periode ujian.');
      if (data.start_time >= data.end_time)
        throw new HttpError(400, 'Jam selesai harus setelah jam mulai.');
      const overlap = db()
        .prepare(
          `SELECT id FROM exam_sessions WHERE exam_period_id=? AND exam_date=? AND NOT (end_time<=? OR start_time>=?)`,
        )
        .get(period.id, data.exam_date, data.start_time, data.end_time);
      if (overlap) throw new HttpError(409, 'Waktu sesi bertumpang tindih dengan sesi lain.');
      db().transaction(() => {
        db()
          .prepare(
            'INSERT INTO exam_sessions(id,exam_period_id,exam_date,name,start_time,end_time,session_order) VALUES (?,?,?,?,?,?,?)',
          )
          .run(
            id,
            period.id,
            data.exam_date,
            data.name,
            data.start_time,
            data.end_time,
            data.session_order,
          );
        audit(user.email, 'create', 'exam_sessions', id, data);
      })();
    } else if (body.action === 'session-pattern') {
      const data = sessionPatternSchema.parse(body);
      const period = requirePeriod(schoolId, data.exam_period_id);
      requireDraft(period);
      const dates = [...new Set(data.dates)].sort();
      const orders = new Set<number>();
      for (const session of data.sessions) {
        if (session.start_time >= session.end_time)
          throw new HttpError(400, `Jam selesai ${session.name} harus setelah jam mulai.`);
        if (orders.has(session.session_order))
          throw new HttpError(400, 'Urutan sesi pada pola harus unik.');
        orders.add(session.session_order);
      }
      const orderedPattern = [...data.sessions].sort((left, right) =>
        left.start_time.localeCompare(right.start_time),
      );
      for (let index = 1; index < orderedPattern.length; index += 1)
        if (orderedPattern[index].start_time < orderedPattern[index - 1].end_time)
          throw new HttpError(409, 'Waktu pada pola sesi tidak boleh bertumpang tindih.');
      for (const date of dates)
        if (date < period.start_date || date > period.end_date)
          throw new HttpError(400, 'Semua tanggal harus berada dalam periode ujian.');

      const existingForDate = db().prepare(
        'SELECT id,session_order,start_time,end_time FROM exam_sessions WHERE exam_period_id=? AND exam_date=?',
      );
      for (const date of dates) {
        const retained = (
          existingForDate.all(period.id, date) as Array<{
            id: string;
            session_order: number;
            start_time: string;
            end_time: string;
          }>
        ).filter((session) => !orders.has(session.session_order));
        for (const pattern of data.sessions)
          if (
            retained.some(
              (session) =>
                session.start_time < pattern.end_time && session.end_time > pattern.start_time,
            )
          )
            throw new HttpError(
              409,
              `Pola bertumpang tindih dengan sesi lain yang sudah ada pada ${date}.`,
            );
      }

      db().transaction(() => {
        const find = db().prepare(
          'SELECT id FROM exam_sessions WHERE exam_period_id=? AND exam_date=? AND session_order=?',
        );
        const insert = db().prepare(
          'INSERT INTO exam_sessions(id,exam_period_id,exam_date,name,start_time,end_time,session_order) VALUES (?,?,?,?,?,?,?)',
        );
        const update = db().prepare(
          "UPDATE exam_sessions SET name=?,start_time=?,end_time=?,updated_at=datetime('now') WHERE id=?",
        );
        for (const date of dates)
          for (const session of data.sessions) {
            const existing = find.get(period.id, date, session.session_order) as
              { id: string } | undefined;
            if (existing)
              update.run(session.name, session.start_time, session.end_time, existing.id);
            else
              insert.run(
                randomUUID(),
                period.id,
                date,
                session.name,
                session.start_time,
                session.end_time,
                session.session_order,
              );
          }
        audit(user.email, 'apply_pattern', 'exam_sessions', period.id, {
          dates,
          sessions: data.sessions,
        });
      })();
      id = period.id;
    } else if (body.action === 'room') {
      const data = roomSchema.parse(body);
      db().transaction(() => {
        db()
          .prepare(
            'INSERT INTO rooms(id,school_id,code,name,capacity,room_type,location,facilities,is_active) VALUES (?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            schoolId,
            data.code,
            data.name,
            data.capacity,
            data.room_type,
            data.location,
            JSON.stringify(data.facilities),
            Number(data.is_active),
          );
        audit(user.email, 'create', 'rooms', id, data);
      })();
    } else if (body.action === 'entry') {
      const data = entrySchema.parse(body);
      const period = saveEntry(id, data);
      audit(user.email, 'create', 'exam_schedule_entries', id, { period_id: period.id });
    } else if (body.action === 'unavailability') {
      const data = unavailableSchema.parse(body);
      const period = requirePeriod(schoolId, data.exam_period_id);
      requireDraft(period);
      if (data.exam_date < period.start_date || data.exam_date > period.end_date)
        throw new HttpError(400, 'Tanggal ketidaktersediaan harus berada dalam periode ujian.');
      if (data.resource_type === 'teacher') requireTeacher(schoolId, data.resource_id);
      else if (
        !db()
          .prepare('SELECT id FROM rooms WHERE id=? AND school_id=?')
          .get(data.resource_id, schoolId)
      )
        throw new HttpError(400, 'Ruangan tidak valid.');
      if (
        data.exam_session_id &&
        !db()
          .prepare('SELECT id FROM exam_sessions WHERE id=? AND exam_period_id=?')
          .get(data.exam_session_id, period.id)
      )
        throw new HttpError(400, 'Sesi tidak berada pada periode yang dipilih.');
      db().transaction(() => {
        db()
          .prepare(
            `INSERT INTO exam_unavailabilities(id,exam_period_id,resource_type,teacher_id,room_id,exam_date,exam_session_id,reason)
           VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            period.id,
            data.resource_type,
            data.resource_type === 'teacher' ? data.resource_id : null,
            data.resource_type === 'room' ? data.resource_id : null,
            data.exam_date,
            data.exam_session_id || null,
            data.reason,
          );
        audit(user.email, 'create', 'exam_unavailabilities', id, data);
      })();
    } else if (body.action === 'copy_template') {
      const data = z
        .object({
          source_period_id: idSchema,
          academic_year_id: idSchema,
          semester_id: idSchema,
          name: z.string().trim().min(2).max(120),
          start_date: dateSchema,
          end_date: dateSchema,
        })
        .parse(body);
      const source = requirePeriod(schoolId, data.source_period_id) as Period &
        Record<string, unknown>;
      const targetData = periodSchema.parse({ ...source, ...data });
      validatePeriod(schoolId, targetData);
      const sourceSessions = db()
        .prepare(
          'SELECT * FROM exam_sessions WHERE exam_period_id=? ORDER BY exam_date,session_order',
        )
        .all(source.id) as Array<{
        exam_date: string;
        name: string;
        start_time: string;
        end_time: string;
        session_order: number;
      }>;
      const dayMs = 86_400_000;
      const sourceStart = Date.parse(`${source.start_date}T00:00:00Z`);
      const targetStart = Date.parse(`${data.start_date}T00:00:00Z`);
      db().transaction(() => {
        db()
          .prepare(
            `INSERT INTO exam_periods(id,school_id,academic_year_id,semester_id,name,exam_type,start_date,end_date,regular_schedule_policy,max_exams_per_class_per_day,max_supervisions_per_teacher_per_day,supervisors_per_room,minimum_break_minutes,allow_self_supervision,enforce_room_capacity,allow_warning_override)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            schoolId,
            targetData.academic_year_id,
            targetData.semester_id,
            targetData.name,
            targetData.exam_type,
            targetData.start_date,
            targetData.end_date,
            targetData.regular_schedule_policy,
            targetData.max_exams_per_class_per_day,
            targetData.max_supervisions_per_teacher_per_day,
            targetData.supervisors_per_room,
            targetData.minimum_break_minutes,
            Number(targetData.allow_self_supervision),
            Number(targetData.enforce_room_capacity),
            Number(targetData.allow_warning_override),
          );
        const insert = db().prepare(
          'INSERT INTO exam_sessions(id,exam_period_id,exam_date,name,start_time,end_time,session_order) VALUES (?,?,?,?,?,?,?)',
        );
        for (const session of sourceSessions) {
          const offset = Math.round(
            (Date.parse(`${session.exam_date}T00:00:00Z`) - sourceStart) / dayMs,
          );
          const shifted = new Date(targetStart + offset * dayMs).toISOString().slice(0, 10);
          if (shifted <= data.end_date)
            insert.run(
              randomUUID(),
              id,
              shifted,
              session.name,
              session.start_time,
              session.end_time,
              session.session_order,
            );
        }
        const constraints = db()
          .prepare(
            'SELECT constraint_key,value,severity,is_enabled FROM exam_constraints WHERE exam_period_id=?',
          )
          .all(source.id) as Array<{
          constraint_key: string;
          value: string;
          severity: string;
          is_enabled: number;
        }>;
        const insertConstraint = db().prepare(
          'INSERT INTO exam_constraints(id,exam_period_id,constraint_key,value,severity,is_enabled) VALUES (?,?,?,?,?,?)',
        );
        for (const constraint of constraints)
          insertConstraint.run(
            randomUUID(),
            id,
            constraint.constraint_key,
            constraint.value,
            constraint.severity,
            constraint.is_enabled,
          );
        audit(user.email, 'copy', 'exam_periods', id, { source_period_id: source.id });
      })();
    } else if (body.action === 'generate') {
      const data = z.object({ exam_period_id: idSchema }).parse(body);
      const period = requirePeriod(schoolId, data.exam_period_id);
      requireDraft(period);
      const sessions = db()
        .prepare(
          'SELECT id,exam_date,start_time,end_time FROM exam_sessions WHERE exam_period_id=? ORDER BY exam_date,start_time',
        )
        .all(period.id) as Array<{
        id: string;
        exam_date: string;
        start_time: string;
        end_time: string;
      }>;
      const rooms = db()
        .prepare(
          'SELECT id,name,capacity FROM rooms WHERE school_id=? AND is_active=1 ORDER BY capacity DESC,name',
        )
        .all(schoolId) as Array<{ id: string; name: string; capacity: number }>;
      if (!sessions.length || !rooms.length)
        throw new HttpError(409, 'Tambahkan sesi dan ruangan aktif sebelum menyusun otomatis.');
      const candidates = db()
        .prepare(
          `SELECT DISTINCT ta.subject_id,ta.class_id,s.name AS subject_name,c.name AS class_name
         FROM teaching_assignments ta JOIN subjects s ON s.id=ta.subject_id JOIN classes c ON c.id=ta.class_id
         WHERE ta.academic_year_id=? AND (ta.semester_id IS NULL OR ta.semester_id=?) AND s.is_active=1 AND c.is_active=1
         ORDER BY c.name,s.name`,
        )
        .all(period.academic_year_id, period.semester_id) as Array<{
        subject_id: string;
        class_id: string;
        subject_name: string;
        class_name: string;
      }>;
      let created = 0;
      db().transaction(() => {
        for (const [index, candidate] of candidates.entries()) {
          const already = db()
            .prepare(
              `SELECT e.id FROM exam_schedule_entries e JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
             WHERE e.exam_period_id=? AND e.subject_id=? AND ec.class_id=?`,
            )
            .get(period.id, candidate.subject_id, candidate.class_id);
          if (already) continue;
          const count = participantCount(
            candidate.class_id,
            period.academic_year_id,
            period.start_date,
          );
          let placed = false;
          for (let shift = 0; shift < sessions.length && !placed; shift += 1) {
            const session = sessions[(index + shift) % sessions.length];
            const classBusy = db()
              .prepare(
                `SELECT e.id FROM exam_schedule_entries e JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
               WHERE e.exam_session_id=? AND ec.class_id=?`,
              )
              .get(session.id, candidate.class_id);
            if (classBusy) continue;
            const room = rooms.find(
              (item) =>
                item.capacity >= count &&
                !db()
                  .prepare(
                    'SELECT id FROM exam_schedule_entries WHERE exam_session_id=? AND room_id=?',
                  )
                  .get(session.id, item.id),
            );
            if (!room) continue;
            const entryId = randomUUID();
            db()
              .prepare(
                `INSERT INTO exam_schedule_entries(id,exam_period_id,exam_session_id,subject_id,room_id,assessment_type,duration_minutes,subject_name,room_name)
               VALUES (?,?,?,?,?,'written',?,?,?)`,
              )
              .run(
                entryId,
                period.id,
                session.id,
                candidate.subject_id,
                room.id,
                Math.min(
                  120,
                  Number(session.end_time.slice(0, 2)) * 60 +
                    Number(session.end_time.slice(3)) -
                    (Number(session.start_time.slice(0, 2)) * 60 +
                      Number(session.start_time.slice(3))),
                ),
                candidate.subject_name,
                room.name,
              );
            db()
              .prepare(
                'INSERT INTO exam_schedule_classes(id,exam_schedule_entry_id,class_id,class_name,participant_count) VALUES (?,?,?,?,?)',
              )
              .run(randomUUID(), entryId, candidate.class_id, candidate.class_name, count);
            const teacherCandidates = db()
              .prepare(
                `SELECT t.id,t.name FROM teachers t WHERE t.school_id=? AND t.is_active=1
                 AND NOT EXISTS (
                   SELECT 1 FROM exam_unavailabilities eu WHERE eu.exam_period_id=? AND eu.resource_type='teacher'
                     AND eu.teacher_id=t.id AND eu.exam_date=? AND (eu.exam_session_id IS NULL OR eu.exam_session_id=?)
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM exam_supervisors exs JOIN exam_schedule_entries exe ON exe.id=exs.exam_schedule_entry_id
                   WHERE exs.teacher_id=t.id AND exe.exam_session_id=?
                 ) ORDER BY t.name`,
              )
              .all(schoolId, period.id, session.exam_date, session.id, session.id) as Array<{
              id: string;
              name: string;
            }>;
            const eligible = teacherCandidates
              .filter((teacher) => {
                if (!period.allow_self_supervision) {
                  const self = db()
                    .prepare(
                      `SELECT id FROM teaching_assignments WHERE teacher_id=? AND subject_id=? AND class_id=?
                       AND academic_year_id=? LIMIT 1`,
                    )
                    .get(
                      teacher.id,
                      candidate.subject_id,
                      candidate.class_id,
                      period.academic_year_id,
                    );
                  if (self) return false;
                }
                const daily = (
                  db()
                    .prepare(
                      `SELECT COUNT(*) AS count FROM exam_supervisors exs
                       JOIN exam_schedule_entries exe ON exe.id=exs.exam_schedule_entry_id
                       JOIN exam_sessions exse ON exse.id=exe.exam_session_id
                       WHERE exe.exam_period_id=? AND exs.teacher_id=? AND exse.exam_date=?`,
                    )
                    .get(period.id, teacher.id, session.exam_date) as { count: number }
                ).count;
                return daily < period.max_supervisions_per_teacher_per_day;
              })
              .slice(0, period.supervisors_per_room);
            const insertSupervisor = db().prepare(
              'INSERT INTO exam_supervisors(id,exam_schedule_entry_id,teacher_id,role,teacher_name) VALUES (?,?,?,?,?)',
            );
            for (const [supervisorIndex, teacher] of eligible.entries())
              insertSupervisor.run(
                randomUUID(),
                entryId,
                teacher.id,
                supervisorIndex === 0 ? 'lead' : 'assistant',
                teacher.name,
              );
            created += 1;
            placed = true;
          }
        }
        audit(user.email, 'generate', 'exam_schedule_entries', period.id, {
          created,
          candidates: candidates.length,
        });
      })();
      id = period.id;
      return Response.json(
        { ok: true, id, created, skipped: candidates.length - created },
        { status: 201 },
      );
    } else throw new HttpError(400, 'Aksi tidak dikenal.');
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const body = z
      .object({ action: z.string(), id: idSchema })
      .passthrough()
      .parse(await request.json());
    const schoolId = currentSchoolId();
    if (body.action === 'publish') {
      const user = await requireUser('exam-schedules.publish');
      const period = requirePeriod(schoolId, body.id);
      if (period.status !== 'draft')
        throw new HttpError(409, 'Hanya jadwal draft yang dapat dipublikasikan.');
      const entryCount = (
        db()
          .prepare('SELECT COUNT(*) AS count FROM exam_schedule_entries WHERE exam_period_id=?')
          .get(period.id) as { count: number }
      ).count;
      if (!entryCount) throw new HttpError(409, 'Tambahkan minimal satu jadwal sebelum publikasi.');
      const conflicts = examConflicts(period.id);
      const errors = conflicts.filter((item) => item.severity === 'error');
      if (errors.length) throw new HttpError(409, `Publikasi diblokir: ${errors[0].message}`);
      const warnings = conflicts.filter((item) => item.severity === 'warning');
      const overrideReason = z
        .string()
        .trim()
        .max(500)
        .parse(body.override_reason || '');
      if (warnings.length && (!period.allow_warning_override || !overrideReason))
        throw new HttpError(
          409,
          `Ada ${warnings.length} peringatan. Isi alasan override sebelum publikasi.`,
        );
      const notes = z
        .string()
        .trim()
        .max(500)
        .parse(body.notes || '');
      const version = period.version + 1;
      db().transaction(() => {
        if (warnings.length) {
          const insert = db().prepare(
            'INSERT OR REPLACE INTO exam_conflict_overrides(id,exam_schedule_entry_id,conflict_code,reason,created_by) VALUES (?,?,?,?,?)',
          );
          for (const warning of warnings)
            if (warning.entry_id)
              insert.run(randomUUID(), warning.entry_id, warning.code, overrideReason, user.id);
        }
        db()
          .prepare(
            'INSERT INTO exam_schedule_versions(id,exam_period_id,version,snapshot,notes,published_by) VALUES (?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            period.id,
            version,
            JSON.stringify(periodSnapshot(period.id)),
            notes,
            user.id,
          );
        db()
          .prepare(
            "UPDATE exam_periods SET status='published',version=?,published_at=datetime('now'),published_by=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(version, user.id, period.id);
        audit(user.email, 'publish', 'exam_periods', period.id, {
          version,
          notes,
          warning_overrides: warnings.length,
        });
      })();
    } else {
      const user = await requireUser('exam-schedules.write');
      if (body.action === 'period') {
        const previous = requirePeriod(schoolId, body.id);
        requireDraft(previous);
        const data = periodSchema.parse(body);
        validatePeriod(schoolId, data);
        const entryCount = (
          db()
            .prepare('SELECT COUNT(*) AS count FROM exam_schedule_entries WHERE exam_period_id=?')
            .get(previous.id) as { count: number }
        ).count;
        if (
          entryCount &&
          (data.academic_year_id !== previous.academic_year_id ||
            data.semester_id !== previous.semester_id)
        )
          throw new HttpError(
            409,
            'Tahun ajaran atau semester tidak dapat diubah setelah jadwal berisi penempatan.',
          );
        const outsideSession = db()
          .prepare(
            'SELECT id FROM exam_sessions WHERE exam_period_id=? AND (exam_date<? OR exam_date>?) LIMIT 1',
          )
          .get(previous.id, data.start_date, data.end_date);
        if (outsideSession)
          throw new HttpError(
            409,
            'Rentang baru tidak mencakup seluruh sesi. Sesuaikan sesi terlebih dahulu.',
          );
        db().transaction(() => {
          db()
            .prepare(
              `UPDATE exam_periods SET academic_year_id=?,semester_id=?,name=?,exam_type=?,start_date=?,end_date=?,regular_schedule_policy=?,max_exams_per_class_per_day=?,max_supervisions_per_teacher_per_day=?,supervisors_per_room=?,minimum_break_minutes=?,allow_self_supervision=?,enforce_room_capacity=?,allow_warning_override=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              data.academic_year_id,
              data.semester_id,
              data.name,
              data.exam_type,
              data.start_date,
              data.end_date,
              data.regular_schedule_policy,
              data.max_exams_per_class_per_day,
              data.max_supervisions_per_teacher_per_day,
              data.supervisors_per_room,
              data.minimum_break_minutes,
              Number(data.allow_self_supervision),
              Number(data.enforce_room_capacity),
              Number(data.allow_warning_override),
              previous.id,
            );
          audit(user.email, 'update', 'exam_periods', previous.id, data);
        })();
      } else if (body.action === 'entry') {
        const data = entrySchema.parse(body);
        const existing = db()
          .prepare('SELECT exam_period_id FROM exam_schedule_entries WHERE id=?')
          .get(body.id) as { exam_period_id: string } | undefined;
        if (!existing || existing.exam_period_id !== data.exam_period_id)
          throw new HttpError(404, 'Jadwal ujian tidak ditemukan.');
        saveEntry(body.id, data);
        audit(user.email, 'update', 'exam_schedule_entries', body.id, {
          period_id: data.exam_period_id,
        });
      } else if (body.action === 'session') {
        const data = sessionSchema.parse(body);
        const period = requirePeriod(schoolId, data.exam_period_id);
        requireDraft(period);
        const existing = db()
          .prepare('SELECT id FROM exam_sessions WHERE id=? AND exam_period_id=?')
          .get(body.id, period.id);
        if (!existing) throw new HttpError(404, 'Sesi tidak ditemukan.');
        if (data.exam_date < period.start_date || data.exam_date > period.end_date)
          throw new HttpError(400, 'Tanggal sesi harus berada dalam periode ujian.');
        if (data.start_time >= data.end_time)
          throw new HttpError(400, 'Jam selesai harus setelah jam mulai.');
        const overlap = db()
          .prepare(
            `SELECT id FROM exam_sessions WHERE exam_period_id=? AND exam_date=? AND id<>?
             AND NOT (end_time<=? OR start_time>=?)`,
          )
          .get(period.id, data.exam_date, body.id, data.start_time, data.end_time);
        if (overlap) throw new HttpError(409, 'Waktu sesi bertumpang tindih dengan sesi lain.');
        db().transaction(() => {
          db()
            .prepare(
              `UPDATE exam_sessions SET exam_date=?,name=?,start_time=?,end_time=?,session_order=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              data.exam_date,
              data.name,
              data.start_time,
              data.end_time,
              data.session_order,
              body.id,
            );
          audit(user.email, 'update', 'exam_sessions', body.id, data);
        })();
      } else if (body.action === 'room') {
        const data = roomSchema.parse(body);
        if (!db().prepare('SELECT id FROM rooms WHERE id=? AND school_id=?').get(body.id, schoolId))
          throw new HttpError(404, 'Ruangan tidak ditemukan.');
        db().transaction(() => {
          db()
            .prepare(
              "UPDATE rooms SET code=?,name=?,capacity=?,room_type=?,location=?,facilities=?,is_active=?,updated_at=datetime('now') WHERE id=?",
            )
            .run(
              data.code,
              data.name,
              data.capacity,
              data.room_type,
              data.location,
              JSON.stringify(data.facilities),
              Number(data.is_active),
              body.id,
            );
          audit(user.email, 'update', 'rooms', body.id, data);
        })();
      } else if (body.action === 'revise') {
        const period = requirePeriod(schoolId, body.id);
        if (period.status !== 'published')
          throw new HttpError(409, 'Hanya jadwal published yang dapat direvisi.');
        db().transaction(() => {
          db()
            .prepare("UPDATE exam_periods SET status='draft',updated_at=datetime('now') WHERE id=?")
            .run(period.id);
          audit(user.email, 'revise', 'exam_periods', period.id, { from_version: period.version });
        })();
      } else if (body.action === 'status') {
        const period = requirePeriod(schoolId, body.id);
        const status = z.enum(['completed', 'archived']).parse(body.status);
        if (status === 'completed' && period.status !== 'published')
          throw new HttpError(409, 'Hanya jadwal published yang dapat diselesaikan.');
        if (status === 'archived' && !['published', 'completed'].includes(period.status))
          throw new HttpError(409, 'Draft tidak dapat langsung diarsipkan.');
        db().transaction(() => {
          db()
            .prepare("UPDATE exam_periods SET status=?,updated_at=datetime('now') WHERE id=?")
            .run(status, period.id);
          audit(user.email, status, 'exam_periods', period.id);
        })();
      } else throw new HttpError(400, 'Aksi tidak dikenal.');
    }
    return Response.json({ ok: true, id: body.id });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser('exam-schedules.write');
    const body = z
      .object({
        resource: z.enum(['period', 'session', 'room', 'entry', 'unavailability']),
        id: idSchema,
      })
      .parse(await request.json());
    const schoolId = currentSchoolId();
    let table = '';
    if (body.resource === 'period') {
      const period = requirePeriod(schoolId, body.id);
      requireDraft(period);
      table = 'exam_periods';
    } else if (body.resource === 'session') {
      const row = db()
        .prepare(
          'SELECT ep.* FROM exam_sessions es JOIN exam_periods ep ON ep.id=es.exam_period_id WHERE es.id=? AND ep.school_id=?',
        )
        .get(body.id, schoolId) as Period | undefined;
      if (!row) throw new HttpError(404, 'Sesi tidak ditemukan.');
      requireDraft(row);
      table = 'exam_sessions';
    } else if (body.resource === 'entry') {
      const row = db()
        .prepare(
          'SELECT ep.* FROM exam_schedule_entries e JOIN exam_periods ep ON ep.id=e.exam_period_id WHERE e.id=? AND ep.school_id=?',
        )
        .get(body.id, schoolId) as Period | undefined;
      if (!row) throw new HttpError(404, 'Jadwal tidak ditemukan.');
      requireDraft(row);
      table = 'exam_schedule_entries';
    } else if (body.resource === 'room') {
      if (!db().prepare('SELECT id FROM rooms WHERE id=? AND school_id=?').get(body.id, schoolId))
        throw new HttpError(404, 'Ruangan tidak ditemukan.');
      table = 'rooms';
    } else {
      const row = db()
        .prepare(
          'SELECT ep.* FROM exam_unavailabilities eu JOIN exam_periods ep ON ep.id=eu.exam_period_id WHERE eu.id=? AND ep.school_id=?',
        )
        .get(body.id, schoolId) as Period | undefined;
      if (!row) throw new HttpError(404, 'Data ketidaktersediaan tidak ditemukan.');
      requireDraft(row);
      table = 'exam_unavailabilities';
    }
    db().transaction(() => {
      db().prepare(`DELETE FROM ${table} WHERE id=?`).run(body.id);
      audit(user.email, 'delete', table, body.id);
    })();
    return Response.json({ ok: true, id: body.id });
  } catch (error) {
    return failure(error);
  }
}
