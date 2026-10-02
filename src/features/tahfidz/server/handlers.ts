import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  academicYearOptions,
  currentSchoolId,
  requireAcademicYear,
  requireSemester,
} from '@/lib/server/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { listParams } from '@/lib/server/list-params';

const groupSchema = z
  .object({
    academic_year_id: z.string().uuid('Tahun ajaran tidak valid.').optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Nama kelompok minimal 2 karakter.')
      .max(100, 'Nama kelompok maksimal 100 karakter.'),
    teacher_id: z.string().uuid('Pilih pembimbing yang valid.'),
    semester_id: z
      .union([z.literal('all'), z.string().uuid('Semester tidak valid.')])
      .default('all'),
    time_slot_id: z.string().uuid('Pilih slot jadwal yang valid.'),
    weekdays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, 'Pilih minimal satu hari kegiatan.')
      .max(7, 'Hari kegiatan tidak valid.'),
    location: z.string().trim().max(100).default(''),
    quota: z.coerce
      .number()
      .int()
      .min(1, 'Kuota minimal 1 murid.')
      .max(100, 'Kuota maksimal 100 murid.')
      .default(10),
    status: z.enum(['draft', 'active', 'completed']).default('active'),
    student_ids: z
      .array(z.string().uuid('Peserta tidak valid.'))
      .max(100, 'Peserta maksimal 100 murid.'),
  })
  .superRefine((value, context) => {
    if (value.status === 'active' && value.student_ids.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['student_ids'],
        message: 'Kelompok aktif harus memiliki peserta.',
      });
    if (new Set(value.weekdays).size !== value.weekdays.length)
      context.addIssue({
        code: 'custom',
        path: ['weekdays'],
        message: 'Hari tidak boleh berulang.',
      });
    if (new Set(value.student_ids).size !== value.student_ids.length)
      context.addIssue({
        code: 'custom',
        path: ['student_ids'],
        message: 'Peserta tidak boleh berulang.',
      });
  });

function ownedGroup(schoolId: string, id: string) {
  const row = db()
    .prepare('SELECT * FROM tahfidz_groups WHERE id=? AND school_id=?')
    .get(id, schoolId) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Kelompok halaqah tidak ditemukan.');
  return row;
}
function validGroup(
  schoolId: string,
  id: string,
  yearId: string,
  data: z.infer<typeof groupSchema>,
) {
  const year = requireAcademicYear(schoolId, yearId);
  const activeYear = activeAcademicYear(schoolId);
  if (year.start_date < activeYear.start_date)
    throw new HttpError(409, 'Kelompok tahun ajaran yang sudah selesai hanya dapat dilihat.');
  if (data.status === 'active' && yearId !== activeYear.id)
    throw new HttpError(
      409,
      'Kelompok draft dapat diaktifkan setelah pergantian tahun ajaran selesai.',
    );
  const membershipYear = year.start_date > activeYear.start_date ? activeYear.id : yearId;
  const semesterId = data.semester_id === 'all' ? null : data.semester_id;
  if (semesterId && requireSemester(schoolId, semesterId).academic_year_id !== yearId)
    throw new HttpError(400, 'Semester tidak berada dalam tahun ajaran yang dipilih.');
  const slot = db()
    .prepare(
      'SELECT start_time,end_time,is_active,is_break FROM schedule_time_slots WHERE id=? AND school_id=?',
    )
    .get(data.time_slot_id, schoolId) as
    { start_time: string; end_time: string; is_active: number; is_break: number } | undefined;
  if (!slot || !slot.is_active || slot.is_break)
    throw new HttpError(400, 'Pilih slot jadwal aktif yang bukan waktu istirahat.');
  const teacher = db()
    .prepare('SELECT id FROM teachers WHERE id=? AND school_id=? AND is_active=1')
    .get(data.teacher_id, schoolId);
  if (!teacher) throw new HttpError(400, 'Pembimbing tidak aktif atau tidak valid.');
  const activeStudents = db()
    .prepare(
      `SELECT s.id FROM students s JOIN class_memberships cm ON cm.student_id=s.id WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id IN (?,?) AND cm.status='active' AND s.id=?`,
    )
    .pluck();
  for (const studentId of data.student_ids)
    if (!activeStudents.get(schoolId, yearId, membershipYear, studentId))
      throw new HttpError(400, 'Semua peserta harus murid aktif pada tahun ajaran yang dipilih.');
  if (data.student_ids.length > data.quota)
    throw new HttpError(400, 'Jumlah peserta melebihi kuota kelompok.');
  if (data.status !== 'active') return semesterId;
  const conflict = db().prepare(
    `SELECT 1 FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id JOIN schedule_time_slots s ON s.id=cs.time_slot_id WHERE cs.archived_at IS NULL AND cs.weekday=? AND cs.semester_id=COALESCE(?,cs.semester_id) AND ta.teacher_id=? AND ta.academic_year_id=? AND NOT(s.end_time<=? OR s.start_time>=?) LIMIT 1`,
  );
  const teacherGroup = db().prepare(
    `SELECT 1 FROM tahfidz_groups tg JOIN schedule_time_slots s ON s.id=tg.time_slot_id WHERE tg.id<>? AND tg.status='active' AND tg.academic_year_id=? AND tg.teacher_id=? AND EXISTS(SELECT 1 FROM json_each(tg.weekdays) WHERE value=?) AND (tg.semester_id IS NULL OR ? IS NULL OR tg.semester_id=?) AND NOT(s.end_time<=? OR s.start_time>=?) LIMIT 1`,
  );
  const memberConflict = db().prepare(
    `SELECT 1 FROM tahfidz_group_members gm JOIN tahfidz_groups tg ON tg.id=gm.group_id JOIN schedule_time_slots s ON s.id=tg.time_slot_id WHERE tg.id<>? AND tg.status='active' AND tg.academic_year_id=? AND gm.student_id=? AND EXISTS(SELECT 1 FROM json_each(tg.weekdays) WHERE value=?) AND (tg.semester_id IS NULL OR ? IS NULL OR tg.semester_id=?) AND NOT(s.end_time<=? OR s.start_time>=?) LIMIT 1`,
  );
  const studentLesson = db().prepare(
    `SELECT 1 FROM class_schedules cs
     JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
     JOIN class_memberships cm ON cm.class_id=ta.class_id AND cm.academic_year_id=ta.academic_year_id
     JOIN schedule_time_slots s ON s.id=cs.time_slot_id
     WHERE cs.archived_at IS NULL AND cm.student_id=? AND cm.status='active' AND ta.academic_year_id=? AND cs.weekday=?
       AND cs.semester_id=COALESCE(?,cs.semester_id) AND NOT(s.end_time<=? OR s.start_time>=?) LIMIT 1`,
  );
  const extracurricular = db().prepare(`SELECT 1 FROM extracurricular_schedules es
    JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
    JOIN schedule_time_slots slot ON slot.id=es.time_slot_id
    WHERE ea.academic_year_id=? AND ea.status<>'completed' AND es.weekday=?
      AND (? IS NULL OR es.semester_id=?) AND NOT(slot.end_time<=? OR slot.start_time>=?)
      AND (ea.teacher_id=? OR EXISTS(SELECT 1 FROM extracurricular_participants ep
        WHERE ep.assignment_id=ea.id AND ep.student_id=?)) LIMIT 1`);
  for (const weekday of data.weekdays) {
    for (const studentId of data.student_ids)
      if (
        extracurricular.get(
          yearId,
          weekday,
          semesterId,
          semesterId,
          slot.start_time,
          slot.end_time,
          data.teacher_id,
          studentId,
        )
      )
        throw new HttpError(
          409,
          'Pembimbing atau peserta memiliki jadwal ekstrakurikuler yang bentrok.',
        );
    if (conflict.get(weekday, semesterId, data.teacher_id, yearId, slot.start_time, slot.end_time))
      throw new HttpError(409, 'Pembimbing memiliki jadwal pelajaran yang bentrok.');
    if (
      teacherGroup.get(
        id,
        yearId,
        data.teacher_id,
        weekday,
        semesterId,
        semesterId,
        slot.start_time,
        slot.end_time,
      )
    )
      throw new HttpError(409, 'Pembimbing sudah memiliki halaqah pada waktu tersebut.');
    for (const studentId of data.student_ids) {
      if (
        memberConflict.get(
          id,
          yearId,
          studentId,
          weekday,
          semesterId,
          semesterId,
          slot.start_time,
          slot.end_time,
        )
      )
        throw new HttpError(
          409,
          'Salah satu murid sudah mengikuti halaqah lain pada waktu tersebut.',
        );
      if (studentLesson.get(studentId, yearId, weekday, semesterId, slot.start_time, slot.end_time))
        throw new HttpError(409, 'Salah satu murid memiliki jadwal pelajaran yang bentrok.');
    }
  }
  return semesterId;
}
export async function GET(request: Request) {
  try {
    await requireUser('tahfidz.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const yearId = url.searchParams.get('academic_year_id') || activeAcademicYear(schoolId).id;
    const year = requireAcademicYear(schoolId, yearId);
    const activeYear = activeAcademicYear(schoolId);
    const membershipYear = year.start_date > activeYear.start_date ? activeYear.id : yearId;
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare(
        `SELECT tg.*,t.name teacher_name,COALESCE(sem.name,'Semua Semester') semester_name,slot.name slot_name,slot.start_time,slot.end_time,(SELECT count(*) FROM tahfidz_group_members gm WHERE gm.group_id=tg.id) participant_count FROM tahfidz_groups tg JOIN teachers t ON t.id=tg.teacher_id LEFT JOIN semesters sem ON sem.id=tg.semester_id JOIN schedule_time_slots slot ON slot.id=tg.time_slot_id WHERE tg.school_id=? AND tg.academic_year_id=? AND (tg.name LIKE ? OR t.name LIKE ?) ORDER BY tg.weekday,slot.start_time,tg.name LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, yearId, filter, filter, offset)
      .map((value) => {
        const row = value as Record<string, unknown> & { id: string; weekdays: string };
        return {
          ...row,
          weekdays: JSON.parse(row.weekdays) as number[],
          student_ids: db()
            .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=?')
            .pluck()
            .all(row.id),
        };
      });
    const total = (
      db()
        .prepare(
          `SELECT count(*) n FROM tahfidz_groups tg JOIN teachers t ON t.id=tg.teacher_id WHERE tg.school_id=? AND tg.academic_year_id=? AND (tg.name LIKE ? OR t.name LIKE ?)`,
        )
        .get(schoolId, yearId, filter, filter) as { n: number }
    ).n;
    const students = db()
      .prepare(
        `SELECT s.id value,s.name || ' — ' || s.nis label FROM students s
         WHERE s.school_id=? AND s.is_active=1 AND EXISTS(SELECT 1 FROM class_memberships cm
           WHERE cm.student_id=s.id AND cm.academic_year_id IN (?,?) AND cm.status='active') ORDER BY s.name`,
      )
      .all(schoolId, yearId, membershipYear);
    return Response.json(
      {
        rows,
        total,
        selected: {
          academic_year_id: yearId,
          read_only: year.start_date < activeYear.start_date ? '1' : '0',
          is_draft: year.start_date > activeYear.start_date ? '1' : '0',
        },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          teacher_id: db()
            .prepare(
              "SELECT id value,name || ' — ' || employee_code label FROM teachers WHERE school_id=? AND is_active=1 ORDER BY name",
            )
            .all(schoolId),
          semester_id: [
            { value: 'all', label: 'Semua Semester' },
            ...db()
              .prepare(
                'SELECT id value,name label FROM semesters WHERE academic_year_id=? ORDER BY period',
              )
              .all(yearId),
          ],
          time_slot_id: db()
            .prepare(
              "SELECT id value,name || ' · ' || start_time || '–' || end_time label FROM schedule_time_slots WHERE school_id=? AND is_active=1 AND is_break=0 ORDER BY slot_order",
            )
            .all(schoolId),
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
    const actor = await requireUser('tahfidz.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id = method === 'POST' ? randomUUID() : z.string().uuid().parse(input.id);
    db().transaction(() => {
      const previous = method === 'POST' ? undefined : ownedGroup(schoolId, id);
      if (
        previous &&
        requireAcademicYear(schoolId, String(previous.academic_year_id)).start_date <
          activeAcademicYear(schoolId).start_date
      )
        throw new HttpError(409, 'Kelompok tahun ajaran yang sudah selesai hanya dapat dilihat.');
      if (method === 'DELETE') {
        if (db().prepare('SELECT id FROM tahfidz_sessions WHERE group_id=? LIMIT 1').get(id))
          throw new HttpError(
            409,
            'Kelompok sudah memiliki sesi. Ubah status menjadi selesai untuk menyimpan riwayat.',
          );
        db().prepare('DELETE FROM tahfidz_groups WHERE id=?').run(id);
        audit(actor.email, 'delete', 'tahfidz_groups', id, previous);
        return;
      }
      const data = groupSchema.parse(input);
      if (previous && data.academic_year_id && data.academic_year_id !== previous.academic_year_id)
        throw new HttpError(
          409,
          'Tahun ajaran kelompok tidak dapat dipindahkan. Salin kelompok melalui persiapan tahun ajaran baru.',
        );
      const yearId =
        method === 'POST'
          ? data.academic_year_id || activeAcademicYear(schoolId).id
          : String(previous!.academic_year_id);
      const semesterId = validGroup(schoolId, id, yearId, data);
      const args = [
        data.name,
        data.teacher_id,
        yearId,
        semesterId,
        data.time_slot_id,
        data.weekdays[0],
        JSON.stringify(data.weekdays),
        data.location,
        data.quota,
        data.status,
      ];
      if (method === 'POST')
        db()
          .prepare(
            'INSERT INTO tahfidz_groups(id,school_id,name,teacher_id,academic_year_id,semester_id,time_slot_id,weekday,weekdays,location,quota,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(id, schoolId, ...args);
      else
        db()
          .prepare(
            "UPDATE tahfidz_groups SET name=?,teacher_id=?,academic_year_id=?,semester_id=?,time_slot_id=?,weekday=?,weekdays=?,location=?,quota=?,status=?,updated_at=datetime('now') WHERE id=?",
          )
          .run(...args, id);
      db().prepare('DELETE FROM tahfidz_group_members WHERE group_id=?').run(id);
      const insert = db().prepare(
        'INSERT INTO tahfidz_group_members(id,group_id,student_id) VALUES(?,?,?)',
      );
      for (const studentId of data.student_ids) insert.run(randomUUID(), id, studentId);
      audit(actor.email, method === 'POST' ? 'create' : 'update', 'tahfidz_groups', id, {
        ...data,
        academic_year_id: yearId,
        semester_id: semesterId,
      });
    })();
    return Response.json({ ok: true, id }, { status: method === 'POST' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}
export const POST = (r: Request) => mutate(r, 'POST');
export const PATCH = (r: Request) => mutate(r, 'PATCH');
export const DELETE = (r: Request) => mutate(r, 'DELETE');
