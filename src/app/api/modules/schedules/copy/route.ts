import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  currentSchoolId,
  requireClass,
  requireSemester,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  source_semester_id: z.string().uuid('Semester asal tidak valid.'),
  target_semester_id: z.string().uuid('Semester tujuan tidak valid.'),
  source_class_id: z.string().uuid('Rombel asal tidak valid.').optional(),
  class_id: z.string().uuid('Rombel tidak valid.'),
});

type SourceRow = {
  time_slot_id: string;
  weekday: number;
  teacher_id: string;
  subject_id: string;
};

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('schedules.write');
    const schoolId = currentSchoolId();
    const data = schema.parse(await request.json());
    if (data.source_semester_id === data.target_semester_id)
      throw new HttpError(400, 'Semester asal dan tujuan harus berbeda.');
    const sourceSemester = requireSemester(schoolId, data.source_semester_id);
    const targetSemester = requireSemester(schoolId, data.target_semester_id);
    const targetClassroom = requireClass(schoolId, data.class_id);
    const sourceClassroom = requireClass(schoolId, data.source_class_id || data.class_id);
    if (targetClassroom.academic_year_id !== targetSemester.academic_year_id)
      throw new HttpError(400, 'Rombel tujuan tidak berada pada tahun ajaran semester tujuan.');
    if (sourceClassroom.academic_year_id !== sourceSemester.academic_year_id)
      throw new HttpError(400, 'Rombel asal tidak berada pada tahun ajaran semester asal.');
    const sourceYear = db()
      .prepare('SELECT start_date FROM academic_years WHERE id=?')
      .get(sourceSemester.academic_year_id) as { start_date: string };
    const targetYear = db()
      .prepare('SELECT start_date FROM academic_years WHERE id=?')
      .get(targetSemester.academic_year_id) as { start_date: string };
    if (sourceYear.start_date > targetYear.start_date)
      throw new HttpError(
        400,
        'Jadwal hanya dapat disalin dari tahun ajaran yang sama atau sebelumnya.',
      );

    const result = db().transaction(() => {
      const sourceRows = db()
        .prepare(
          `SELECT cs.time_slot_id,cs.weekday,ta.teacher_id,ta.subject_id
           FROM class_schedules cs
           JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
           WHERE cs.semester_id=? AND ta.class_id=?`,
        )
        .all(data.source_semester_id, sourceClassroom.id) as SourceRow[];
      let copied = 0;
      let skipped = 0;
      for (const row of sourceRows) {
        const targetAssignment = db()
          .prepare(
            `SELECT id FROM teaching_assignments
             WHERE teacher_id=? AND subject_id=? AND class_id=? AND academic_year_id=?
               AND (semester_id=? OR semester_id IS NULL)
             ORDER BY semester_id IS NULL LIMIT 1`,
          )
          .get(
            row.teacher_id,
            row.subject_id,
            data.class_id,
            targetSemester.academic_year_id,
            data.target_semester_id,
          ) as { id: string } | undefined;
        if (!targetAssignment) {
          skipped++;
          continue;
        }
        const conflict = db()
          .prepare(
            `SELECT cs.id FROM class_schedules cs
             JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
             WHERE cs.semester_id=? AND cs.weekday=? AND cs.time_slot_id=?
               AND (ta.class_id=? OR ta.teacher_id=?)`,
          )
          .get(
            data.target_semester_id,
            row.weekday,
            row.time_slot_id,
            data.class_id,
            row.teacher_id,
          );
        if (conflict) {
          skipped++;
          continue;
        }
        db()
          .prepare(
            `INSERT INTO class_schedules(id,teaching_assignment_id,semester_id,time_slot_id,weekday)
             VALUES(?,?,?,?,?)`,
          )
          .run(
            randomUUID(),
            targetAssignment.id,
            data.target_semester_id,
            row.time_slot_id,
            row.weekday,
          );
        copied++;
      }
      audit(actor.email, 'copy', 'class_schedules', data.class_id, {
        ...data,
        copied,
        skipped,
      });
      return { copied, skipped, total: sourceRows.length };
    })();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
