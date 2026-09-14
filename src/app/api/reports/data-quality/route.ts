import { z } from 'zod';
import {
  academicYearOptions,
  activeAcademicYear,
  currentSchoolId,
  requireAcademicYear,
} from '@/app/api/modules/_shared/academic-context';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const optionalUuid = z.union([z.literal(''), z.string().uuid()]);

type Issue = {
  category: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  entity_type: string;
  entity_id: string;
  entity_name: string;
  detail: string;
  path: string;
};

export async function GET(request: Request) {
  try {
    await requireUser('academic-reports.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const yearId =
      optionalUuid.parse(url.searchParams.get('academic_year_id') || '') ||
      activeAcademicYear(schoolId).id;
    requireAcademicYear(schoolId, yearId);

    const issues: Issue[] = [];
    const add = (
      rows: Array<{ id: string; name: string }>,
      category: string,
      label: string,
      severity: Issue['severity'],
      entityType: string,
      detail: string,
      path: string,
    ) => {
      for (const row of rows)
        issues.push({
          category,
          label,
          severity,
          entity_type: entityType,
          entity_id: row.id,
          entity_name: row.name,
          detail,
          path,
        });
    };

    const studentRows = (condition: string) =>
      db()
        .prepare(
          `SELECT id,name FROM students WHERE school_id=? AND is_active=1 AND (${condition})`,
        )
        .all(schoolId) as Array<{ id: string; name: string }>;
    add(
      studentRows("TRIM(nisn)=''"),
      'student_nisn',
      'Murid tanpa NISN',
      'medium',
      'Murid',
      'Lengkapi NISN murid.',
      '/master-data/students',
    );
    add(
      studentRows("TRIM(nik)=''"),
      'student_nik',
      'Murid tanpa NIK',
      'medium',
      'Murid',
      'Lengkapi NIK murid.',
      '/master-data/students',
    );
    add(
      studentRows("TRIM(photo_url)=''"),
      'student_photo',
      'Murid tanpa foto',
      'low',
      'Murid',
      'Tambahkan foto untuk kartu identitas.',
      '/master-data/students',
    );
    add(
      db()
        .prepare(
          `SELECT s.id,s.name FROM students s WHERE s.school_id=? AND s.is_active=1
           AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.student_id=s.id AND g.is_primary=1)`,
        )
        .all(schoolId) as Array<{ id: string; name: string }>,
      'student_guardian',
      'Murid tanpa wali utama',
      'high',
      'Murid',
      'Tentukan minimal satu wali utama.',
      '/master-data/students',
    );
    add(
      db()
        .prepare(
          `SELECT s.id,s.name FROM students s WHERE s.school_id=? AND s.is_active=1
           AND NOT EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.student_id=s.id
             AND cm.academic_year_id=? AND cm.status='active')`,
        )
        .all(schoolId, yearId) as Array<{ id: string; name: string }>,
      'student_class',
      'Murid aktif tanpa rombel',
      'high',
      'Murid',
      'Tempatkan murid ke rombel tahun ajaran ini.',
      '/master-data/students',
    );

    const teacherRows = (condition: string) =>
      db()
        .prepare(
          `SELECT id,name FROM teachers WHERE school_id=? AND is_active=1 AND (${condition})`,
        )
        .all(schoolId) as Array<{ id: string; name: string }>;
    add(
      teacherRows('user_id IS NULL'),
      'teacher_account',
      'Guru tanpa akun',
      'medium',
      'Guru',
      'Tautkan guru ke akun agar dapat mengisi absensi.',
      '/master-data/teachers',
    );
    add(
      teacherRows("TRIM(phone)='' AND TRIM(email)=''"),
      'teacher_contact',
      'Guru tanpa kontak',
      'medium',
      'Guru',
      'Lengkapi nomor telepon atau email.',
      '/master-data/teachers',
    );

    add(
      db()
        .prepare(
          `SELECT c.id,c.name FROM classes c WHERE c.school_id=? AND c.academic_year_id=? AND c.is_active=1
           AND NOT EXISTS (SELECT 1 FROM homeroom_assignments ha WHERE ha.class_id=c.id AND ha.academic_year_id=?)`,
        )
        .all(schoolId, yearId, yearId) as Array<{ id: string; name: string }>,
      'class_homeroom',
      'Rombel tanpa wali kelas',
      'high',
      'Rombel',
      'Tentukan wali kelas untuk rombel.',
      '/academic/homeroom-assignments',
    );
    add(
      db()
        .prepare(
          `SELECT c.id,c.name FROM classes c WHERE c.school_id=? AND c.academic_year_id=? AND c.is_active=1
           AND NOT EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.class_id=c.id AND ta.academic_year_id=?)`,
        )
        .all(schoolId, yearId, yearId) as Array<{ id: string; name: string }>,
      'class_teaching',
      'Rombel tanpa penugasan mengajar',
      'high',
      'Rombel',
      'Tambahkan minimal satu penugasan mengajar.',
      '/academic/teaching-assignments',
    );

    add(
      db()
        .prepare(
          `SELECT e.id,e.name FROM extracurriculars e WHERE e.school_id=? AND e.is_active=1
           AND NOT EXISTS (SELECT 1 FROM extracurricular_assignments ea
             WHERE ea.extracurricular_id=e.id AND ea.academic_year_id=?)`,
        )
        .all(schoolId, yearId) as Array<{ id: string; name: string }>,
      'extracurricular_assignment',
      'Ekstrakurikuler tanpa penugasan',
      'low',
      'Ekstrakurikuler',
      'Tentukan pembina dan periode kegiatan.',
      '/academic/extracurricular-assignments',
    );

    const categoryMap = new Map<
      string,
      Omit<Issue, 'entity_type' | 'entity_id' | 'entity_name' | 'detail' | 'path'> & {
        count: number;
      }
    >();
    for (const issue of issues) {
      const current = categoryMap.get(issue.category);
      if (current) current.count++;
      else
        categoryMap.set(issue.category, {
          category: issue.category,
          label: issue.label,
          severity: issue.severity,
          count: 1,
        });
    }
    const totalEntities = (
      db()
        .prepare(
          `SELECT (SELECT COUNT(*) FROM students WHERE school_id=? AND is_active=1) +
                  (SELECT COUNT(*) FROM teachers WHERE school_id=? AND is_active=1) +
                  (SELECT COUNT(*) FROM classes WHERE school_id=? AND academic_year_id=? AND is_active=1) AS total`,
        )
        .get(schoolId, schoolId, schoolId, yearId) as { total: number }
    ).total;
    const school = db()
      .prepare('SELECT name,code,npsn,address FROM schools WHERE id=?')
      .get(schoolId);

    return Response.json(
      {
        metadata: {
          title: 'Laporan Kelengkapan Data',
          generated_at: new Date().toISOString(),
          school,
        },
        selected: { academic_year_id: yearId },
        options: { academic_year_id: academicYearOptions(schoolId) },
        summary: {
          issues: issues.length,
          high: issues.filter((issue) => issue.severity === 'high').length,
          medium: issues.filter((issue) => issue.severity === 'medium').length,
          low: issues.filter((issue) => issue.severity === 'low').length,
          entities_checked: totalEntities,
        },
        categories: [...categoryMap.values()].sort(
          (a, b) =>
            ({ high: 0, medium: 1, low: 2 })[a.severity] -
              { high: 0, medium: 1, low: 2 }[b.severity] || b.count - a.count,
        ),
        issues,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
