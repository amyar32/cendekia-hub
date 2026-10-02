import { z } from 'zod';
import { db } from '@/lib/db';
import { quranSurahs } from './quran-surahs';
import type { TahfidzHistory, TahfidzHistoryRecord } from '../history-types';

const paramsSchema = z.object({
  student_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

// The same scope is applied to the student picker, totals, and history rows.
export function tahfidzHistory(
  schoolId: string,
  request: Request,
  teacherId?: string,
): TahfidzHistory | null {
  const url = new URL(request.url);
  const { student_id: studentId, page } = paramsSchema.parse({
    student_id: url.searchParams.get('student_id') || undefined,
    page: url.searchParams.get('page') || undefined,
  });
  const students = db()
    .prepare(
      `
    SELECT s.id,s.name,s.nis FROM students s WHERE s.school_id=? AND (
      EXISTS(SELECT 1 FROM tahfidz_group_members gm JOIN tahfidz_groups g ON g.id=gm.group_id
        WHERE gm.student_id=s.id AND g.school_id=? AND (? IS NULL OR g.teacher_id=?))
      OR EXISTS(SELECT 1 FROM tahfidz_session_records r JOIN tahfidz_sessions ts ON ts.id=r.session_id
        WHERE r.student_id=s.id AND ts.school_id=? AND (? IS NULL OR ts.teacher_id=?))
    ) ORDER BY s.name,s.nis,s.id
  `,
    )
    .all(
      schoolId,
      schoolId,
      teacherId ?? null,
      teacherId ?? null,
      schoolId,
      teacherId ?? null,
      teacherId ?? null,
    ) as { id: string; name: string; nis: string }[];
  const student = students.find((row) => row.id === studentId) ?? null;
  if (studentId && !student) return null;
  if (!student) return { students, student: null, records: [], total: 0, page, page_size: 20 };
  const scope = `FROM tahfidz_session_records r JOIN tahfidz_sessions ts ON ts.id=r.session_id
    WHERE r.student_id=? AND ts.school_id=? AND (? IS NULL OR ts.teacher_id=?)`;
  const args = [student.id, schoolId, teacherId ?? null, teacherId ?? null];
  const { total } = db()
    .prepare(`SELECT COUNT(*) total ${scope}`)
    .get(...args) as { total: number };
  const records = db()
    .prepare(
      `SELECT r.id,r.student_id,r.class_name,r.status,r.activity_type,
    r.surah_number,r.ayah_from,r.ayah_to,r.result,r.note,
    ts.attendance_date,ts.group_name,ts.teacher_name,ts.status session_status
    ${scope} ORDER BY ts.attendance_date DESC,ts.starts_at DESC,ts.id DESC,r.id DESC LIMIT 20 OFFSET ?
  `,
    )
    .all(...args, (page - 1) * 20)
    .map((row) => {
      const record = row as Omit<TahfidzHistoryRecord, 'surah_name'>;
      return {
        ...record,
        surah_name: record.surah_number ? quranSurahs[record.surah_number - 1] : null,
      };
    });
  return { students, student, records, total, page, page_size: 20 };
}
