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
       FROM student_checkins WHERE school_id=? AND attendance_date=?`,
    )
    .get(schoolId, date) as { total: number; present: number | null; late: number | null };
  const recent = db()
    .prepare(
      `SELECT sc.id,sc.status,sc.checked_in_at,s.name,s.nis,s.photo_url,c.name AS class_name
       FROM student_checkins sc JOIN students s ON s.id=sc.student_id
       LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active'
       LEFT JOIN classes c ON c.id=cm.class_id
       WHERE sc.school_id=? AND sc.attendance_date=? ORDER BY sc.checked_in_at DESC LIMIT 8`,
    )
    .all(schoolId, date);
  return {
    summary: { total: summary.total, present: summary.present || 0, late: summary.late || 0 },
    recent,
  };
}

export async function GET() {
  try {
    await requireUser('student-checkins.read');
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
    const actor = await requireUser('student-checkins.write');
    const { code, manual } = scanSchema.parse(await request.json());
    const schoolId = currentSchoolId();
    const school = db()
      .prepare('SELECT timezone,checkin_late_after FROM schools WHERE id=?')
      .get(schoolId) as {
      timezone: string;
      checkin_late_after: string;
    };
    const now = localNow(school.timezone);
    const isCardQr = code.startsWith('cendekia:checkin:');
    if (!isCardQr && !manual) throw new HttpError(400, 'QR bukan kartu Cendekia yang valid.');
    const token = isCardQr ? code.slice(17) : code;
    const student = db()
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
      | undefined;
    if (!student) throw new HttpError(404, 'Kartu tidak dikenali atau murid sudah tidak aktif.');
    if (!student.class_name) throw new HttpError(400, 'Murid belum memiliki rombel aktif.');
    const existing = db()
      .prepare(
        'SELECT status,checked_in_at FROM student_checkins WHERE student_id=? AND attendance_date=?',
      )
      .get(student.id, now.date) as
      { status: 'present' | 'late'; checked_in_at: string } | undefined;
    if (existing)
      return Response.json({
        outcome: 'duplicate',
        student,
        ...existing,
        date: now.date,
        ...dashboard(schoolId, now.date),
      });

    const status = now.time > school.checkin_late_after ? 'late' : 'present';
    const id = randomUUID();
    const created = db().transaction(() => {
      const insertion = db()
        .prepare(
          `INSERT OR IGNORE INTO student_checkins(id,school_id,student_id,attendance_date,status,source,note,recorded_by)
           VALUES(?,?,?,?,?,'qr','Dipindai melalui kiosk',?)`,
        )
        .run(id, schoolId, student.id, now.date, status, actor.id);
      if (insertion.changes)
        audit(actor.email, 'create', 'student_checkins', id, {
          student_id: student.id,
          source: 'qr',
          status,
        });
      return insertion.changes === 1;
    })();
    const saved = db()
      .prepare(
        'SELECT status,checked_in_at FROM student_checkins WHERE student_id=? AND attendance_date=?',
      )
      .get(student.id, now.date) as {
      status: 'present' | 'late';
      checked_in_at: string;
    };
    return Response.json(
      {
        outcome: created ? 'success' : 'duplicate',
        student,
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
