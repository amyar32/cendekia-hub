import { mobileData, mobileFailure, MobileApiError, requireMobileTeacher } from '@/lib/mobile-api';
import { tahfidzHistory } from '@/features/tahfidz/server/history';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.read' });
    const data = tahfidzHistory(actor.school_id, request, actor.teacher_id);
    if (!data) throw new MobileApiError(404, 'TAHFIDZ_STUDENT_NOT_FOUND', 'Siswa tidak ditemukan.');
    return mobileData(data);
  } catch (error) {
    return mobileFailure(error);
  }
}
