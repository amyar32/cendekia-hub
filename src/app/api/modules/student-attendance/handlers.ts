import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { can } from '@/config/modules';
import { activeAcademicYear, currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser, type SessionUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal absensi tidak valid.');
const recordStatus = z.enum(['present', 'late', 'sick', 'excused', 'absent']);
const createSchema = z.object({
  schedule_id: z.string().uuid('Jadwal tidak valid.'),
  attendance_date: dateSchema,
});
const updateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('records'),
    session_id: z.string().uuid(),
    records: z
      .array(
        z.object({ id: z.string().uuid(), status: recordStatus, note: z.string().trim().max(500) }),
      )
      .min(1),
  }),
  z.object({ action: z.literal('close'), session_id: z.string().uuid() }),
]);

type AttendanceSession = { id: string; teacher_id: string; status: 'open' | 'closed' };

function weekday(date: string) {
  const value = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (value === 0)
    throw new HttpError(400, 'Absensi sesi pelajaran tidak tersedia pada hari Minggu.');
  return value;
}

function teacherForUser(userId: string, schoolId: string) {
  return db()
    .prepare('SELECT id FROM teachers WHERE user_id=? AND school_id=? AND is_active=1')
    .get(userId, schoolId) as { id: string } | undefined;
}

function canManage(user: SessionUser, schoolId: string, teacherId: string) {
  return (
    can(user.permissions, 'student-attendance.approve') ||
    teacherForUser(user.id, schoolId)?.id === teacherId
  );
}

function requireSession(schoolId: string, id: string) {
  const session = db()
    .prepare(
      'SELECT id,teacher_id,status FROM student_attendance_sessions WHERE id=? AND school_id=?',
    )
    .get(id, schoolId) as AttendanceSession | undefined;
  if (!session) throw new HttpError(404, 'Sesi absensi tidak ditemukan.');
  return session;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser('student-attendance.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const date = dateSchema.parse(
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10),
    );
    const teacher = teacherForUser(user.id, schoolId);
    const unrestricted =
      can(user.permissions, 'student-attendance.approve') ||
      can(user.permissions, 'student-attendance.report');
    if (!unrestricted && !teacher)
      throw new HttpError(403, 'Akun ini belum ditautkan ke data guru aktif.');
    const sessionId = (url.searchParams.get('session_id') || '').trim();
    if (sessionId) {
      const session = requireSession(schoolId, sessionId);
      if (!unrestricted && session.teacher_id !== teacher?.id)
        throw new HttpError(403, 'Anda hanya dapat melihat absensi kelas yang Anda ampu.');
      const records = db()
        .prepare(
          `SELECT id,student_id,student_nis,student_name,status,note,source,recorded_at,updated_at
           FROM student_attendance_records WHERE session_id=? ORDER BY student_name`,
        )
        .all(sessionId);
      return Response.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const day = weekday(date);
    const activeYear = activeAcademicYear(schoolId);
    const semester = db()
      .prepare(
        `SELECT name FROM semesters
         WHERE academic_year_id=? AND start_date<=? AND end_date>=? LIMIT 1`,
      )
      .get(activeYear.id, date, date) as { name: string } | undefined;
    const dateNotice =
      date < activeYear.start_date || date > activeYear.end_date
        ? `Tanggal ${date} berada di luar tahun ajaran aktif ${activeYear.name} (${activeYear.start_date} sampai ${activeYear.end_date}).`
        : !semester
          ? `Tanggal ${date} tidak berada dalam periode semester tahun ajaran aktif ${activeYear.name}.`
          : null;
    const schedules = db()
      .prepare(
        `SELECT cs.id AS schedule_id,ta.id AS teaching_assignment_id,ta.teacher_id,c.name AS class_name,
                s.name AS subject_name,t.name AS teacher_name,sts.name AS slot_name,sts.start_time,sts.end_time,
                ats.id AS session_id,ats.status AS session_status,
                COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id), 0) AS student_count,
                COALESCE((SELECT COUNT(*) FROM student_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'), 0) AS present_count
         FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         JOIN classes c ON c.id=ta.class_id JOIN subjects s ON s.id=ta.subject_id
         JOIN teachers t ON t.id=ta.teacher_id JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
         JOIN semesters sem ON sem.id=cs.semester_id JOIN academic_years ay ON ay.id=sem.academic_year_id
         LEFT JOIN student_attendance_sessions ats ON ats.class_schedule_id=cs.id AND ats.attendance_date=?
         WHERE t.school_id=? AND ay.is_active=1 AND cs.weekday=? AND sem.start_date<=? AND sem.end_date>=?
           AND (?=1 OR ta.teacher_id=?)
         ORDER BY sts.start_time,c.name,s.name`,
      )
      .all(date, schoolId, day, date, date, unrestricted ? 1 : 0, teacher?.id ?? '') as Record<
      string,
      unknown
    >[];
    return Response.json({
      date,
      schedules,
      date_notice: dateNotice,
      academic_year: activeYear,
      can_approve: can(user.permissions, 'student-attendance.approve'),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser('student-attendance.write');
    const data = createSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const day = weekday(data.attendance_date);
    const schedule = db()
      .prepare(
        `SELECT cs.id,ta.id AS teaching_assignment_id,ta.teacher_id,ta.class_id,c.name AS class_name,
                s.name AS subject_name,t.name AS teacher_name
         FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         JOIN classes c ON c.id=ta.class_id JOIN subjects s ON s.id=ta.subject_id
         JOIN teachers t ON t.id=ta.teacher_id JOIN semesters sem ON sem.id=cs.semester_id
         JOIN academic_years ay ON ay.id=sem.academic_year_id
         WHERE cs.id=? AND t.school_id=? AND ay.is_active=1 AND cs.weekday=?
           AND sem.start_date<=? AND sem.end_date>=?`,
      )
      .get(data.schedule_id, schoolId, day, data.attendance_date, data.attendance_date) as
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
    if (!schedule) throw new HttpError(400, 'Jadwal tidak berlaku pada tanggal absensi.');
    if (!canManage(user, schoolId, schedule.teacher_id))
      throw new HttpError(403, 'Anda hanya dapat membuka absensi untuk jadwal mengajar sendiri.');
    const id = randomUUID();
    db().transaction(() => {
      db()
        .prepare(
          `INSERT INTO student_attendance_sessions(id,school_id,class_schedule_id,teaching_assignment_id,class_id,teacher_id,attendance_date,subject_name,class_name,teacher_name,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          schoolId,
          schedule.id,
          schedule.teaching_assignment_id,
          schedule.class_id,
          schedule.teacher_id,
          data.attendance_date,
          schedule.subject_name,
          schedule.class_name,
          schedule.teacher_name,
          user.id,
        );
      const students = db()
        .prepare(
          `SELECT s.id,s.nis,s.name FROM class_memberships cm JOIN students s ON s.id=cm.student_id
           WHERE cm.class_id=? AND cm.status='active' AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
           ORDER BY s.name`,
        )
        .all(schedule.class_id, data.attendance_date, data.attendance_date) as {
        id: string;
        nis: string;
        name: string;
      }[];
      if (!students.length)
        throw new HttpError(
          409,
          'Tidak ada siswa aktif pada rombel ini untuk tanggal absensi yang dipilih.',
        );
      const insertRecord = db().prepare(
        `INSERT INTO student_attendance_records(id,session_id,student_id,student_nis,student_name,status,updated_by)
         VALUES (?,?,?,?,?,'absent',?)`,
      );
      for (const student of students)
        insertRecord.run(randomUUID(), id, student.id, student.nis, student.name, user.id);
      audit(user.email, 'create', 'student_attendance_sessions', id, {
        attendance_date: data.attendance_date,
        schedule_id: schedule.id,
        student_count: students.length,
      });
    })();
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser('student-attendance.write');
    const data = updateSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const session = requireSession(schoolId, data.session_id);
    if (!canManage(user, schoolId, session.teacher_id))
      throw new HttpError(403, 'Anda hanya dapat mengubah absensi kelas yang Anda ampu.');
    if (session.status === 'closed' && !can(user.permissions, 'student-attendance.approve'))
      throw new HttpError(
        409,
        'Sesi sudah ditutup dan hanya dapat dikoreksi oleh petugas berwenang.',
      );
    db().transaction(() => {
      if (data.action === 'close') {
        db()
          .prepare(
            "UPDATE student_attendance_sessions SET status='closed',closed_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
          )
          .run(session.id);
        audit(user.email, 'close', 'student_attendance_sessions', session.id);
        return;
      }
      const update = db().prepare(
        `UPDATE student_attendance_records SET status=?,note=?,source=?,updated_by=?,updated_at=datetime('now') WHERE id=? AND session_id=?`,
      );
      for (const record of data.records)
        update.run(
          record.status,
          record.note,
          can(user.permissions, 'student-attendance.approve') ? 'admin' : 'teacher',
          user.id,
          record.id,
          session.id,
        );
      audit(user.email, 'update', 'student_attendance_records', session.id, {
        count: data.records.length,
      });
    })();
    return Response.json({ ok: true, id: session.id });
  } catch (error) {
    return failure(error);
  }
}
