import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request, { allowPasswordChange: true });
    const teacher = db()
      .prepare(
        `SELECT id,photo_url,employee_code,nip,name,gender,birth_date,blood_type,phone,email,
          join_date,employment_status
         FROM teachers WHERE id=? AND school_id=?`,
      )
      .get(actor.teacher_id, actor.school_id) as Record<string, unknown>;
    return mobileData({
      user: {
        id: actor.user_id,
        email: actor.email,
        must_change_password: actor.must_change_password,
      },
      actor: { type: 'teacher', ...teacher },
      school: {
        id: actor.school_id,
        name: actor.school_name,
        timezone: actor.timezone,
      },
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
