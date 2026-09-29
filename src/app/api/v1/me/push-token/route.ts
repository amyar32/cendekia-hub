import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import {
  deactivateSessionPushTokens,
  flushPushNotificationOutbox,
  registerPushToken,
} from '@/lib/notifications/push';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { allowPasswordChange: true });
    const result = registerPushToken(actor, await request.json());
    await flushPushNotificationOutbox();
    return mobileData(result);
  } catch (error) {
    return mobileFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { allowPasswordChange: true });
    deactivateSessionPushTokens(actor.session_id);
    return mobileData({ registered: false });
  } catch (error) {
    return mobileFailure(error);
  }
}
