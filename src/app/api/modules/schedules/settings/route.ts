import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Hari jadwal tidak boleh duplikat.'),
});

function weekdays(schoolId: string) {
  const row = db().prepare('SELECT schedule_weekdays FROM schools WHERE id=?').get(schoolId) as
    { schedule_weekdays: string } | undefined;
  try {
    return schema.shape.weekdays.parse(JSON.parse(row?.schedule_weekdays || '[1,2,3,4,5]'));
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

export async function GET() {
  try {
    await requireUser('schedules.read');
    return Response.json({ weekdays: weekdays(currentSchoolId()) });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('schedules.write');
    const schoolId = currentSchoolId();
    const data = schema.parse(await request.json());
    const ordered = [...data.weekdays].sort((a, b) => a - b);
    db()
      .prepare("UPDATE schools SET schedule_weekdays=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(ordered), schoolId);
    audit(actor.email, 'update', 'schedule_settings', schoolId, { weekdays: ordered });
    return Response.json({ ok: true, weekdays: ordered });
  } catch (error) {
    return failure(error);
  }
}
