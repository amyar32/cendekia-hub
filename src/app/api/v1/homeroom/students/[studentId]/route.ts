import { z } from 'zod';
import { requireActiveHomeroom, requireHomeroomStudent } from '@/features/homeroom/server/mobile';
import { db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const idSchema = z.string().uuid('ID murid tidak valid.');

export async function GET(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const studentId = idSchema.parse((await context.params).studentId);
    const student = requireHomeroomStudent(homeroom, studentId);
    const guardians = db()
      .prepare(
        `SELECT id,name,relation,phone,email,is_primary
         FROM guardians WHERE student_id=? ORDER BY is_primary DESC,name`,
      )
      .all(studentId);
    const followUps = db()
      .prepare(
        `SELECT id,category,note,status,due_date,resolved_at,created_at,updated_at
         FROM homeroom_follow_ups
         WHERE student_id=? AND class_id=? AND academic_year_id=?
         ORDER BY status='open' DESC,created_at DESC LIMIT 50`,
      )
      .all(studentId, homeroom.class_id, homeroom.academic_year_id);
    return mobileData({ homeroom, student, guardians, follow_ups: followUps });
  } catch (error) {
    return mobileFailure(error);
  }
}
