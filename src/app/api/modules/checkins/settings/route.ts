import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Masukkan jam dalam format HH:mm.');
const schema = z
  .object({
    checkin_late_after: time,
    checkin_absent_after: z.union([z.literal(''), time]).default(''),
  })
  .refine(
    (value) => !value.checkin_absent_after || value.checkin_absent_after > value.checkin_late_after,
    {
      message: 'Batas otomatis tidak hadir harus setelah batas keterlambatan.',
      path: ['checkin_absent_after'],
    },
  );

export async function GET() {
  try {
    await requireUser('checkins.read');
    const schoolId = currentSchoolId();
    const settings = db()
      .prepare('SELECT checkin_late_after,checkin_absent_after FROM schools WHERE id=?')
      .get(schoolId) as { checkin_late_after: string; checkin_absent_after: string };
    return Response.json(settings);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('checkins.write');
    const schoolId = currentSchoolId();
    const data = schema.parse(await request.json());
    db()
      .prepare(
        `UPDATE schools SET checkin_late_after=?,checkin_absent_after=?,
         updated_at=datetime('now') WHERE id=?`,
      )
      .run(data.checkin_late_after, data.checkin_absent_after, schoolId);
    audit(actor.email, 'update', 'checkin_settings', schoolId, data);
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return failure(error);
  }
}
