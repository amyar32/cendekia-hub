import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  classOptions,
  currentSchoolId,
  requireAcademicYear,
} from '@/app/api/modules/_shared/academic-context';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';

const optionalUuid = z.union([z.literal(''), z.string().uuid()]);
const statusSchema = z.enum(['', 'active', 'promoted', 'retained', 'graduated', 'withdrawn']);

type SchoolReportIdentity = {
  name: string;
  code: string;
  npsn: string;
  address: string;
};

export async function GET(request: Request) {
  try {
    await requireUser('academic-reports.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const academicYearId =
      optionalUuid.parse(url.searchParams.get('academic_year_id') || '') ||
      activeAcademicYear(schoolId).id;
    requireAcademicYear(schoolId, academicYearId);
    const classId = optionalUuid.parse(url.searchParams.get('class_id') || '');
    const status = statusSchema.parse(url.searchParams.get('status') || '');
    const filter = `%${(url.searchParams.get('q') || '').trim()}%`;
    const school = db()
      .prepare('SELECT name, code, npsn, address FROM schools WHERE id = ?')
      .get(schoolId) as SchoolReportIdentity | undefined;
    const rows = db()
      .prepare(
        `SELECT cm.id,s.nis,s.nisn,s.name,c.id AS class_id,c.name AS class_name,
                g.name AS grade_name,ay.name AS academic_year_name,cm.start_date,cm.end_date,
                CASE
                  WHEN cm.status='active' THEN 'active'
                  WHEN cm.completion_reason<>'' THEN cm.completion_reason
                  ELSE cm.status
                END AS academic_status,
                CASE
                  WHEN cm.status='active' THEN 'Aktif'
                  WHEN cm.completion_reason='promoted' THEN 'Naik kelas'
                  WHEN cm.completion_reason='retained' THEN 'Tinggal kelas'
                  WHEN cm.completion_reason='graduated' THEN 'Lulus'
                  WHEN cm.completion_reason='withdrawn' THEN 'Pindah / keluar'
                  WHEN cm.status='transferred' THEN 'Pindah rombel'
                  ELSE 'Selesai'
                END AS status_label
         FROM class_memberships cm JOIN students s ON s.id=cm.student_id
         JOIN classes c ON c.id=cm.class_id JOIN grades g ON g.id=c.grade_id
         JOIN academic_years ay ON ay.id=cm.academic_year_id
         WHERE s.school_id=? AND cm.academic_year_id=?
           AND (?='' OR c.id=?)
           AND (?='' OR (CASE WHEN cm.status='active' THEN 'active' ELSE cm.completion_reason END)=?)
           AND (s.nis LIKE ? OR s.nisn LIKE ? OR s.name LIKE ?)
         ORDER BY g.level_order,c.name,s.name`,
      )
      .all(
        schoolId,
        academicYearId,
        classId,
        classId,
        status,
        status,
        filter,
        filter,
        filter,
      ) as Record<string, unknown>[];
    const summary = rows.reduce<Record<string, number>>(
      (totals, row) => {
        const key = String(row.academic_status);
        totals.total++;
        totals[key] = (totals[key] || 0) + 1;
        return totals;
      },
      { total: 0 },
    );
    return Response.json(
      {
        rows,
        summary,
        school: school ?? null,
        selected: { academic_year_id: academicYearId, class_id: classId, status },
        options: {
          academic_year_id: academicYearOptions(schoolId),
          class_id: classOptions(schoolId, academicYearId),
          status: [
            { value: 'active', label: 'Aktif' },
            { value: 'promoted', label: 'Naik kelas' },
            { value: 'retained', label: 'Tinggal kelas' },
            { value: 'graduated', label: 'Lulus' },
            { value: 'withdrawn', label: 'Pindah / keluar' },
          ],
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
