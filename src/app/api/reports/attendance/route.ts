import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
  requireClass,
  semesterOptions,
} from '@/app/api/modules/_shared/academic-context';
import { HttpError, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const optionalUuid = z.union([z.literal(''), z.string().uuid()]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Period = { id: string; name: string; start_date: string; end_date: string };

export async function GET(request: Request) {
  try {
    await requireUser('academic-reports.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const yearId =
      optionalUuid.parse(url.searchParams.get('academic_year_id') || '') ||
      activeAcademicYear(schoolId).id;
    const year = requireAcademicYear(schoolId, yearId);
    const requestedSemesterId = optionalUuid.parse(url.searchParams.get('semester_id') || '');
    const semester = db()
      .prepare(
        requestedSemesterId
          ? 'SELECT id,name,start_date,end_date FROM semesters WHERE id=? AND academic_year_id=?'
          : 'SELECT id,name,start_date,end_date FROM semesters WHERE academic_year_id=? ORDER BY is_active DESC,period LIMIT 1',
      )
      .get(...(requestedSemesterId ? [requestedSemesterId, yearId] : [yearId])) as
      Period | undefined;
    if (requestedSemesterId && !semester) throw new HttpError(400, 'Semester tidak valid.');

    const classId = optionalUuid.parse(url.searchParams.get('class_id') || '');
    if (classId) {
      const classroom = requireClass(schoolId, classId);
      if (classroom.academic_year_id !== yearId)
        throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran yang dipilih.');
    }

    const dateFrom = dateSchema.parse(
      url.searchParams.get('date_from') || semester?.start_date || year.start_date,
    );
    const dateTo = dateSchema.parse(
      url.searchParams.get('date_to') || semester?.end_date || year.end_date,
    );
    if (dateFrom > dateTo) throw new HttpError(400, 'Tanggal awal harus sebelum tanggal akhir.');

    const clauses = [
      'ats.school_id=?',
      'sem.academic_year_id=?',
      'ats.attendance_date BETWEEN ? AND ?',
    ];
    const args: Array<string> = [schoolId, yearId, dateFrom, dateTo];
    if (semester) {
      clauses.push('cs.semester_id=?');
      args.push(semester.id);
    }
    if (classId) {
      clauses.push('ats.class_id=?');
      args.push(classId);
    }
    const where = clauses.join(' AND ');
    const joins = `FROM student_attendance_sessions ats
      JOIN class_schedules cs ON cs.id=ats.class_schedule_id
      JOIN semesters sem ON sem.id=cs.semester_id
      JOIN student_attendance_records ar ON ar.session_id=ats.id`;

    const lesson = db()
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(ar.status='present') AS present,SUM(ar.status='late') AS late,
          SUM(ar.status='sick') AS sick,SUM(ar.status='excused') AS excused,
          SUM(ar.status='absent') AS absent
         ${joins} WHERE ${where}`,
      )
      .get(...args) as Record<string, number | null>;
    const sessionSummary = db()
      .prepare(
        `SELECT COUNT(*) AS total,SUM(ats.status='open') AS open,SUM(ats.status='closed') AS closed
         FROM student_attendance_sessions ats
         JOIN class_schedules cs ON cs.id=ats.class_schedule_id
         JOIN semesters sem ON sem.id=cs.semester_id WHERE ${where}`,
      )
      .get(...args) as Record<string, number | null>;

    const daily = db()
      .prepare(
        `SELECT ats.attendance_date AS date,COUNT(*) AS total,
          SUM(ar.status='present') AS present,SUM(ar.status='late') AS late,
          SUM(ar.status='sick') AS sick,SUM(ar.status='excused') AS excused,
          SUM(ar.status='absent') AS absent
         ${joins} WHERE ${where} GROUP BY ats.attendance_date ORDER BY ats.attendance_date`,
      )
      .all(...args);
    const classes = db()
      .prepare(
        `SELECT ats.class_id,ats.class_name,COUNT(DISTINCT ats.id) AS sessions,COUNT(*) AS total,
          SUM(ar.status='present') AS present,SUM(ar.status='late') AS late,
          SUM(ar.status='sick') AS sick,SUM(ar.status='excused') AS excused,
          SUM(ar.status='absent') AS absent,
          ROUND(100.0*SUM(ar.status IN ('present','late'))/NULLIF(COUNT(*),0),1) AS attendance_rate
         ${joins} WHERE ${where} GROUP BY ats.class_id,ats.class_name ORDER BY ats.class_name`,
      )
      .all(...args);
    const students = db()
      .prepare(
        `SELECT ar.student_id,ar.student_nis AS nis,ar.student_name AS name,ats.class_name,
          COUNT(*) AS total,SUM(ar.status='present') AS present,SUM(ar.status='late') AS late,
          SUM(ar.status='sick') AS sick,SUM(ar.status='excused') AS excused,
          SUM(ar.status='absent') AS absent,
          ROUND(100.0*SUM(ar.status IN ('present','late'))/NULLIF(COUNT(*),0),1) AS attendance_rate
         ${joins} WHERE ${where}
         GROUP BY ar.student_id,ar.student_nis,ar.student_name,ats.class_name
         ORDER BY attendance_rate ASC,absent DESC,ar.student_name LIMIT 500`,
      )
      .all(...args);

    const gatewayClassClause = classId
      ? `AND EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.student_id=sc.student_id
           AND cm.academic_year_id=? AND cm.class_id=? AND cm.start_date<=sc.attendance_date
           AND (cm.end_date IS NULL OR cm.end_date>=sc.attendance_date))`
      : `AND EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.student_id=sc.student_id
           AND cm.academic_year_id=? AND cm.start_date<=sc.attendance_date
           AND (cm.end_date IS NULL OR cm.end_date>=sc.attendance_date))`;
    const gatewayArgs = classId
      ? [schoolId, dateFrom, dateTo, yearId, classId]
      : [schoolId, dateFrom, dateTo, yearId];
    const studentGateway = db()
      .prepare(
        `SELECT COUNT(*) AS total,SUM(status='present') AS present,SUM(status='late') AS late,
          SUM(status='absent') AS absent FROM student_checkins sc
         WHERE school_id=? AND attendance_date BETWEEN ? AND ? ${gatewayClassClause}`,
      )
      .get(...gatewayArgs) as Record<string, number | null>;
    const teacherGateway = db()
      .prepare(
        `SELECT COUNT(*) AS total,SUM(status='present') AS present,SUM(status='late') AS late,
          SUM(status='absent') AS absent FROM teacher_checkins
         WHERE school_id=? AND attendance_date BETWEEN ? AND ?`,
      )
      .get(schoolId, dateFrom, dateTo) as Record<string, number | null>;
    const school = db()
      .prepare('SELECT name,code,npsn,address FROM schools WHERE id=?')
      .get(schoolId);

    const normalizedLesson = Object.fromEntries(
      Object.entries(lesson).map(([key, value]) => [key, value || 0]),
    );
    return Response.json(
      {
        metadata: {
          title: 'Laporan Kehadiran Terpadu',
          generated_at: new Date().toISOString(),
          school,
        },
        selected: {
          academic_year_id: yearId,
          semester_id: semester?.id || '',
          class_id: classId,
          date_from: dateFrom,
          date_to: dateTo,
        },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          semester_id: semesterOptions(schoolId, yearId),
          class_id: classOptions(schoolId, yearId),
        },
        summary: {
          lesson: normalizedLesson,
          sessions: Object.fromEntries(
            Object.entries(sessionSummary).map(([key, value]) => [key, value || 0]),
          ),
          student_gateway: Object.fromEntries(
            Object.entries(studentGateway).map(([key, value]) => [key, value || 0]),
          ),
          teacher_gateway: Object.fromEntries(
            Object.entries(teacherGateway).map(([key, value]) => [key, value || 0]),
          ),
          attendance_rate: lesson.total
            ? Math.round((1000 * ((lesson.present || 0) + (lesson.late || 0))) / lesson.total) / 10
            : 0,
        },
        daily,
        classes,
        students,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
