import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { MobileApiError, type MobileTeacherActor } from '@/lib/mobile-api';

export const extracurricularAttendanceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal absensi tidak valid.');

export function extracurricularWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function requireTeacherExtracurricularSession(actor: MobileTeacherActor, sessionId: string) {
  const session = db()
    .prepare(
      `SELECT id,teacher_id,status,attendance_date FROM extracurricular_attendance_sessions
       WHERE id=? AND school_id=? AND teacher_id=?`,
    )
    .get(sessionId, actor.school_id, actor.teacher_id) as
    | {
        id: string;
        teacher_id: string;
        status: 'open' | 'closed';
        attendance_date: string;
      }
    | undefined;
  if (!session)
    throw new MobileApiError(
      404,
      'EXTRACURRICULAR_ATTENDANCE_SESSION_NOT_FOUND',
      'Sesi absensi ekstrakurikuler tidak ditemukan atau bukan milik Anda.',
    );
  return session;
}

export function openTeacherExtracurricularAttendance(
  actor: MobileTeacherActor,
  input: { schedule_id: string; attendance_date: string },
) {
  const schedule = db()
    .prepare(
      `SELECT es.id,es.assignment_id,ea.extracurricular_id,ea.academic_year_id,
        e.name AS extracurricular_name,t.name AS teacher_name
       FROM extracurricular_schedules es
       JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
       JOIN extracurriculars e ON e.id=ea.extracurricular_id
       JOIN teachers t ON t.id=ea.teacher_id
       JOIN semesters sem ON sem.id=es.semester_id
       JOIN academic_years ay ON ay.id=sem.academic_year_id
       WHERE es.id=? AND ea.teacher_id=? AND e.school_id=? AND ay.is_active=1
         AND ea.status='active' AND es.weekday=? AND sem.start_date<=? AND sem.end_date>=?`,
    )
    .get(
      input.schedule_id,
      actor.teacher_id,
      actor.school_id,
      extracurricularWeekday(input.attendance_date),
      input.attendance_date,
      input.attendance_date,
    ) as
    | {
        id: string;
        assignment_id: string;
        extracurricular_id: string;
        academic_year_id: string;
        extracurricular_name: string;
        teacher_name: string;
      }
    | undefined;
  if (!schedule)
    throw new MobileApiError(
      400,
      'INVALID_EXTRACURRICULAR_SCHEDULE',
      'Jadwal ekstrakurikuler tidak berlaku pada tanggal tersebut atau bukan jadwal Anda.',
    );
  const existing = db()
    .prepare(
      `SELECT id FROM extracurricular_attendance_sessions
       WHERE extracurricular_schedule_id=? AND attendance_date=?`,
    )
    .get(schedule.id, input.attendance_date) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const students = db()
    .prepare(
      `SELECT s.id,s.nis,s.name,c.name AS class_name
       FROM extracurricular_participants ep
       JOIN students s ON s.id=ep.student_id AND s.is_active=1
       JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=? AND cm.status='active'
       JOIN classes c ON c.id=cm.class_id
       WHERE ep.assignment_id=? ORDER BY c.name,s.name`,
    )
    .all(schedule.academic_year_id, schedule.assignment_id) as Array<{
    id: string;
    nis: string;
    name: string;
    class_name: string;
  }>;
  if (!students.length)
    throw new MobileApiError(
      409,
      'NO_ACTIVE_EXTRACURRICULAR_PARTICIPANTS',
      'Belum ada peserta aktif pada ekstrakurikuler ini.',
    );

  const id = randomUUID();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO extracurricular_attendance_sessions(id,school_id,extracurricular_schedule_id,assignment_id,extracurricular_id,teacher_id,attendance_date,extracurricular_name,teacher_name,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        actor.school_id,
        schedule.id,
        schedule.assignment_id,
        schedule.extracurricular_id,
        actor.teacher_id,
        input.attendance_date,
        schedule.extracurricular_name,
        schedule.teacher_name,
        actor.user_id,
      );
    const insert = db().prepare(
      `INSERT INTO extracurricular_attendance_records(id,session_id,student_id,student_nis,student_name,class_name,status,source,updated_by)
       VALUES (?,?,?,?,?,?,'absent','native_app',?)`,
    );
    for (const student of students)
      insert.run(
        randomUUID(),
        id,
        student.id,
        student.nis,
        student.name,
        student.class_name,
        actor.user_id,
      );
    audit(actor.email, 'create', 'extracurricular_attendance_sessions', id, {
      source: 'mobile',
      schedule_id: schedule.id,
      attendance_date: input.attendance_date,
      student_count: students.length,
    });
  })();
  return { id, created: true };
}
