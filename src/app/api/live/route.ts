import { requireUser } from '@/lib/auth';
import { currentSchoolId } from '@/lib/server/academic-context';
import { failure } from '@/lib/http';
import { liveDisplaySnapshot } from '@/features/live/server/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireUser('live-display.read');
    return Response.json(liveDisplaySnapshot(currentSchoolId()), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
