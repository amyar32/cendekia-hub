import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireActiveHomeroom, requireHomeroomStudent } from '@/features/homeroom/server/mobile';
import { audit, db } from '@/lib/db';
import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { isoDateSchema } from '@/lib/validation';

const categorySchema = z.enum(['attendance', 'academic', 'behavior', 'welfare', 'other']);
const createSchema = z.object({
  student_id: z.string().uuid('ID murid tidak valid.'),
  category: categorySchema,
  note: z
    .string()
    .trim()
    .min(1, 'Catatan wajib diisi.')
    .max(2000, 'Catatan maksimal 2.000 karakter.'),
  due_date: isoDateSchema('Batas waktu tidak valid.').nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const url = new URL(request.url);
    const status = z
      .enum(['open', 'resolved'])
      .optional()
      .parse(url.searchParams.get('status') || undefined);
    const studentId = z
      .string()
      .uuid('ID murid tidak valid.')
      .optional()
      .parse(url.searchParams.get('student_id') || undefined);
    if (studentId) requireHomeroomStudent(homeroom, studentId);
    const rows = db()
      .prepare(
        `SELECT hfu.id,hfu.student_id,s.nis,s.name AS student_name,s.photo_url,
          hfu.category,hfu.note,hfu.status,hfu.due_date,hfu.resolved_at,hfu.created_at,hfu.updated_at
         FROM homeroom_follow_ups hfu JOIN students s ON s.id=hfu.student_id
         WHERE hfu.class_id=? AND hfu.academic_year_id=?
           AND (? IS NULL OR hfu.status=?) AND (? IS NULL OR hfu.student_id=?)
         ORDER BY hfu.status='open' DESC,
           CASE WHEN hfu.due_date IS NULL THEN 1 ELSE 0 END,hfu.due_date,hfu.created_at DESC
         LIMIT 200`,
      )
      .all(
        homeroom.class_id,
        homeroom.academic_year_id,
        status || null,
        status || null,
        studentId || null,
        studentId || null,
      );
    return mobileData({ homeroom, follow_ups: rows });
  } catch (error) {
    return mobileFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const input = createSchema.parse(await request.json());
    requireHomeroomStudent(homeroom, input.student_id);
    const id = randomUUID();
    db().transaction(() => {
      db()
        .prepare(
          `INSERT INTO homeroom_follow_ups
           (id,school_id,academic_year_id,class_id,student_id,homeroom_teacher_id,category,note,due_date,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          actor.school_id,
          homeroom.academic_year_id,
          homeroom.class_id,
          input.student_id,
          actor.teacher_id,
          input.category,
          input.note,
          input.due_date || null,
          actor.user_id,
          actor.user_id,
        );
      audit(actor.email, 'create', 'homeroom_follow_ups', id, {
        source: 'mobile',
        student_id: input.student_id,
        class_id: homeroom.class_id,
        category: input.category,
      });
    })();
    return mobileData({ id, status: 'open' }, { status: 201 });
  } catch (error) {
    return mobileFailure(error);
  }
}
