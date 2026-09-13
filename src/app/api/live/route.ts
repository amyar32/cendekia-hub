import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { requireUser } from '@/lib/auth';
import { localDateTime } from '@/lib/checkins';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';
import type { LiveDisplaySnapshot, LivePerson, LiveSchedule } from '@/lib/live-display';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SchoolRow = {
  name: string;
  logo_url: string;
  timezone: string;
  schedule_bell_enabled: number;
};

type SlotRow = {
  name: string;
  start_time: string;
  end_time: string;
  is_break: number;
};

type AttendanceRow = {
  total: number;
  present: number | null;
  late: number | null;
  absent: number | null;
};

function attendanceSummary(table: 'students' | 'teachers', schoolId: string, date: string) {
  const checkinTable = table === 'students' ? 'student_checkins' : 'teacher_checkins';
  const foreignKey = table === 'students' ? 'student_id' : 'teacher_id';
  const row = db()
    .prepare(
      `SELECT count(*) AS total,
        sum(CASE WHEN ci.status='present' THEN 1 ELSE 0 END) AS present,
        sum(CASE WHEN ci.status='late' THEN 1 ELSE 0 END) AS late,
        sum(CASE WHEN ci.status='absent' THEN 1 ELSE 0 END) AS absent
       FROM ${table} person
       LEFT JOIN ${checkinTable} ci ON ci.${foreignKey}=person.id AND ci.attendance_date=?
       WHERE person.school_id=? AND person.is_active=1`,
    )
    .get(date, schoolId) as AttendanceRow;
  const present = row.present || 0;
  const late = row.late || 0;
  const absent = row.absent || 0;
  return { total: row.total, present, late, absent, missing: row.total - present - late - absent };
}

function scheduledTeacherAttendanceSummary(
  schoolId: string,
  date: string,
  semesterId: string | undefined,
  weekday: number,
) {
  if (!semesterId) return { total: 0, present: 0, late: 0, absent: 0, missing: 0 };
  const row = db()
    .prepare(
      `SELECT count(*) AS total,
        sum(CASE WHEN tc.status='present' THEN 1 ELSE 0 END) AS present,
        sum(CASE WHEN tc.status='late' THEN 1 ELSE 0 END) AS late,
        sum(CASE WHEN tc.status='absent' THEN 1 ELSE 0 END) AS absent
       FROM teachers t
       LEFT JOIN teacher_checkins tc ON tc.teacher_id=t.id AND tc.attendance_date=?
       WHERE t.school_id=? AND t.is_active=1 AND EXISTS (
         SELECT 1 FROM class_schedules cs
         JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
         WHERE ta.teacher_id=t.id AND cs.semester_id=? AND cs.weekday=?
       )`,
    )
    .get(date, schoolId, semesterId, weekday) as AttendanceRow;
  const present = row.present || 0;
  const late = row.late || 0;
  const absent = row.absent || 0;
  return { total: row.total, present, late, absent, missing: row.total - present - late - absent };
}

function personStatus(status: string | null): LivePerson['status'] {
  return status === 'present' || status === 'late' || status === 'absent' ? status : 'missing';
}

export async function GET() {
  try {
    await requireUser('live-display.read');
    const schoolId = currentSchoolId();
    const school = db()
      .prepare('SELECT name,logo_url,timezone,schedule_bell_enabled FROM schools WHERE id=?')
      .get(schoolId) as SchoolRow;
    const now = localDateTime(school.timezone);

    const academic = db()
      .prepare(
        `SELECT ay.name AS year,COALESCE(s.name,'Belum ada semester aktif') AS semester
         FROM academic_years ay LEFT JOIN semesters s ON s.academic_year_id=ay.id AND s.is_active=1
         WHERE ay.school_id=? AND ay.is_active=1 LIMIT 1`,
      )
      .get(schoolId) as { year: string; semester: string } | undefined;
    const activeSemester = db()
      .prepare(
        `SELECT s.id FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id
         WHERE ay.school_id=? AND ay.is_active=1 AND s.is_active=1 LIMIT 1`,
      )
      .get(schoolId) as { id: string } | undefined;

    const slots = db()
      .prepare(
        `SELECT name,start_time,end_time,is_break FROM schedule_time_slots
         WHERE school_id=? AND is_active=1 ORDER BY slot_order,start_time`,
      )
      .all(schoolId) as SlotRow[];
    const currentSlot = slots.find(
      (slot) => slot.start_time <= now.time && now.time < slot.end_time,
    );
    const nextSlot = slots.find((slot) => slot.start_time > now.time);

    const rawSchedules = activeSemester
      ? (db()
          .prepare(
            `SELECT cs.id,c.name AS class_name,s.name AS subject_name,s.code AS subject_code,
              t.id AS teacher_id,t.name AS teacher_name,t.photo_url AS teacher_photo_url,
              sts.name AS slot_name,sts.start_time,sts.end_time,
              tc.status AS teacher_status,tc.checked_in_at AS teacher_checked_in_at
             FROM class_schedules cs
             JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
             JOIN classes c ON c.id=ta.class_id
             JOIN subjects s ON s.id=ta.subject_id
             JOIN teachers t ON t.id=ta.teacher_id
             JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
             LEFT JOIN teacher_checkins tc ON tc.teacher_id=t.id AND tc.attendance_date=?
             WHERE cs.semester_id=? AND cs.weekday=?
             ORDER BY sts.start_time,c.name,s.name`,
          )
          .all(now.date, activeSemester.id, now.weekday) as Array<
          Omit<LiveSchedule, 'phase' | 'teacher_status'> & { teacher_status: string | null }
        >)
      : [];
    const daySchedules: LiveSchedule[] = rawSchedules.map((schedule) => ({
      ...schedule,
      teacher_status: personStatus(schedule.teacher_status),
      phase:
        schedule.start_time <= now.time && now.time < schedule.end_time
          ? 'current'
          : schedule.start_time > now.time
            ? 'upcoming'
            : 'finished',
    }));

    const recentCheckins = db()
      .prepare(
        `SELECT * FROM (
          SELECT sc.id,s.name,s.nis AS code,s.photo_url,COALESCE(c.name,'Belum ada rombel') AS group_label,
            'student' AS person_type,sc.status,sc.checked_in_at
          FROM student_checkins sc JOIN students s ON s.id=sc.student_id
          LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active'
          LEFT JOIN classes c ON c.id=cm.class_id
          WHERE sc.school_id=? AND sc.attendance_date=? AND sc.status<>'absent'
          UNION ALL
          SELECT tc.id,t.name,t.employee_code AS code,t.photo_url,'Guru' AS group_label,
            'teacher' AS person_type,tc.status,tc.checked_in_at
          FROM teacher_checkins tc JOIN teachers t ON t.id=tc.teacher_id
          WHERE tc.school_id=? AND tc.attendance_date=? AND tc.status<>'absent'
            AND EXISTS (
              SELECT 1 FROM class_schedules cs
              JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
              WHERE ta.teacher_id=t.id AND cs.semester_id=? AND cs.weekday=?
            )
        ) ORDER BY checked_in_at DESC LIMIT 12`,
      )
      .all(
        schoolId,
        now.date,
        schoolId,
        now.date,
        activeSemester?.id || '',
        now.weekday,
      ) as LivePerson[];

    const missingStudents = db()
      .prepare(
        `SELECT s.id,s.name,s.nis AS code,s.photo_url,COALESCE(c.name,'Belum ada rombel') AS group_label,
          'student' AS person_type,'missing' AS status,NULL AS checked_in_at
         FROM students s
         LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active'
         LEFT JOIN classes c ON c.id=cm.class_id
         WHERE s.school_id=? AND s.is_active=1 AND NOT EXISTS (
           SELECT 1 FROM student_checkins sc WHERE sc.student_id=s.id AND sc.attendance_date=?
         ) ORDER BY c.name,s.name LIMIT 18`,
      )
      .all(schoolId, now.date) as LivePerson[];
    const missingTeachers = db()
      .prepare(
        `SELECT t.id,t.name,t.employee_code AS code,t.photo_url,'Guru' AS group_label,
          'teacher' AS person_type,'missing' AS status,NULL AS checked_in_at
         FROM teachers t WHERE t.school_id=? AND t.is_active=1 AND NOT EXISTS (
           SELECT 1 FROM teacher_checkins tc WHERE tc.teacher_id=t.id AND tc.attendance_date=?
         ) AND EXISTS (
           SELECT 1 FROM class_schedules cs
           JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           WHERE ta.teacher_id=t.id AND cs.semester_id=? AND cs.weekday=?
         ) ORDER BY CASE WHEN EXISTS (
           SELECT 1 FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
           WHERE ta.teacher_id=t.id AND cs.semester_id=? AND cs.weekday=? AND sts.start_time<=? AND sts.end_time>?
         ) THEN 0 ELSE 1 END,t.name LIMIT 18`,
      )
      .all(
        schoolId,
        now.date,
        activeSemester?.id || '',
        now.weekday,
        activeSemester?.id || '',
        now.weekday,
        now.time,
        now.time,
      ) as LivePerson[];

    const attendance = {
      students: attendanceSummary('students', schoolId, now.date),
      teachers: scheduledTeacherAttendanceSummary(
        schoolId,
        now.date,
        activeSemester?.id,
        now.weekday,
      ),
    };
    const currentSchedules = daySchedules.filter((schedule) => schedule.phase === 'current');
    const teachersNeededNow = currentSchedules.filter(
      (schedule) => schedule.teacher_status === 'missing' || schedule.teacher_status === 'absent',
    );
    const notices: LiveDisplaySnapshot['notices'] = [];
    if (teachersNeededNow.length)
      notices.push({
        tone: 'danger',
        title: `${teachersNeededNow.length} guru terjadwal belum hadir`,
        detail: teachersNeededNow
          .slice(0, 3)
          .map((item) => `${item.teacher_name} · ${item.class_name}`)
          .join(' • '),
      });
    if (attendance.students.late)
      notices.push({
        tone: 'warning',
        title: `${attendance.students.late} murid datang terlambat`,
        detail: 'Data keterlambatan tercatat pada check-in hari ini.',
      });
    if (!activeSemester)
      notices.push({
        tone: 'info',
        title: 'Semester aktif belum tersedia',
        detail: 'Aktifkan semester agar jadwal harian dapat ditampilkan.',
      });
    if (!notices.length)
      notices.push({
        tone: 'info',
        title: 'Operasional sekolah berjalan normal',
        detail: 'Tidak ada perhatian mendesak pada data terbaru.',
      });

    const snapshot: LiveDisplaySnapshot = {
      generated_at: new Date().toISOString(),
      date: now.date,
      local_time: now.time,
      weekday: now.weekday,
      school: {
        name: school.name,
        logo_url: school.logo_url,
        timezone: school.timezone,
        bell_enabled: Boolean(school.schedule_bell_enabled),
      },
      academic: academic || { year: 'Belum ada tahun aktif', semester: '—' },
      bell: {
        current_slot: currentSlot
          ? { ...currentSlot, is_break: Boolean(currentSlot.is_break) }
          : null,
        next_slot: nextSlot ? { ...nextSlot, is_break: Boolean(nextSlot.is_break) } : null,
      },
      attendance,
      current_schedules: currentSchedules,
      day_schedules: daySchedules,
      recent_checkins: recentCheckins,
      missing_students: missingStudents,
      missing_teachers: missingTeachers,
      notices,
      ticker: [
        `${attendance.students.present + attendance.students.late} dari ${attendance.students.total} murid telah check-in`,
        `${attendance.teachers.present + attendance.teachers.late} dari ${attendance.teachers.total} guru telah check-in`,
        currentSlot
          ? `${currentSlot.name} berlangsung hingga ${currentSlot.end_time}`
          : nextSlot
            ? `${nextSlot.name} dimulai pukul ${nextSlot.start_time}`
            : 'Seluruh jadwal pelajaran hari ini telah selesai',
      ],
    };
    return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
