import { audit } from '@/lib/db';
import {
  mobileData,
  mobileFailure,
  requireMobileTeacher,
  revokeMobileSession,
} from '@/lib/mobile-api';

export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { allowPasswordChange: true });
    revokeMobileSession(actor.session_id);
    audit(actor.email, 'mobile.logout', 'auth', actor.user_id);
    return mobileData({ ok: true });
  } catch (error) {
    return mobileFailure(error);
  }
}
