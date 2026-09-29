import { timingSafeEqual } from 'node:crypto';
import { flushPushNotificationOutbox } from '@/lib/notifications/push';
import { queueTeacherScheduleNotifications } from '@/lib/notifications/teacher-schedule';

export const runtime = 'nodejs';

function authorized(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || !received || secret.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(received));
}

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: { message: 'Tidak diizinkan.' } }, { status: 401 });
  const queued = queueTeacherScheduleNotifications();
  await flushPushNotificationOutbox();
  return Response.json({ data: queued });
}
