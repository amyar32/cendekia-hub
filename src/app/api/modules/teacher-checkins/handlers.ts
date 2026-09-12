import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { assignAutomaticAbsences } from '@/lib/checkins';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal cek-in tidak valid.');
const inputSchema = z.object({
  teacher_id: z.string().uuid('Guru tidak valid.'),
  attendance_date: dateSchema,
  status: z.enum(['present', 'late', 'absent']),
  note: z.string().trim().max(500).default(''),
});

export async function GET(request: Request) {
  try {
    const actor = await requireUser('checkins.read');
    const schoolId = currentSchoolId();
    assignAutomaticAbsences(schoolId, actor);
    const url = new URL(request.url);
    const date = dateSchema.parse(
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10),
    );
    const rows = db()
      .prepare(
        `SELECT t.id,t.employee_code,t.employee_code AS nis,t.nip,t.name,t.employment_status,
          CASE t.employment_status WHEN 'permanent' THEN 'Tetap' WHEN 'contract' THEN 'Kontrak' ELSE 'Honorer' END AS employment_status_label,
          tc.id AS checkin_id,tc.status,tc.checked_in_at,tc.note,tc.source
         FROM teachers t
         LEFT JOIN teacher_checkins tc ON tc.teacher_id=t.id AND tc.attendance_date=?
         WHERE t.school_id=? AND t.is_active=1 ORDER BY t.name`,
      )
      .all(date, schoolId);
    return Response.json({ date, rows }, { headers: { 'Cache-Control': 'no-store' } });
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
    const teacher = db()
      .prepare('SELECT id,name FROM teachers WHERE id=? AND school_id=? AND is_active=1')
      .get(data.teacher_id, schoolId) as { id: string; name: string } | undefined;
    if (!teacher) throw new HttpError(400, 'Guru tidak aktif pada tanggal cek-in.');
    const existing = db()
      .prepare('SELECT id FROM teacher_checkins WHERE teacher_id=? AND attendance_date=?')
      .get(teacher.id, data.attendance_date) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    db().transaction(() => {
      if (existing)
        db()
          .prepare(
            `UPDATE teacher_checkins SET status=?,source='staff',note=?,recorded_by=?,updated_at=datetime('now') WHERE id=?`,
          )
          .run(data.status, data.note, actor.id, id);
      else
        db()
          .prepare(
            `INSERT INTO teacher_checkins(id,school_id,teacher_id,attendance_date,status,source,note,recorded_by) VALUES(?,?,?,?,?,'staff',?,?)`,
          )
          .run(id, schoolId, teacher.id, data.attendance_date, data.status, data.note, actor.id);
      audit(actor.email, existing ? 'update' : 'create', 'teacher_checkins', id, {
        teacher_id: teacher.id,
        attendance_date: data.attendance_date,
        status: data.status,
      });
    })();
    return Response.json({ ok: true, id }, { status: existing ? 200 : 201 });
  } catch (error) {
    return failure(error);
  }
}
