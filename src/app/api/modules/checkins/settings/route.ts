import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  checkin_late_after: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Masukkan jam dalam format HH:mm.'),
});

export async function GET() {
  try {
    await requireUser('checkins.read');
    const schoolId = currentSchoolId();
    const settings = db()
      .prepare('SELECT checkin_late_after FROM schools WHERE id=?')
      .get(schoolId) as { checkin_late_after: string };
    return Response.json({ checkin_late_after: settings.checkin_late_after });
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
      .prepare("UPDATE schools SET checkin_late_after=?, updated_at=datetime('now') WHERE id=?")
      .run(data.checkin_late_after, schoolId);
    audit(actor.email, 'update', 'checkin_settings', schoolId, data);
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return failure(error);
  }
}
