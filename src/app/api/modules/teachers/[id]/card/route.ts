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
      `SELECT t.id,t.employee_code,t.nip,t.name,t.photo_url,t.birth_date,t.blood_type,t.address,
        t.qr_token,school.name AS school_name,school.logo_url,
        school.npsn AS school_npsn,school.phone AS school_phone,
        school.email AS school_email,school.address AS school_address,
        school.principal_name,school.principal_nip,school.principal_signature_url
       FROM teachers t JOIN schools school ON school.id=t.school_id
       WHERE t.id=? AND t.school_id=?`,
    )
    .get(id, schoolId) as Record<string, string | null> | undefined;
}

export async function GET(_: Request, context: Context) {
  try {
    await requireUser('teachers.read');
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const card = getCard(id, currentSchoolId());
    if (!card) throw new HttpError(404, 'Data guru tidak ditemukan.');
    return Response.json(
      { ...card, qr_value: `cendekia:teacher-checkin:${card.qr_token}`, qr_token: undefined },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const actor = await requireUser('teachers.write');
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const schoolId = currentSchoolId();
    if (!getCard(id, schoolId)) throw new HttpError(404, 'Data guru tidak ditemukan.');
    db()
      .prepare("UPDATE teachers SET qr_token=?,updated_at=datetime('now') WHERE id=?")
      .run(randomBytes(24).toString('hex'), id);
    audit(actor.email, 'rotate', 'teacher_qr', id);
    const card = getCard(id, schoolId)!;
    return Response.json({
      ...card,
      qr_value: `cendekia:teacher-checkin:${card.qr_token}`,
      qr_token: undefined,
    });
  } catch (error) {
    return failure(error);
  }
}
