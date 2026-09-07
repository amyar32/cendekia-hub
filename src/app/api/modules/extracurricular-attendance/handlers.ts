import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { can } from '@/config/modules';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser, type SessionUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal absensi tidak valid.');
const status = z.enum(['present', 'late', 'sick', 'excused', 'absent']);
const createSchema = z.object({ schedule_id: z.string().uuid(), attendance_date: dateSchema });
const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('records'),
    session_id: z.string().uuid(),
    records: z
      .array(z.object({ id: z.string().uuid(), status, note: z.string().trim().max(500) }))
      .min(1),
  }),
  z.object({ action: z.literal('close'), session_id: z.string().uuid() }),
]);
function weekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!day) throw new HttpError(400, 'Sesi ekstrakurikuler tidak tersedia pada hari Minggu.');
  return day;
}
function teacherForUser(userId: string, schoolId: string) {
  return db()
    .prepare('SELECT id FROM teachers WHERE user_id=? AND school_id=? AND is_active=1')
    .get(userId, schoolId) as { id: string } | undefined;
}
function mayManage(user: SessionUser, schoolId: string, teacherId: string) {
  return (
    can(user.permissions, 'extracurricular-attendance.approve') ||
    teacherForUser(user.id, schoolId)?.id === teacherId
  );
}
function session(schoolId: string, id: string) {
  const row = db()
    .prepare(
      'SELECT id,teacher_id,status FROM extracurricular_attendance_sessions WHERE id=? AND school_id=?',
    )
    .get(id, schoolId) as { id: string; teacher_id: string; status: 'open' | 'closed' } | undefined;
  if (!row) throw new HttpError(404, 'Sesi absensi tidak ditemukan.');
  return row;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser('extracurricular-attendance.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const sessionId = (url.searchParams.get('session_id') || '').trim();
    const teacher = teacherForUser(user.id, schoolId);
    const unrestricted = can(user.permissions, 'extracurricular-attendance.approve');
    if (!unrestricted && !teacher)
      throw new HttpError(403, 'Akun ini belum ditautkan ke data guru aktif.');
    if (sessionId) {
      const current = session(schoolId, sessionId);
      if (!unrestricted && current.teacher_id !== teacher?.id)
        throw new HttpError(403, 'Anda hanya dapat melihat ekskul yang dibina.');
      const records = db()
        .prepare(
          'SELECT id,student_nis,student_name,class_name,status,note FROM extracurricular_attendance_records WHERE session_id=? ORDER BY class_name,student_name',
        )
        .all(sessionId);
      return Response.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const date = dateSchema.parse(
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10),
    );
    const day = weekday(date);
    const schedules = db()
      .prepare(
        `SELECT es.id AS schedule_id,e.name AS extracurricular_name,t.name AS teacher_name,sts.name AS slot_name,sts.start_time,sts.end_time,ats.id AS session_id,ats.status AS session_status,COALESCE((SELECT count(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id),0) AS student_count,COALESCE((SELECT count(*) FROM extracurricular_attendance_records ar WHERE ar.session_id=ats.id AND ar.status='present'),0) AS present_count FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id JOIN schedule_time_slots sts ON sts.id=es.time_slot_id JOIN semesters sem ON sem.id=es.semester_id LEFT JOIN extracurricular_attendance_sessions ats ON ats.extracurricular_schedule_id=es.id AND ats.attendance_date=? WHERE t.school_id=? AND ea.status='active' AND es.weekday=? AND sem.start_date<=? AND sem.end_date>=? AND (?=1 OR ea.teacher_id=?) ORDER BY sts.start_time,e.name`,
      )
      .all(date, schoolId, day, date, date, unrestricted ? 1 : 0, teacher?.id ?? '');
    return Response.json({ date, schedules }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser('extracurricular-attendance.write');
    const data = createSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const day = weekday(data.attendance_date);
    const schedule = db()
      .prepare(
        `SELECT es.id,es.assignment_id,ea.extracurricular_id,ea.academic_year_id,ea.teacher_id,e.name AS extracurricular_name,t.name AS teacher_name FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id JOIN semesters sem ON sem.id=es.semester_id WHERE es.id=? AND t.school_id=? AND ea.status='active' AND es.weekday=? AND sem.start_date<=? AND sem.end_date>=?`,
      )
      .get(data.schedule_id, schoolId, day, data.attendance_date, data.attendance_date) as
      | {
          id: string;
          assignment_id: string;
          extracurricular_id: string;
          academic_year_id: string;
          teacher_id: string;
          extracurricular_name: string;
          teacher_name: string;
        }
      | undefined;
    if (!schedule)
      throw new HttpError(400, 'Jadwal ekstrakurikuler tidak berlaku pada tanggal ini.');
    if (!mayManage(user, schoolId, schedule.teacher_id))
      throw new HttpError(403, 'Anda hanya dapat membuka absensi ekskul yang dibina.');
    const id = randomUUID();
    db().transaction(() => {
      db()
        .prepare(
          'INSERT INTO extracurricular_attendance_sessions(id,school_id,extracurricular_schedule_id,assignment_id,extracurricular_id,teacher_id,attendance_date,extracurricular_name,teacher_name,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          schoolId,
          schedule.id,
          schedule.assignment_id,
          schedule.extracurricular_id,
          schedule.teacher_id,
          data.attendance_date,
          schedule.extracurricular_name,
          schedule.teacher_name,
          user.id,
        );
      const students = db()
        .prepare(
          `SELECT s.id,s.nis,s.name,COALESCE(c.name,'—') AS class_name FROM extracurricular_participants ep JOIN students s ON s.id=ep.student_id LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=? AND cm.status='active' LEFT JOIN classes c ON c.id=cm.class_id WHERE ep.assignment_id=? ORDER BY class_name,s.name`,
        )
        .all(schedule.academic_year_id, schedule.assignment_id) as {
        id: string;
        nis: string;
        name: string;
        class_name: string;
      }[];
      if (!students.length)
        throw new HttpError(
          409,
          'Belum ada peserta aktif pada ekstrakurikuler ini. Tambahkan peserta sebelum membuka absensi.',
        );
      const insert = db().prepare(
        "INSERT INTO extracurricular_attendance_records(id,session_id,student_id,student_nis,student_name,class_name,status,updated_by) VALUES(?,?,?,?,?,?,'absent',?)",
      );
      for (const student of students)
        insert.run(
          randomUUID(),
          id,
          student.id,
          student.nis,
          student.name,
          student.class_name,
          user.id,
        );
      audit(user.email, 'create', 'extracurricular_attendance_sessions', id, {
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
    const user = await requireUser('extracurricular-attendance.write');
    const data = patchSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const current = session(schoolId, data.session_id);
    if (!mayManage(user, schoolId, current.teacher_id))
      throw new HttpError(403, 'Anda hanya dapat mengubah absensi ekskul yang dibina.');
    if (current.status === 'closed' && !can(user.permissions, 'extracurricular-attendance.approve'))
      throw new HttpError(409, 'Sesi sudah ditutup.');
    db().transaction(() => {
      if (data.action === 'close') {
        db()
          .prepare(
            "UPDATE extracurricular_attendance_sessions SET status='closed',closed_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
          )
          .run(current.id);
        audit(user.email, 'close', 'extracurricular_attendance_sessions', current.id);
        return;
      }
      const update = db().prepare(
        "UPDATE extracurricular_attendance_records SET status=?,note=?,source=?,updated_by=?,updated_at=datetime('now') WHERE id=? AND session_id=?",
      );
      for (const record of data.records)
        update.run(
          record.status,
          record.note,
          can(user.permissions, 'extracurricular-attendance.approve') ? 'admin' : 'teacher',
          user.id,
          record.id,
          current.id,
        );
      audit(user.email, 'update', 'extracurricular_attendance_records', current.id, {
        count: data.records.length,
      });
    })();
    return Response.json({ ok: true, id: current.id });
  } catch (error) {
    return failure(error);
  }
}
