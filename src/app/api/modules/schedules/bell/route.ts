import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const schema = z.object({
  enabled: z.boolean(),
  sound_url: z
    .union([z.literal(''), z.string().trim()])
    .refine((value) => !value || Boolean(uploadIdFromUrl(value)), 'Audio bel tidak valid.')
    .optional(),
});

function configuration(schoolId: string) {
  const school = db()
    .prepare(
      'SELECT timezone,schedule_weekdays,schedule_bell_enabled,schedule_bell_sound_url FROM schools WHERE id=?',
    )
    .get(schoolId) as {
    timezone: string;
    schedule_weekdays: string;
    schedule_bell_enabled: number;
    schedule_bell_sound_url: string;
  };
  let weekdays: number[];
  try {
    weekdays = JSON.parse(school.schedule_weekdays) as number[];
  } catch {
    weekdays = [1, 2, 3, 4, 5];
  }
  const startTimes = (
    db()
      .prepare(
        `SELECT DISTINCT start_time FROM schedule_time_slots
         WHERE school_id=? AND is_active=1 ORDER BY start_time`,
      )
      .all(schoolId) as Array<{ start_time: string }>
  ).map((slot) => slot.start_time);
  return {
    school_id: schoolId,
    enabled: Boolean(school.schedule_bell_enabled),
    sound_url: school.schedule_bell_sound_url,
    timezone: school.timezone,
    weekdays,
    start_times: startTimes,
  };
}

export async function GET() {
  try {
    await requireUser();
    return Response.json(configuration(currentSchoolId()), {
      headers: { 'Cache-Control': 'no-store' },
    });
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
    const uploadId = data.sound_url ? uploadIdFromUrl(data.sound_url) : null;
    if (
      uploadId &&
      !db()
        .prepare("SELECT id FROM uploads WHERE id=? AND scope='schedule.bell-audio'")
        .get(uploadId)
    ) {
      throw new HttpError(400, 'Audio bel hasil upload tidak valid.');
    }
    db()
      .prepare(
        "UPDATE schools SET schedule_bell_enabled=?,schedule_bell_sound_url=COALESCE(?,schedule_bell_sound_url),updated_at=datetime('now') WHERE id=?",
      )
      .run(Number(data.enabled), data.sound_url ?? null, schoolId);
    audit(actor.email, 'update', 'schedule_bell_settings', schoolId, data);
    return Response.json({ ok: true, ...configuration(schoolId) });
  } catch (error) {
    return failure(error);
  }
}
