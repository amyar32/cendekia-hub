import { randomUUID } from 'node:crypto';
import { audit, db } from '@/lib/db';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { MobileApiError, type MobileTeacherActor } from '@/lib/mobile-api';
import { isoDateSchema } from '@/lib/validation';

export const attendanceDateSchema = isoDateSchema('Tanggal absensi tidak valid.');

export type TeacherAttendanceSession = {
  id: string;
  teacher_id: string;
  status: 'open' | 'closed';
  attendance_date: string;
};

export function weekday(date: string) {
  const value = new Date(`${date}T12:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
}

export function requireTeacherSession(actor: MobileTeacherActor, sessionId: string) {
  const session = db()
    .prepare(
      `SELECT id,teacher_id,status,attendance_date FROM student_attendance_sessions
       WHERE id=? AND school_id=? AND teacher_id=?`,
    )
    .get(sessionId, actor.school_id, actor.teacher_id) as TeacherAttendanceSession | undefined;
  if (!session)
    throw new MobileApiError(
      404,
      'ATTENDANCE_SESSION_NOT_FOUND',
      'Sesi absensi tidak ditemukan atau bukan milik Anda.',
    );
  return session;
}

export function openTeacherAttendance(
  actor: MobileTeacherActor,
  input: { schedule_id: string; attendance_date: string },
) {
  const schedule = db()
    .prepare(
      `SELECT cs.id,ta.id AS teaching_assignment_id,ta.teacher_id,ta.class_id,
        c.name AS class_name,s.name AS subject_name,t.name AS teacher_name
       FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
       JOIN classes c ON c.id=ta.class_id JOIN subjects s ON s.id=ta.subject_id
       JOIN teachers t ON t.id=ta.teacher_id JOIN semesters sem ON sem.id=cs.semester_id
       JOIN academic_years ay ON ay.id=sem.academic_year_id
       WHERE cs.id=? AND ta.teacher_id=? AND t.school_id=? AND ay.is_active=1
         AND cs.archived_at IS NULL AND cs.weekday=? AND sem.start_date<=? AND sem.end_date>=?`,
    )
    .get(
      input.schedule_id,
      actor.teacher_id,
      actor.school_id,
      weekday(input.attendance_date),
      input.attendance_date,
      input.attendance_date,
    ) as
    | {
        id: string;
        teaching_assignment_id: string;
        teacher_id: string;
        class_id: string;
        class_name: string;
        subject_name: string;
        teacher_name: string;
      }
    | undefined;
  if (!schedule)
    throw new MobileApiError(
      400,
      'INVALID_SCHEDULE',
      'Jadwal tidak berlaku pada tanggal tersebut atau bukan jadwal Anda.',
    );
  const block = regularScheduleBlock(actor.school_id, schedule.class_id, input.attendance_date);
  if (block)
    throw new MobileApiError(
      409,
      'LESSON_SUSPENDED',
      `Absensi tidak dapat dibuka karena KBM ditangguhkan oleh periode ujian ${block.name}.`,
    );
  const existing = db()
    .prepare(
      'SELECT id FROM student_attendance_sessions WHERE class_schedule_id=? AND attendance_date=?',
    )
    .get(schedule.id, input.attendance_date) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const students = db()
    .prepare(
      `SELECT s.id,s.nis,s.name FROM class_memberships cm JOIN students s ON s.id=cm.student_id
       WHERE cm.class_id=? AND cm.academic_year_id=(SELECT academic_year_id FROM classes WHERE id=?)
         AND cm.status='active' AND s.is_active=1 AND cm.start_date<=?
         AND (cm.end_date IS NULL OR cm.end_date>=?) ORDER BY s.name`,
    )
    .all(
      schedule.class_id,
      schedule.class_id,
      input.attendance_date,
      input.attendance_date,
    ) as Array<{ id: string; nis: string; name: string }>;
  if (!students.length)
    throw new MobileApiError(
      409,
      'NO_ACTIVE_STUDENTS',
      'Tidak ada murid aktif pada rombel ini untuk tanggal yang dipilih.',
    );
  const id = randomUUID();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO student_attendance_sessions(id,school_id,class_schedule_id,teaching_assignment_id,class_id,teacher_id,attendance_date,subject_name,class_name,teacher_name,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        actor.school_id,
        schedule.id,
        schedule.teaching_assignment_id,
        schedule.class_id,
        actor.teacher_id,
        input.attendance_date,
        schedule.subject_name,
        schedule.class_name,
        schedule.teacher_name,
        actor.user_id,
      );
    const insert = db().prepare(
      `INSERT INTO student_attendance_records(id,session_id,student_id,student_nis,student_name,status,source,updated_by)
       VALUES (?,?,?,?,?,'absent','native_app',?)`,
    );
    for (const student of students)
      insert.run(randomUUID(), id, student.id, student.nis, student.name, actor.user_id);
    audit(actor.email, 'create', 'student_attendance_sessions', id, {
      source: 'mobile',
      schedule_id: schedule.id,
      attendance_date: input.attendance_date,
      student_count: students.length,
    });
  })();
  return { id, created: true };
}
