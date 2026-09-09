import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const scanSchema = z.object({
  code: z.string().trim().min(1).max(200),
  manual: z.boolean().default(false),
});

function localNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  };
}

function dashboard(schoolId: string, date: string) {
  const summary = db()
    .prepare(
      `SELECT count(*) AS total,
        sum(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
        sum(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late
       FROM (
         SELECT status FROM student_checkins WHERE school_id=? AND attendance_date=?
         UNION ALL
         SELECT status FROM teacher_checkins WHERE school_id=? AND attendance_date=?
       )`,
    )
    .get(schoolId, date, schoolId, date) as {
    total: number;
    present: number | null;
    late: number | null;
  };
  const recent = db()
    .prepare(
      `SELECT * FROM (
         SELECT sc.id,sc.status,sc.checked_in_at,s.name,s.nis,s.photo_url,
           COALESCE(c.name,'Murid') AS class_name,'student' AS person_type
         FROM student_checkins sc JOIN students s ON s.id=sc.student_id
         LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active'
         LEFT JOIN classes c ON c.id=cm.class_id
         WHERE sc.school_id=? AND sc.attendance_date=?
         UNION ALL
         SELECT tc.id,tc.status,tc.checked_in_at,t.name,t.employee_code AS nis,t.photo_url,
           CASE t.employment_status WHEN 'permanent' THEN 'Guru tetap' WHEN 'contract' THEN 'Guru kontrak' ELSE 'Guru honorer' END AS class_name,
           'teacher' AS person_type
         FROM teacher_checkins tc JOIN teachers t ON t.id=tc.teacher_id
         WHERE tc.school_id=? AND tc.attendance_date=?
       ) ORDER BY checked_in_at DESC LIMIT 8`,
    )
    .all(schoolId, date, schoolId, date);
  return {
    summary: { total: summary.total, present: summary.present || 0, late: summary.late || 0 },
    recent,
  };
}

export async function GET() {
  try {
    await requireUser('checkins.read');
    const schoolId = currentSchoolId();
    const school = db()
      .prepare('SELECT name,logo_url,timezone,checkin_late_after FROM schools WHERE id=?')
      .get(schoolId) as {
      name: string;
      logo_url: string;
      timezone: string;
      checkin_late_after: string;
    };
    const now = localNow(school.timezone);
    return Response.json(
      {
        school,
        date: now.date,
        late_after: school.checkin_late_after,
        ...dashboard(schoolId, now.date),
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
    const actor = await requireUser('checkins.write');
    const { code, manual } = scanSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const school = db()
      .prepare('SELECT timezone,checkin_late_after FROM schools WHERE id=?')
      .get(schoolId) as { timezone: string; checkin_late_after: string };
    const now = localNow(school.timezone);
    const studentPrefix = 'cendekia:checkin:';
    const teacherPrefix = 'cendekia:teacher-checkin:';
    const isStudentQr = code.startsWith(studentPrefix);
    const isTeacherQr = code.startsWith(teacherPrefix);
    if (!manual && !isStudentQr && !isTeacherQr)
      throw new HttpError(400, 'QR bukan kartu Cendekia yang valid.');
    const token = isTeacherQr
      ? code.slice(teacherPrefix.length)
      : isStudentQr
        ? code.slice(studentPrefix.length)
        : code;

    const student = !isTeacherQr
      ? (db()
          .prepare(
            `SELECT s.id,s.name,s.nis,s.photo_url,c.name AS class_name
             FROM students s
             LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active'
               AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
             LEFT JOIN classes c ON c.id=cm.class_id
             WHERE s.school_id=? AND s.is_active=1
               AND (s.qr_token=? OR (?=1 AND upper(s.nis)=upper(?)))`,
          )
          .get(now.date, now.date, schoolId, token, Number(manual), token) as
          | { id: string; name: string; nis: string; photo_url: string; class_name: string | null }
          | undefined)
      : undefined;
    const teacher = !isStudentQr
      ? (db()
          .prepare(
            `SELECT id,name,employee_code AS nis,photo_url,
              CASE employment_status WHEN 'permanent' THEN 'Guru tetap' WHEN 'contract' THEN 'Guru kontrak' ELSE 'Guru honorer' END AS class_name
             FROM teachers WHERE school_id=? AND is_active=1
               AND (qr_token=? OR (?=1 AND upper(employee_code)=upper(?)))`,
          )
          .get(schoolId, token, Number(manual), token) as
          | { id: string; name: string; nis: string; photo_url: string; class_name: string }
          | undefined)
      : undefined;
    if (manual && student && teacher)
      throw new HttpError(409, 'Kode digunakan oleh murid dan guru. Silakan pindai kartu QR.');
    const person = student || teacher;
    const personType = student ? 'student' : 'teacher';
    if (!person)
      throw new HttpError(404, 'Kartu tidak dikenali atau pemiliknya sudah tidak aktif.');
    if (student && !student.class_name)
      throw new HttpError(400, 'Murid belum memiliki rombel aktif.');

    const table = personType === 'student' ? 'student_checkins' : 'teacher_checkins';
    const foreignKey = personType === 'student' ? 'student_id' : 'teacher_id';
    const existing = db()
      .prepare(
        `SELECT status,checked_in_at FROM ${table} WHERE ${foreignKey}=? AND attendance_date=?`,
      )
      .get(person.id, now.date) as
      { status: 'present' | 'late'; checked_in_at: string } | undefined;
    if (existing)
      return Response.json({
        outcome: 'duplicate',
        student: person,
        person_type: personType,
        ...existing,
        date: now.date,
        ...dashboard(schoolId, now.date),
      });

    const status = now.time > school.checkin_late_after ? 'late' : 'present';
    const id = randomUUID();
    const created = db().transaction(() => {
      const insertion = db()
        .prepare(
          `INSERT OR IGNORE INTO ${table}(id,school_id,${foreignKey},attendance_date,status,source,note,recorded_by)
           VALUES(?,?,?,?,?,'qr','Dipindai melalui kiosk',?)`,
        )
        .run(id, schoolId, person.id, now.date, status, actor.id);
      if (insertion.changes)
        audit(actor.email, 'create', table, id, {
          [foreignKey]: person.id,
          source: 'qr',
          status,
        });
      return insertion.changes === 1;
    })();
    const saved = db()
      .prepare(
        `SELECT status,checked_in_at FROM ${table} WHERE ${foreignKey}=? AND attendance_date=?`,
      )
      .get(person.id, now.date) as { status: 'present' | 'late'; checked_in_at: string };
    return Response.json(
      {
        outcome: created ? 'success' : 'duplicate',
        student: person,
        person_type: personType,
        date: now.date,
        ...saved,
        ...dashboard(schoolId, now.date),
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return failure(error);
  }
}
