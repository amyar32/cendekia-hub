import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  currentSchoolId,
  requireAcademicYear,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const schema = z.object({
  source_academic_year_id: z.string().uuid('Tahun ajaran asal tidak valid.'),
});

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('promotions.write');
    const schoolId = currentSchoolId();
    const targetYear = activeAcademicYear(schoolId);
    const input = schema.parse(await request.json());
    const sourceYear = requireAcademicYear(schoolId, input.source_academic_year_id);
    if (sourceYear.id === targetYear.id)
      throw new HttpError(400, 'Tahun ajaran asal harus berbeda dari tahun ajaran aktif.');

    const sourceClasses = db()
      .prepare(
        `SELECT name,grade_id FROM classes
         WHERE school_id=? AND academic_year_id=? AND is_active=1 ORDER BY name`,
      )
      .all(schoolId, sourceYear.id) as {
      name: string;
      grade_id: string;
    }[];
    if (!sourceClasses.length)
      throw new HttpError(409, 'Tahun ajaran asal belum memiliki rombel untuk disalin.');

    let created = 0;
    db().transaction(() => {
      const insert = db().prepare(
        `INSERT OR IGNORE INTO classes
         (id,school_id,academic_year_id,grade_id,name,is_active)
         VALUES(?,?,?,?,?,?)`,
      );
      for (const classroom of sourceClasses)
        created += insert.run(
          randomUUID(),
          schoolId,
          targetYear.id,
          classroom.grade_id,
          classroom.name,
          1,
        ).changes;
      audit(actor.email, 'copy', 'classes', undefined, {
        source_academic_year_id: sourceYear.id,
        target_academic_year_id: targetYear.id,
        created,
      });
    })();
    return Response.json({ ok: true, created });
  } catch (error) {
    return failure(error);
  }
}
