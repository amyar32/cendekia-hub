import { z } from 'zod';
import { requireActiveHomeroom, requireHomeroomStudent } from '@/features/homeroom/server/mobile';
import { isoDateToUtc } from '@/lib/dates';
import { db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { schoolLocalDate } from '@/lib/server/academic-context';
import { isoDateSchema } from '@/lib/validation';

function minusDays(value: string, days: number) {
  const date = isoDateToUtc(value);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const url = new URL(request.url);
    const today = schoolLocalDate(actor.school_id);
    const to = isoDateSchema('Tanggal akhir tidak valid.').parse(
      url.searchParams.get('to') || today,
    );
    const from = isoDateSchema('Tanggal awal tidak valid.').parse(
      url.searchParams.get('from') || minusDays(to, 29),
    );
    if (from > to)
      throw new MobileApiError(
        400,
        'INVALID_DATE_RANGE',
        'Tanggal awal harus sebelum tanggal akhir.',
      );
    const rangeDays =
      Math.floor((isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime()) / 86400000) + 1;
    if (rangeDays > 92)
      throw new MobileApiError(400, 'DATE_RANGE_TOO_LARGE', 'Rentang rekap maksimal 92 hari.');
    const studentId = z
      .string()
      .uuid('ID murid tidak valid.')
      .optional()
      .parse(url.searchParams.get('student_id') || undefined);
    if (studentId) requireHomeroomStudent(homeroom, studentId);

    const students = db()
      .prepare(
        `SELECT s.id,s.photo_url,s.nis,s.nisn,s.name,s.gender,
          COALESCE((SELECT COUNT(*) FROM student_checkins sci WHERE sci.student_id=s.id AND sci.attendance_date BETWEEN ? AND ? AND sci.status='present'),0) AS checkin_present,
          COALESCE((SELECT COUNT(*) FROM student_checkins sci WHERE sci.student_id=s.id AND sci.attendance_date BETWEEN ? AND ? AND sci.status='late'),0) AS checkin_late,
          COALESCE((SELECT COUNT(*) FROM student_checkins sci WHERE sci.student_id=s.id AND sci.attendance_date BETWEEN ? AND ? AND sci.status='absent'),0) AS checkin_absent,
          COALESCE(SUM(CASE WHEN sar.status='present' THEN 1 ELSE 0 END),0) AS lesson_present,
          COALESCE(SUM(CASE WHEN sar.status='late' THEN 1 ELSE 0 END),0) AS lesson_late,
          COALESCE(SUM(CASE WHEN sar.status='sick' THEN 1 ELSE 0 END),0) AS lesson_sick,
          COALESCE(SUM(CASE WHEN sar.status='excused' THEN 1 ELSE 0 END),0) AS lesson_excused,
          COALESCE(SUM(CASE WHEN sar.status='absent' THEN 1 ELSE 0 END),0) AS lesson_absent,
          COUNT(sar.id) AS lesson_total
         FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         LEFT JOIN student_attendance_sessions sas ON sas.class_id=cm.class_id AND sas.attendance_date BETWEEN ? AND ?
         LEFT JOIN student_attendance_records sar ON sar.session_id=sas.id AND sar.student_id=s.id
         WHERE cm.class_id=? AND cm.academic_year_id=? AND cm.status='active' AND s.is_active=1
           AND (? IS NULL OR s.id=?)
         GROUP BY s.id ORDER BY s.name`,
      )
      .all(
        from,
        to,
        from,
        to,
        from,
        to,
        from,
        to,
        homeroom.class_id,
        homeroom.academic_year_id,
        studentId || null,
        studentId || null,
      );
    return mobileData({ from, to, range_days: rangeDays, homeroom, students });
  } catch (error) {
    return mobileFailure(error);
  }
}
