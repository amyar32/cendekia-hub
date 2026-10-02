import { HttpError, requireUser } from '@/lib/auth';
import { currentSchoolId } from '@/lib/server/academic-context';
import { failure } from '@/lib/http';
import { tahfidzHistory } from '@/features/tahfidz/server/history';

export async function GET(request: Request) {
  try {
    await requireUser('tahfidz.read');
    const data = tahfidzHistory(currentSchoolId(), request);
    if (!data) throw new HttpError(404, 'Siswa tidak ditemukan.');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
