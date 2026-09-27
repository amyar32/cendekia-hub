import { can } from '@/config/modules';
import type { SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isoWeekday } from '@/lib/dates';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { schoolLocalDate } from '@/lib/server/academic-context';

export type FollowUp = {
  id: string;
  label: string;
  description: string;
  count: number;
  href: string;
  action: string;
};

export function dashboardFollowUps(user: SessionUser, schoolId: string) {
  const items: FollowUp[] = [];
  const date = schoolLocalDate(schoolId);
  if (!schoolId || !can(user.permissions, 'dashboard.read')) return { date, items };
  const count = (sql: string, ...params: string[]) =>
    (
      db()
        .prepare(sql)
        .get(...params) as { n: number }
    ).n;
  const year = db()
    .prepare('SELECT id FROM academic_years WHERE school_id=? AND is_active=1 LIMIT 1')
    .get(schoolId) as { id: string } | undefined;

  if (year && can(user.permissions, 'student-attendance.read')) {
    const teacher = db()
      .prepare('SELECT id FROM teachers WHERE school_id=? AND user_id=? AND is_active=1')
      .get(schoolId, user.id) as { id: string } | undefined;
    const unrestricted =
      can(user.permissions, 'student-attendance.approve') ||
      can(user.permissions, 'student-attendance.report');
    if (unrestricted || teacher) {
      const rows = db()
        .prepare(
          `
        SELECT ta.class_id FROM class_schedules cs
        JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
        JOIN teachers t ON t.id=ta.teacher_id
        JOIN semesters sem ON sem.id=cs.semester_id
        JOIN academic_years ay ON ay.id=sem.academic_year_id
        LEFT JOIN student_attendance_sessions ats
          ON ats.class_schedule_id=cs.id AND ats.attendance_date=?
        WHERE t.school_id=? AND ay.id=? AND cs.archived_at IS NULL AND cs.weekday=?
          AND sem.start_date<=? AND sem.end_date>=? AND ay.start_date<=? AND ay.end_date>=?
          AND (?=1 OR ta.teacher_id=? OR ats.teacher_id=?)
          AND (ats.id IS NULL OR ats.status='open')
      `,
        )
        .all(
          date,
          schoolId,
          year.id,
          isoWeekday(date),
          date,
          date,
          date,
          date,
          unrestricted ? 1 : 0,
          teacher?.id ?? '',
          teacher?.id ?? '',
        ) as { class_id: string }[];
      const blocked = new Map<string, boolean>();
      const pending = rows.filter((row) => {
        if (!blocked.has(row.class_id))
          blocked.set(row.class_id, Boolean(regularScheduleBlock(schoolId, row.class_id, date)));
        return !blocked.get(row.class_id);
      }).length;
      items.push({
        id: 'attendance',
        label: 'Absensi pelajaran belum selesai',
        count: pending,
        description:
          'Sesi belum dibuka atau masih terbuka pada jadwal hari ini, termasuk pelajaran yang belum mulai.',
        href: `/student-attendance?date=${date}`,
        action: 'Lihat absensi',
      });
    }
  }

  if (can(user.permissions, 'admissions.read')) {
    items.push({
      id: 'admissions',
      label: 'Pendaftar menunggu verifikasi',
      description: 'Pendaftar berstatus Dikirim dari seluruh periode SPMB.',
      count: count(
        "SELECT COUNT(*) AS n FROM student_applications WHERE school_id=? AND status='submitted'",
        schoolId,
      ),
      href: '/admissions?status=submitted',
      action: 'Periksa pendaftar',
    });
  }

  if (year && can(user.permissions, 'academic-reports.read')) {
    const href = `/reports/data-quality?academic_year_id=${year.id}`;
    items.push(
      {
        id: 'guardian',
        label: 'Murid tanpa wali utama',
        description: 'Murid aktif yang belum memiliki wali utama untuk komunikasi sekolah.',
        count: count(
          `SELECT COUNT(*) AS n FROM students s WHERE s.school_id=? AND s.is_active=1
        AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.student_id=s.id AND g.is_primary=1)`,
          schoolId,
        ),
        href: `${href}&category=student_guardian`,
        action: 'Lengkapi data wali',
      },
      {
        id: 'nisn',
        label: 'Murid tanpa NISN',
        description: 'Murid aktif yang NISN-nya masih kosong.',
        count: count(
          "SELECT COUNT(*) AS n FROM students WHERE school_id=? AND is_active=1 AND TRIM(nisn)=''",
          schoolId,
        ),
        href: `${href}&category=student_nisn`,
        action: 'Lengkapi NISN',
      },
    );
  }

  return { date, items: items.sort((a, b) => Number(b.count > 0) - Number(a.count > 0)) };
}
