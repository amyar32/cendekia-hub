import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  classOptions,
  currentSchoolId,
  requireClass,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal cek-in tidak valid.');
const inputSchema = z.object({
  student_id: z.string().uuid('Siswa tidak valid.'),
  attendance_date: dateSchema,
  status: z.enum(['present', 'late']),
  note: z.string().trim().max(500).default(''),
});

export async function GET(request: Request) {
  try {
    await requireUser('checkins.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const date = dateSchema.parse(
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10),
    );
    const year = activeAcademicYear(schoolId);
    const options = classOptions(schoolId, year.id);
    const requestedClassId = (url.searchParams.get('class_id') || '').trim();
    const classId = requestedClassId || options[0]?.value || '';
    if (classId) {
      const classroom = requireClass(schoolId, classId);
      if (classroom.academic_year_id !== year.id)
        throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran aktif.');
    }
    const rows = !classId
      ? []
      : db()
          .prepare(
            `SELECT s.id,s.nis,s.name,sc.id AS checkin_id,sc.status,sc.checked_in_at,sc.note,sc.source
             FROM class_memberships cm JOIN students s ON s.id=cm.student_id
             LEFT JOIN student_checkins sc ON sc.student_id=s.id AND sc.attendance_date=?
             WHERE cm.class_id=? AND cm.status='active' AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
             ORDER BY s.name`,
          )
          .all(date, classId, date, date);
    return Response.json(
      { date, selected: { class_id: classId }, options: { class_id: options }, rows },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('checkins.write');
    const data = inputSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const student = db()
      .prepare(
        `SELECT s.id,s.name FROM students s
         WHERE s.id=? AND s.school_id=? AND EXISTS (
           SELECT 1 FROM class_memberships cm WHERE cm.student_id=s.id AND cm.status='active'
             AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
         )`,
      )
      .get(data.student_id, schoolId, data.attendance_date, data.attendance_date) as
      { id: string; name: string } | undefined;
    if (!student) throw new HttpError(400, 'Siswa tidak aktif pada tanggal cek-in.');
    const existing = db()
      .prepare('SELECT id FROM student_checkins WHERE student_id=? AND attendance_date=?')
      .get(student.id, data.attendance_date) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    db().transaction(() => {
      if (existing)
        db()
          .prepare(
            `UPDATE student_checkins SET status=?,source='staff',note=?,recorded_by=?,updated_at=datetime('now') WHERE id=?`,
          )
          .run(data.status, data.note, actor.id, id);
      else
        db()
          .prepare(
            `INSERT INTO student_checkins(id,school_id,student_id,attendance_date,status,source,note,recorded_by) VALUES(?,?,?,?,?,'staff',?,?)`,
          )
          .run(id, schoolId, student.id, data.attendance_date, data.status, data.note, actor.id);
      audit(actor.email, existing ? 'update' : 'create', 'student_checkins', id, {
        student_id: student.id,
        attendance_date: data.attendance_date,
        status: data.status,
      });
    })();
    return Response.json({ ok: true, id }, { status: existing ? 200 : 201 });
  } catch (error) {
    return failure(error);
  }
}
