import { z } from 'zod';
import { requireActiveHomeroom } from '@/features/homeroom/server/mobile';
import { audit, db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { isoDateSchema } from '@/lib/validation';

const idSchema = z.string().uuid('ID tindak lanjut tidak valid.');
const updateSchema = z
  .object({
    category: z.enum(['attendance', 'academic', 'behavior', 'welfare', 'other']).optional(),
    note: z.string().trim().min(1, 'Catatan wajib diisi.').max(2000).optional(),
    due_date: isoDateSchema('Batas waktu tidak valid.').nullable().optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Minimal satu perubahan wajib dikirim.');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ followUpId: string }> },
) {
  try {
    const actor = requireMobileTeacher(request);
    const homeroom = requireActiveHomeroom(actor);
    const id = idSchema.parse((await context.params).followUpId);
    const input = updateSchema.parse(await request.json());
    const current = db()
      .prepare(
        `SELECT id,category,note,due_date,status FROM homeroom_follow_ups
         WHERE id=? AND class_id=? AND academic_year_id=?`,
      )
      .get(id, homeroom.class_id, homeroom.academic_year_id) as
      | { id: string; category: string; note: string; due_date: string | null; status: string }
      | undefined;
    if (!current)
      throw new MobileApiError(
        404,
        'FOLLOW_UP_NOT_FOUND',
        'Tindak lanjut tidak ditemukan pada kelas wali Anda.',
      );
    const next = { ...current, ...input };
    db().transaction(() => {
      db()
        .prepare(
          `UPDATE homeroom_follow_ups SET category=?,note=?,due_date=?,status=?,
            resolved_at=CASE WHEN ?='resolved' THEN COALESCE(resolved_at,datetime('now')) ELSE NULL END,
            updated_by=?,updated_at=datetime('now') WHERE id=?`,
        )
        .run(
          next.category,
          next.note,
          next.due_date ?? null,
          next.status,
          next.status,
          actor.user_id,
          id,
        );
      audit(actor.email, 'update', 'homeroom_follow_ups', id, {
        source: 'mobile',
        changes: input,
      });
    })();
    return mobileData({ id, status: next.status });
  } catch (error) {
    return mobileFailure(error);
  }
}
