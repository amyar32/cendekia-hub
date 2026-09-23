import { z } from 'zod';
import { requireTeacherSession } from '@/app/api/v1/_shared/teacher-attendance';
import { audit, db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const recordSchema = z.object({
  id: z.string().uuid('ID catatan absensi tidak valid.'),
  status: z.enum(['present', 'late', 'sick', 'excused', 'absent']),
  note: z.string().trim().max(500).default(''),
});
const bodySchema = z
  .object({ records: z.array(recordSchema).min(1).max(100) })
  .superRefine((input, context) => {
    if (new Set(input.records.map((record) => record.id)).size !== input.records.length)
      context.addIssue({
        code: 'custom',
        path: ['records'],
        message: 'ID absensi tidak boleh duplikat.',
      });
  });
const idSchema = z.string().uuid('ID sesi tidak valid.');

export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'student-attendance.write' });
    const sessionId = idSchema.parse((await context.params).sessionId);
    const session = requireTeacherSession(actor, sessionId);
    if (session.status === 'closed')
      throw new MobileApiError(409, 'SESSION_CLOSED', 'Sesi absensi sudah ditutup.');
    const input = bodySchema.parse(await request.json());
    db().transaction(() => {
      const update = db().prepare(
        `UPDATE student_attendance_records SET status=?,note=?,source='native_app',updated_by=?,updated_at=datetime('now')
         WHERE id=? AND session_id=?`,
      );
      for (const record of input.records) {
        const result = update.run(record.status, record.note, actor.user_id, record.id, sessionId);
        if (result.changes !== 1)
          throw new MobileApiError(
            400,
            'INVALID_ATTENDANCE_RECORD',
            'Salah satu catatan absensi tidak ditemukan dalam sesi ini.',
          );
      }
      audit(actor.email, 'update', 'student_attendance_records', sessionId, {
        source: 'mobile',
        count: input.records.length,
      });
    })();
    return mobileData({ ok: true, id: sessionId, updated: input.records.length });
  } catch (error) {
    return mobileFailure(error);
  }
}
