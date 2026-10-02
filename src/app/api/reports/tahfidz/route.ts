import { requireUser } from '@/lib/auth';
import { currentSchoolId } from '@/lib/server/academic-context';
import { failure } from '@/lib/http';
import { tahfidzRecap } from '@/features/tahfidz/server/recap';

export async function GET(request: Request) {
  try {
    await requireUser('academic-reports.read');
    return Response.json(tahfidzRecap(currentSchoolId(), request), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
