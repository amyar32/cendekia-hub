import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

function getCard(id: string, schoolId: string) {
  return db()
    .prepare(
      `SELECT s.id,s.nis,s.nisn,s.name,s.photo_url,s.birth_place,s.birth_date,s.blood_type,s.address,
        s.qr_token,academic_year.end_date AS card_expires_at,
        school.name AS school_name,school.logo_url,school.npsn AS school_npsn,
        school.phone AS school_phone,school.email AS school_email,
        school.address AS school_address,school.principal_name,school.principal_nip,
        school.principal_signature_url
       FROM students s JOIN schools school ON school.id=s.school_id
       LEFT JOIN academic_years academic_year
         ON academic_year.school_id=s.school_id AND academic_year.is_active=1
       WHERE s.id=? AND s.school_id=?`,
    )
    .get(id, schoolId) as
    | {
        id: string;
        nis: string;
        nisn: string;
        name: string;
        photo_url: string;
        birth_place: string;
        birth_date: string | null;
        blood_type: string;
        address: string;
        qr_token: string;
        card_expires_at: string | null;
        school_name: string;
        logo_url: string;
        school_npsn: string;
        school_phone: string;
        school_email: string;
        school_address: string;
        principal_name: string;
        principal_nip: string;
        principal_signature_url: string;
      }
    | undefined;
}

export async function GET(_: Request, context: Context) {
  try {
    await requireUser('students.read');
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const card = getCard(id, currentSchoolId());
    if (!card) throw new HttpError(404, 'Data murid tidak ditemukan.');
    return Response.json(
      { ...card, qr_value: `cendekia:checkin:${card.qr_token}`, qr_token: undefined },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const actor = await requireUser('students.write');
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const schoolId = currentSchoolId();
    if (!getCard(id, schoolId)) throw new HttpError(404, 'Data murid tidak ditemukan.');
    db()
      .prepare("UPDATE students SET qr_token=?,updated_at=datetime('now') WHERE id=?")
      .run(randomBytes(24).toString('hex'), id);
    audit(actor.email, 'rotate', 'student_qr', id);
    const card = getCard(id, schoolId)!;
    return Response.json({
      ...card,
      qr_value: `cendekia:checkin:${card.qr_token}`,
      qr_token: undefined,
    });
  } catch (error) {
    return failure(error);
  }
}
