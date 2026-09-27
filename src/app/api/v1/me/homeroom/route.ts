import { findActiveHomeroom } from '@/features/homeroom/server/mobile';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = findActiveHomeroom(actor);
    return mobileData({
      is_homeroom_teacher: Boolean(homeroom),
      homeroom: homeroom || null,
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
