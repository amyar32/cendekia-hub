import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { closeTahfidzSession } from '@/features/tahfidz/server/mobile';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.write' });
    const { sessionId } = await params;
    closeTahfidzSession(actor, sessionId);
    return mobileData({ ok: true, id: sessionId, status: 'closed' });
  } catch (error) {
    return mobileFailure(error);
  }
}
