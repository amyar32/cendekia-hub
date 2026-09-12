import { z } from 'zod';
import {
  currentSchoolId,
  gradeOptions,
  schoolLocalDate,
} from '@/app/api/modules/_shared/academic-context';
import { createApplication, applicationSchema } from '@/app/api/modules/admissions/handlers';
import { checkOrigin, HttpError } from '@/lib/auth';
import {
  createAdmissionCaptcha,
  admissionRateLimit,
  verifyAdmissionCaptcha,
} from '@/lib/admissions-public';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const tracking = url.searchParams.get('tracking_token');
    if (tracking) {
      admissionRateLimit(request);
      const token = z
        .string()
        .regex(/^(?:\d{6}|[a-f0-9]{48})$/, 'Token pelacakan tidak valid.')
        .parse(tracking);
      const application = db()
        .prepare(
          `SELECT a.registration_number,a.name,a.status,a.verification_notes,a.decision_notes,a.updated_at,
         p.name AS period_name,g.name AS target_grade_name
         FROM student_applications a JOIN admission_periods p ON p.id=a.admission_period_id
         JOIN grades g ON g.id=a.target_grade_id WHERE a.school_id=? AND a.tracking_token=?`,
        )
        .get(schoolId, token);
      if (!application) throw new HttpError(404, 'Nomor pelacakan tidak ditemukan.');
      return Response.json({ application }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const today = schoolLocalDate(schoolId);
    const periods = db()
      .prepare(
        `SELECT p.id AS value,p.name || ' — ' || ay.name AS label,p.name,p.start_date,p.end_date,p.quota,
       (SELECT count(*) FROM student_applications a WHERE a.admission_period_id=p.id AND a.status IN ('accepted','reregistered','converted')) AS accepted_count
       FROM admission_periods p JOIN academic_years ay ON ay.id=p.academic_year_id
       WHERE p.school_id=? AND p.status='open' AND p.start_date<=? AND p.end_date>=?
       ORDER BY p.start_date`,
      )
      .all(schoolId, today, today) as Array<
      Record<string, unknown> & { quota: number; accepted_count: number }
    >;
    return Response.json(
      {
        school: db()
          .prepare('SELECT name,logo_url,address,phone,email FROM schools WHERE id=?')
          .get(schoolId),
        periods: periods.map((period) => ({
          ...period,
          full: period.quota > 0 && period.accepted_count >= period.quota,
        })),
        grades: gradeOptions(schoolId),
        captcha: createAdmissionCaptcha(),
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
    admissionRateLimit(request);
    const input = await request.json();
    const protection = z
      .object({
        captcha_token: z.string(),
        captcha_answer: z.coerce.number().int(),
        website: z.string().max(0, 'Permintaan tidak valid.'),
      })
      .parse(input);
    verifyAdmissionCaptcha(protection.captcha_token, protection.captcha_answer);
    const schoolId = currentSchoolId();
    const data = applicationSchema.parse(input);
    const today = schoolLocalDate(schoolId);
    const period = db()
      .prepare(
        "SELECT id,quota FROM admission_periods WHERE id=? AND school_id=? AND status='open' AND start_date<=? AND end_date>=?",
      )
      .get(data.admission_period_id, schoolId, today, today) as
      { id: string; quota: number } | undefined;
    if (!period) throw new HttpError(409, 'Periode penerimaan sedang tidak dibuka.');
    const result = db().transaction(() => createApplication(schoolId, data, 'pendaftar publik'))();
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
