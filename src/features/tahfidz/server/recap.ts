import { z } from 'zod';
import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  activeAcademicYear,
  academicYearOptions,
  requireAcademicYear,
  schoolLocalDate,
} from '@/lib/server/academic-context';
import { isoDateSchema } from '@/lib/validation';
import type { TahfidzRecap, TahfidzRecapRow } from '../recap-types';
import { quranSurahs } from './quran-surahs';

const schema = z
  .object({
    academic_year_id: z.union([z.literal('all'), z.string().uuid()]),
    date_from: isoDateSchema(),
    date_to: isoDateSchema(),
    group_id: z.union([z.literal(''), z.string().uuid()]).default(''),
    student_id: z.union([z.literal(''), z.string().uuid()]).default(''),
    session_status: z.enum(['closed', 'open', 'all']).default('closed'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    export: z.enum(['0', '1']).default('0'),
  })
  .refine((value) => value.date_from <= value.date_to, {
    message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
    path: ['date_to'],
  });

const counts = `COUNT(*) total,
  SUM(r.status='present') present,SUM(r.status='late') late,SUM(r.status='sick') sick,
  SUM(r.status='excused') excused,SUM(r.status='absent') absent,
  SUM(r.status IN ('present','late') AND r.activity_type='new') new_count,
  SUM(r.status IN ('present','late') AND r.activity_type='review') review_count,
  SUM(r.status IN ('present','late') AND r.activity_type IN ('new','review') AND r.result='fluent') fluent,
  SUM(r.status IN ('present','late') AND r.activity_type IN ('new','review') AND r.result='repeat') repeat,
  SUM(r.status IN ('present','late') AND r.activity_type IN ('new','review') AND r.result='not_assessed') not_assessed,
  SUM(r.status IN ('present','late') AND (r.activity_type='none' OR r.result='not_submitted')) not_submitted`;

export function tahfidzRecap(schoolId: string, request: Request): TahfidzRecap {
  const params = new URL(request.url).searchParams;
  const today = schoolLocalDate(schoolId);
  const requestedYear = params.get('academic_year_id');
  const selectedYear =
    requestedYear && requestedYear !== 'all' ? requireAcademicYear(schoolId, requestedYear) : null;
  const parsed = schema.parse({
    ...Object.fromEntries(params),
    academic_year_id: params.get('academic_year_id') || activeAcademicYear(schoolId).id,
    date_from: params.get('date_from') || selectedYear?.start_date || `${today.slice(0, 7)}-01`,
    date_to: params.get('date_to') || selectedYear?.end_date || today,
  });
  const { page, export: exporting, ...filters } = parsed;
  const yearId = filters.academic_year_id === 'all' ? null : filters.academic_year_id;
  if (yearId) requireAcademicYear(schoolId, yearId);
  const school = db().prepare('SELECT name FROM schools WHERE id=?').get(schoolId) as {
    name: string;
  };
  const groups = db()
    .prepare(
      `SELECT g.id value,g.name || ' · ' || ay.name label FROM tahfidz_groups g
      JOIN academic_years ay ON ay.id=g.academic_year_id
      WHERE g.school_id=? AND (? IS NULL OR g.academic_year_id=?) ORDER BY ay.start_date DESC,g.name,g.id`,
    )
    .all(schoolId, yearId, yearId) as TahfidzRecap['options']['groups'];
  const students = db()
    .prepare(
      `SELECT s.id value,s.name || ' — ' || s.nis label FROM students s
    WHERE s.school_id=? AND (EXISTS(SELECT 1 FROM tahfidz_group_members gm JOIN tahfidz_groups g ON g.id=gm.group_id WHERE gm.student_id=s.id AND g.school_id=? AND (? IS NULL OR g.academic_year_id=?))
      OR EXISTS(SELECT 1 FROM tahfidz_session_records r JOIN tahfidz_sessions ts ON ts.id=r.session_id JOIN tahfidz_groups g ON g.id=ts.group_id WHERE r.student_id=s.id AND ts.school_id=? AND g.school_id=? AND (? IS NULL OR g.academic_year_id=?)))
    ORDER BY s.name,s.nis,s.id`,
    )
    .all(
      schoolId,
      schoolId,
      yearId,
      yearId,
      schoolId,
      schoolId,
      yearId,
      yearId,
    ) as TahfidzRecap['options']['students'];
  if (filters.group_id && !groups.some((group) => group.value === filters.group_id))
    throw new HttpError(404, 'Kelompok tidak ditemukan.');
  if (filters.student_id && !students.some((student) => student.value === filters.student_id))
    throw new HttpError(404, 'Siswa tidak ditemukan.');
  const scope = `FROM tahfidz_session_records r JOIN tahfidz_sessions ts ON ts.id=r.session_id
    JOIN tahfidz_groups g ON g.id=ts.group_id AND g.school_id=ts.school_id
    JOIN academic_years ay ON ay.id=g.academic_year_id
    JOIN students s ON s.id=r.student_id AND s.school_id=ts.school_id
    WHERE ts.school_id=? AND (? IS NULL OR g.academic_year_id=?) AND ts.attendance_date BETWEEN ? AND ?
      AND (?='' OR ts.group_id=?) AND (?='' OR r.student_id=?) AND (?='all' OR ts.status=?)`;
  const args = [
    schoolId,
    yearId,
    yearId,
    filters.date_from,
    filters.date_to,
    filters.group_id,
    filters.group_id,
    filters.student_id,
    filters.student_id,
    filters.session_status,
    filters.session_status,
  ];
  const aggregate = db()
    .prepare(
      `SELECT ${counts},COUNT(DISTINCT ts.id) sessions,
    COUNT(DISTINCT r.student_id) students,COUNT(DISTINCT CASE WHEN ts.status='open' THEN ts.id END) open_sessions ${scope}`,
    )
    .get(...args) as TahfidzRecap['summary'];
  const summary = Object.fromEntries(
    Object.entries(aggregate).map(([key, value]) => [key, value ?? 0]),
  ) as TahfidzRecap['summary'];
  const rows = (
    db()
      .prepare(
        `SELECT r.student_id,s.name student_name,s.nis student_nis,${counts}
    ${scope} GROUP BY r.student_id,s.name,s.nis ORDER BY s.name,s.nis,r.student_id ${exporting === '1' ? '' : 'LIMIT 20 OFFSET ?'}`,
      )
      .all(...args, ...(exporting === '1' ? [] : [(page - 1) * 20])) as Omit<
      TahfidzRecapRow,
      'attendance_rate'
    >[]
  ).map((row) => ({
    ...row,
    attendance_rate: Math.round(((row.present + row.late) / row.total) * 1000) / 10,
  }));
  const result: TahfidzRecap = {
    school_name: school.name,
    filters,
    options: { groups, students, academic_years: academicYearOptions(schoolId) },
    summary,
    rows,
    total: summary.students,
    page,
    page_size: 20,
  };
  if (exporting === '1') {
    result.records = (
      db()
        .prepare(
          `SELECT r.id,r.student_id,r.student_name,r.student_nis,r.class_name,
      r.status,r.activity_type,r.surah_number,r.ayah_from,r.ayah_to,r.result,r.note,
      ts.attendance_date,ts.group_name,ts.teacher_name,ts.status session_status,g.academic_year_id,ay.name academic_year_name
      ${scope} ORDER BY ts.attendance_date DESC,ts.id DESC,r.student_name,r.id`,
        )
        .all(...args) as NonNullable<TahfidzRecap['records']>
    ).map((row) => ({
      ...row,
      surah_name: row.surah_number ? quranSurahs[row.surah_number - 1] : null,
    }));
  }
  return result;
}
