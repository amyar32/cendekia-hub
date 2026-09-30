import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { isoWeekday } from '@/lib/dates';
import { MobileApiError, type MobileTeacherActor } from '@/lib/mobile-api';

const status = z.enum(['present', 'late', 'sick', 'excused', 'absent']);
const activity = z.enum(['none', 'new', 'review']);
const result = z.enum(['not_assessed', 'fluent', 'repeat', 'not_submitted']);
export const createTahfidzSessionSchema = z.object({
  schedule_id: z.string().uuid(),
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const updateTahfidzRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        id: z.string().uuid(),
        status,
        activity_type: activity,
        surah_number: z.number().int().min(1).max(114).nullable(),
        ayah_from: z.number().int().min(1).nullable(),
        ayah_to: z.number().int().min(1).nullable(),
        result,
        note: z.string().trim().max(500),
      }),
    )
    .min(1),
});
function schedule(actor: MobileTeacherActor, id: string, date: string) {
  return db()
    .prepare(
      `SELECT tg.id,tg.teacher_id,tg.academic_year_id,tg.name group_name,t.name teacher_name FROM tahfidz_groups tg JOIN teachers t ON t.id=tg.teacher_id JOIN academic_years ay ON ay.id=tg.academic_year_id LEFT JOIN semesters sem ON sem.id=tg.semester_id WHERE tg.id=? AND tg.school_id=? AND tg.teacher_id=? AND tg.status='active' AND ay.is_active=1 AND EXISTS(SELECT 1 FROM json_each(tg.weekdays) WHERE value=?) AND (tg.semester_id IS NULL OR (sem.start_date<=? AND sem.end_date>=?))`,
    )
    .get(id, actor.school_id, actor.teacher_id, isoWeekday(date), date, date) as
    | {
        id: string;
        teacher_id: string;
        academic_year_id: string;
        group_name: string;
        teacher_name: string;
      }
    | undefined;
}
export function openTahfidzSession(
  actor: MobileTeacherActor,
  input: z.infer<typeof createTahfidzSessionSchema>,
) {
  const row = schedule(actor, input.schedule_id, input.attendance_date);
  if (!row)
    throw new MobileApiError(
      400,
      'INVALID_TAHFIDZ_SCHEDULE',
      'Jadwal halaqah tidak berlaku pada tanggal tersebut atau bukan jadwal Anda.',
    );
  const existing = db()
    .prepare('SELECT id FROM tahfidz_sessions WHERE group_id=? AND attendance_date=?')
    .get(row.id, input.attendance_date) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };
  const students = db()
    .prepare(
      `SELECT s.id,s.nis,s.name,c.name class_name FROM tahfidz_group_members gm JOIN students s ON s.id=gm.student_id AND s.is_active=1 JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=? AND cm.status='active' JOIN classes c ON c.id=cm.class_id WHERE gm.group_id=? ORDER BY c.name,s.name`,
    )
    .all(row.academic_year_id, row.id) as Array<{
    id: string;
    nis: string;
    name: string;
    class_name: string;
  }>;
  if (!students.length)
    throw new MobileApiError(
      409,
      'NO_TAHFIDZ_PARTICIPANTS',
      'Belum ada peserta aktif pada kelompok ini.',
    );
  const id = randomUUID();
  db().transaction(() => {
    db()
      .prepare(
        'INSERT INTO tahfidz_sessions(id,school_id,group_id,teacher_id,attendance_date,group_name,teacher_name,created_by) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        actor.school_id,
        row.id,
        row.teacher_id,
        input.attendance_date,
        row.group_name,
        row.teacher_name,
        actor.user_id,
      );
    const insert = db().prepare(
      "INSERT INTO tahfidz_session_records(id,session_id,student_id,student_nis,student_name,class_name,status,source,updated_by) VALUES(?,?,?,?,?,?,'absent','native_app',?)",
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
    audit(actor.email, 'create', 'tahfidz_sessions', id, {
      source: 'mobile',
      group_id: row.id,
      student_count: students.length,
    });
  })();
  return { id, created: true };
}
export function requireTahfidzSession(actor: MobileTeacherActor, id: string) {
  const row = db()
    .prepare(
      'SELECT id,status,teacher_id FROM tahfidz_sessions WHERE id=? AND school_id=? AND teacher_id=?',
    )
    .get(id, actor.school_id, actor.teacher_id) as
    { id: string; status: 'open' | 'closed'; teacher_id: string } | undefined;
  if (!row)
    throw new MobileApiError(
      404,
      'TAHFIDZ_SESSION_NOT_FOUND',
      'Sesi halaqah tidak ditemukan atau bukan milik Anda.',
    );
  return row;
}
export function updateTahfidzRecords(
  actor: MobileTeacherActor,
  id: string,
  input: z.infer<typeof updateTahfidzRecordsSchema>,
) {
  const session = requireTahfidzSession(actor, id);
  if (session.status === 'closed')
    throw new MobileApiError(409, 'TAHFIDZ_SESSION_CLOSED', 'Sesi sudah ditutup.');
  for (const row of input.records) {
    if (row.ayah_from && row.ayah_to && row.ayah_from > row.ayah_to)
      throw new MobileApiError(
        400,
        'INVALID_AYAH_RANGE',
        'Ayat awal tidak boleh melebihi ayat akhir.',
      );
    if (row.activity_type === 'none' && (row.surah_number || row.ayah_from || row.ayah_to))
      throw new MobileApiError(
        400,
        'INVALID_MEMORIZATION',
        'Pilih jenis setoran untuk menyimpan surat dan ayat.',
      );
  }
  db().transaction(() => {
    const update = db().prepare(
      "UPDATE tahfidz_session_records SET status=?,activity_type=?,surah_number=?,ayah_from=?,ayah_to=?,result=?,note=?,source='native_app',updated_by=?,updated_at=datetime('now') WHERE id=? AND session_id=?",
    );
    for (const row of input.records)
      update.run(
        row.status,
        row.activity_type,
        row.surah_number,
        row.ayah_from,
        row.ayah_to,
        row.result,
        row.note,
        actor.user_id,
        row.id,
        id,
      );
    audit(actor.email, 'update', 'tahfidz_session_records', id, {
      source: 'mobile',
      count: input.records.length,
    });
  })();
}
export function closeTahfidzSession(actor: MobileTeacherActor, id: string) {
  const session = requireTahfidzSession(actor, id);
  if (session.status === 'closed') return;
  db()
    .prepare(
      "UPDATE tahfidz_sessions SET status='closed',closed_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
    )
    .run(id);
  audit(actor.email, 'close', 'tahfidz_sessions', id, { source: 'mobile' });
}
