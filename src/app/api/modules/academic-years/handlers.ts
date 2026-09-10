import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { academicYearOptions, currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { listParams } from '@/app/api/modules/_shared/list-params';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Tanggal tidak valid.');

const semesterSchema = z.object({
  id: z.string().uuid('ID semester tidak valid.').optional(),
  name: z.string().trim().min(2, 'Nama semester minimal 2 karakter.').max(50),
  period: z.coerce.number().int().min(1).max(2),
  start_date: isoDate,
  end_date: isoDate,
  is_active: z.boolean().default(false),
});

const classroomSchema = z.object({
  id: z.string().uuid('ID rombel tidak valid.').optional(),
  grade_id: z.string().uuid('Tingkat / kelas tidak valid.'),
  name: z.string().trim().min(1, 'Nama rombel wajib diisi.').max(50),
  is_active: z.boolean().default(true),
});

const academicYearSchema = z
  .object({
    name: z.string().trim().min(4, 'Nama minimal 4 karakter.').max(50),
    start_date: isoDate,
    end_date: isoDate,
    is_active: z.boolean().default(false),
    semesters: z
      .array(semesterSchema)
      .max(2, 'Tahun ajaran hanya dapat memiliki Semester Ganjil dan Semester Genap.')
      .default([]),
    classrooms: z.array(classroomSchema).max(100, 'Jumlah rombel terlalu banyak.').default([]),
  })
  .refine((data) => data.start_date < data.end_date, {
    message: 'Tanggal selesai harus setelah tanggal mulai.',
    path: ['end_date'],
  })
  .superRefine((data, context) => {
    const periods = new Set<number>();
    let activeSemesters = 0;
    for (const [index, semester] of data.semesters.entries()) {
      if (periods.has(semester.period))
        context.addIssue({
          code: 'custom',
          message: 'Periode semester tidak boleh sama.',
          path: ['semesters', index, 'period'],
        });
      periods.add(semester.period);
      if (semester.start_date < data.start_date || semester.end_date > data.end_date)
        context.addIssue({
          code: 'custom',
          message: 'Periode semester harus berada dalam rentang tahun ajaran.',
          path: ['semesters', index, 'start_date'],
        });
      if (semester.start_date >= semester.end_date)
        context.addIssue({
          code: 'custom',
          message: 'Tanggal selesai semester harus setelah tanggal mulai.',
          path: ['semesters', index, 'end_date'],
        });
      if (semester.is_active) activeSemesters += 1;
    }
    for (let index = 0; index < data.semesters.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < data.semesters.length; otherIndex += 1) {
        const semester = data.semesters[index];
        const other = data.semesters[otherIndex];
        if (semester.start_date <= other.end_date && other.start_date <= semester.end_date)
          context.addIssue({
            code: 'custom',
            message: 'Periode semester tidak boleh saling bertabrakan.',
            path: ['semesters', otherIndex, 'start_date'],
          });
      }
    }
    if (activeSemesters > 1)
      context.addIssue({ code: 'custom', message: 'Hanya satu semester yang dapat aktif.' });
    if (!data.is_active && activeSemesters > 0)
      context.addIssue({
        code: 'custom',
        message: 'Semester aktif hanya dapat berada pada tahun ajaran aktif.',
      });
    const classroomNames = new Set<string>();
    for (const [index, classroom] of data.classrooms.entries()) {
      const normalizedName = classroom.name.toLocaleLowerCase('id-ID');
      if (classroomNames.has(normalizedName))
        context.addIssue({
          code: 'custom',
          message: 'Nama rombel tidak boleh sama dalam satu tahun ajaran.',
          path: ['classrooms', index, 'name'],
        });
      classroomNames.add(normalizedName);
    }
  });

const copySchema = z
  .object({
    copy_from_academic_year_id: z
      .union([z.literal(''), z.string().uuid('Tahun ajaran sumber tidak valid.')])
      .default(''),
    copy_semesters: z.boolean().default(false),
    copy_classrooms: z.boolean().default(false),
    copy_teaching_assignments: z.boolean().default(false),
    copy_homeroom_assignments: z.boolean().default(false),
    copy_schedules: z.boolean().default(false),
    copy_extracurricular_assignments: z.boolean().default(false),
    copy_extracurricular_schedules: z.boolean().default(false),
  })
  .superRefine((data, context) => {
    if (
      data.copy_schedules &&
      (!data.copy_semesters || !data.copy_classrooms || !data.copy_teaching_assignments)
    )
      context.addIssue({
        code: 'custom',
        message: 'Penyalinan jadwal memerlukan semester, rombel, dan penugasan mengajar.',
        path: ['copy_schedules'],
      });
    if (data.copy_extracurricular_assignments && !data.copy_semesters)
      context.addIssue({
        code: 'custom',
        message: 'Penyalinan penugasan ekstrakurikuler memerlukan semester.',
        path: ['copy_extracurricular_assignments'],
      });
    if (data.copy_extracurricular_schedules && !data.copy_extracurricular_assignments)
      context.addIssue({
        code: 'custom',
        message: 'Penyalinan jadwal ekstrakurikuler memerlukan penugasannya.',
        path: ['copy_extracurricular_schedules'],
      });
  });

function shiftDate(value: string, sourceStart: string, targetStart: string, targetEnd: string) {
  const day = 86_400_000;
  const offset = Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${sourceStart}T00:00:00Z`)) / day,
  );
  const shifted = new Date(Date.parse(`${targetStart}T00:00:00Z`) + offset * day)
    .toISOString()
    .slice(0, 10);
  return shifted > targetEnd ? targetEnd : shifted;
}

type AcademicYearRow = {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
};

export async function GET(request: Request) {
  try {
    await requireUser('academic-years.read');
    const schoolId = currentSchoolId();
    const url = new URL(request.url);
    const copySourceId = url.searchParams.get('copy_source_id');
    if (copySourceId) {
      const sourceId = z.string().uuid('Tahun ajaran sumber tidak valid.').parse(copySourceId);
      const year = db()
        .prepare('SELECT * FROM academic_years WHERE id=? AND school_id=?')
        .get(sourceId, schoolId) as AcademicYearRow | undefined;
      if (!year) throw new HttpError(404, 'Tahun ajaran sumber tidak ditemukan.');
      return Response.json(
        {
          year: {
            ...year,
            semesters: db()
              .prepare(
                `SELECT id,name,period,start_date,end_date,is_active FROM semesters
                 WHERE academic_year_id=? ORDER BY period`,
              )
              .all(year.id),
            classrooms: db()
              .prepare(
                `SELECT c.id,c.grade_id,c.name,c.is_active,g.name AS grade_name
                 FROM classes c JOIN grades g ON g.id=c.grade_id
                 WHERE c.school_id=? AND c.academic_year_id=? ORDER BY g.level_order,c.name`,
              )
              .all(schoolId, year.id),
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const { filter, offset } = listParams(request);
    const baseRows = db()
      .prepare(
        `SELECT id, school_id, name, start_date, end_date, is_active, created_at, updated_at
         FROM academic_years
         WHERE school_id = ? AND name LIKE ?
         ORDER BY start_date DESC, is_active DESC
         LIMIT 10 OFFSET ?`,
      )
      .all(schoolId, filter, offset) as AcademicYearRow[];
    const rows = baseRows.map((year) => {
      const classrooms = db()
        .prepare(
          `SELECT c.id,c.grade_id,c.name,c.is_active,g.name AS grade_name,
             (SELECT count(*) FROM class_memberships cm WHERE cm.class_id=c.id AND cm.academic_year_id=? AND cm.status='active') AS student_count
           FROM classes c JOIN grades g ON g.id=c.grade_id
           WHERE c.school_id=? AND c.academic_year_id=? ORDER BY g.level_order,c.name`,
        )
        .all(year.id, schoolId, year.id) as Array<{ student_count: number }>;
      return {
        ...year,
        semesters: db()
          .prepare(
            `SELECT id,name,period,start_date,end_date,is_active FROM semesters
             WHERE academic_year_id=? ORDER BY period`,
          )
          .all(year.id),
        classrooms,
        student_count: classrooms.reduce((total, classroom) => total + classroom.student_count, 0),
      };
    });
    const total = (
      db()
        .prepare('SELECT count(*) AS n FROM academic_years WHERE school_id = ? AND name LIKE ?')
        .get(schoolId, filter) as { n: number }
    ).n;
    return Response.json(
      {
        rows,
        total,
        options: {
          academic_year_id: academicYearOptions(schoolId),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('academic-years.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);

    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db()
              .prepare('SELECT * FROM academic_years WHERE id = ? AND school_id = ?')
              .get(id, schoolId) as AcademicYearRow | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Data tidak ditemukan.');

      let details: unknown;
      if (method === 'DELETE') {
        if (previous?.is_active)
          throw new HttpError(
            409,
            'Tahun ajaran aktif tidak dapat dihapus. Aktifkan tahun ajaran lain terlebih dahulu.',
          );
        db().prepare('DELETE FROM academic_years WHERE id = ? AND school_id = ?').run(id, schoolId);
        details = { name: previous?.name };
      } else {
        const copy = method === 'POST' ? copySchema.parse(input) : copySchema.parse({});
        let normalizedInput = input;
        if (method === 'POST' && copy.copy_from_academic_year_id) {
          const sourceYear = db()
            .prepare('SELECT * FROM academic_years WHERE id=? AND school_id=?')
            .get(copy.copy_from_academic_year_id, schoolId) as AcademicYearRow | undefined;
          if (!sourceYear) throw new HttpError(400, 'Tahun ajaran sumber tidak valid.');

          if (copy.copy_semesters && (!input.semesters || input.semesters.length === 0)) {
            const targetStart = isoDate.parse(input.start_date);
            const targetEnd = isoDate.parse(input.end_date);
            const sourceSemesters = db()
              .prepare(
                'SELECT name,period,start_date,end_date FROM semesters WHERE academic_year_id=? ORDER BY period',
              )
              .all(sourceYear.id) as Array<{
              name: string;
              period: number;
              start_date: string;
              end_date: string;
            }>;
            normalizedInput = {
              ...normalizedInput,
              semesters: sourceSemesters.map((semester) => ({
                ...semester,
                start_date: shiftDate(
                  semester.start_date,
                  sourceYear.start_date,
                  targetStart,
                  targetEnd,
                ),
                end_date: shiftDate(
                  semester.end_date,
                  sourceYear.start_date,
                  targetStart,
                  targetEnd,
                ),
                is_active: false,
              })),
            };
          }
          if (copy.copy_classrooms && (!input.classrooms || input.classrooms.length === 0)) {
            const sourceClassrooms = db()
              .prepare(
                `SELECT grade_id,name,is_active FROM classes
                 WHERE school_id=? AND academic_year_id=? ORDER BY name`,
              )
              .all(schoolId, sourceYear.id) as Array<{
              grade_id: string;
              name: string;
              is_active: number;
            }>;
            normalizedInput = {
              ...normalizedInput,
              classrooms: sourceClassrooms.map((classroom) => ({
                ...classroom,
                is_active: Boolean(classroom.is_active),
              })),
            };
          }
        }
        const data = academicYearSchema.parse(normalizedInput);
        if (method === 'PATCH' && previous?.is_active && !data.is_active)
          throw new HttpError(
            400,
            'Tahun ajaran aktif tidak dapat dinonaktifkan langsung. Aktifkan tahun ajaran pengganti.',
          );
        if (data.is_active) {
          db()
            .prepare(
              "UPDATE academic_years SET is_active = 0, updated_at = datetime('now') WHERE school_id = ? AND id <> ? AND is_active = 1",
            )
            .run(schoolId, id);
          db()
            .prepare(
              `UPDATE semesters SET is_active=0,updated_at=datetime('now')
               WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id=? AND id<>?)
                 AND is_active=1`,
            )
            .run(schoolId, id);
        }
        if (method === 'POST') {
          db()
            .prepare(
              'INSERT INTO academic_years(id, school_id, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(id, schoolId, data.name, data.start_date, data.end_date, Number(data.is_active));
        } else {
          db()
            .prepare(
              `UPDATE academic_years
               SET name = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = datetime('now')
               WHERE id = ? AND school_id = ?`,
            )
            .run(data.name, data.start_date, data.end_date, Number(data.is_active), id, schoolId);
        }

        const syncSemesters = Object.prototype.hasOwnProperty.call(normalizedInput, 'semesters');
        const syncClassrooms = Object.prototype.hasOwnProperty.call(normalizedInput, 'classrooms');
        const semesterIds = new Set(data.semesters.flatMap((semester) => semester.id || []));
        const classroomIds = new Set(data.classrooms.flatMap((classroom) => classroom.id || []));
        const existingSemesters = db()
          .prepare('SELECT id FROM semesters WHERE academic_year_id=?')
          .all(id) as { id: string }[];
        const existingClassrooms = db()
          .prepare('SELECT id FROM classes WHERE school_id=? AND academic_year_id=?')
          .all(schoolId, id) as { id: string }[];

        for (const existing of existingSemesters)
          if (syncSemesters && !semesterIds.has(existing.id))
            db().prepare('DELETE FROM semesters WHERE id=?').run(existing.id);
        for (const existing of existingClassrooms)
          if (syncClassrooms && !classroomIds.has(existing.id))
            db()
              .prepare('DELETE FROM classes WHERE id=? AND school_id=?')
              .run(existing.id, schoolId);

        for (const semester of syncSemesters ? data.semesters : []) {
          const semesterId = semester.id || randomUUID();
          if (semester.id && !existingSemesters.some((existing) => existing.id === semester.id))
            throw new HttpError(400, 'Semester tidak berada pada tahun ajaran ini.');
          if (semester.is_active)
            db()
              .prepare(
                `UPDATE semesters SET is_active=0,updated_at=datetime('now')
                 WHERE id<>? AND academic_year_id IN
                   (SELECT id FROM academic_years WHERE school_id=?)`,
              )
              .run(semesterId, schoolId);
          if (semester.id)
            db()
              .prepare(
                `UPDATE semesters SET name=?,period=?,start_date=?,end_date=?,is_active=?,
                 updated_at=datetime('now') WHERE id=? AND academic_year_id=?`,
              )
              .run(
                semester.name,
                semester.period,
                semester.start_date,
                semester.end_date,
                Number(semester.is_active),
                semesterId,
                id,
              );
          else
            db()
              .prepare(
                `INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active)
                 VALUES(?,?,?,?,?,?,?)`,
              )
              .run(
                semesterId,
                id,
                semester.name,
                semester.period,
                semester.start_date,
                semester.end_date,
                Number(semester.is_active),
              );
        }

        for (const classroom of syncClassrooms ? data.classrooms : []) {
          const classroomId = classroom.id || randomUUID();
          if (classroom.id && !existingClassrooms.some((existing) => existing.id === classroom.id))
            throw new HttpError(400, 'Rombel tidak berada pada tahun ajaran ini.');
          if (
            !db()
              .prepare('SELECT id FROM grades WHERE id=? AND school_id=?')
              .get(classroom.grade_id, schoolId)
          )
            throw new HttpError(400, 'Tingkat / kelas tidak valid.');
          if (classroom.id)
            db()
              .prepare(
                `UPDATE classes SET grade_id=?,name=?,is_active=?,updated_at=datetime('now')
                 WHERE id=? AND school_id=? AND academic_year_id=?`,
              )
              .run(
                classroom.grade_id,
                classroom.name,
                Number(classroom.is_active),
                classroomId,
                schoolId,
                id,
              );
          else
            db()
              .prepare(
                `INSERT INTO classes(id,school_id,academic_year_id,grade_id,name,is_active)
                 VALUES(?,?,?,?,?,?)`,
              )
              .run(
                classroomId,
                schoolId,
                id,
                classroom.grade_id,
                classroom.name,
                Number(classroom.is_active),
              );
        }

        if (method === 'POST' && copy.copy_from_academic_year_id) {
          const classroomMap = db()
            .prepare(
              `SELECT source.id AS source_id,target.id AS target_id
               FROM classes source JOIN classes target
                 ON target.school_id=source.school_id AND target.academic_year_id=?
                AND target.grade_id=source.grade_id AND lower(target.name)=lower(source.name)
               WHERE source.school_id=? AND source.academic_year_id=?`,
            )
            .all(id, schoolId, copy.copy_from_academic_year_id) as Array<{
            source_id: string;
            target_id: string;
          }>;
          const targetBySource = new Map(
            classroomMap.map((classroom) => [classroom.source_id, classroom.target_id]),
          );
          const targetSemesters = db()
            .prepare('SELECT id,period FROM semesters WHERE academic_year_id=?')
            .all(id) as Array<{ id: string; period: number }>;
          const semesterByPeriod = new Map(
            targetSemesters.map((semester) => [semester.period, semester.id]),
          );

          if (copy.copy_teaching_assignments) {
            const assignments = db()
              .prepare(
                `SELECT ta.teacher_id,ta.subject_id,ta.class_id,s.period
                 FROM teaching_assignments ta
                 LEFT JOIN semesters s ON s.id=ta.semester_id
                 WHERE ta.academic_year_id=?`,
              )
              .all(copy.copy_from_academic_year_id) as Array<{
              teacher_id: string;
              subject_id: string;
              class_id: string;
              period: number | null;
            }>;
            const insert = db().prepare(
              `INSERT OR IGNORE INTO teaching_assignments
               (id,teacher_id,subject_id,class_id,academic_year_id,semester_id)
               VALUES(?,?,?,?,?,?)`,
            );
            for (const assignment of assignments) {
              const targetClassId = targetBySource.get(assignment.class_id);
              if (!targetClassId) continue;
              const semesterId =
                assignment.period == null ? null : semesterByPeriod.get(assignment.period);
              if (assignment.period != null && !semesterId) continue;
              insert.run(
                randomUUID(),
                assignment.teacher_id,
                assignment.subject_id,
                targetClassId,
                id,
                semesterId ?? null,
              );
            }
          }

          if (copy.copy_schedules) {
            const schedules = db()
              .prepare(
                `SELECT cs.time_slot_id,cs.weekday,source_semester.period,
                        ta.teacher_id,ta.subject_id,ta.class_id,
                        assignment_semester.period AS assignment_period
                 FROM class_schedules cs
                 JOIN semesters source_semester ON source_semester.id=cs.semester_id
                 JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
                 LEFT JOIN semesters assignment_semester ON assignment_semester.id=ta.semester_id
                 WHERE source_semester.academic_year_id=?`,
              )
              .all(copy.copy_from_academic_year_id) as Array<{
              time_slot_id: string;
              weekday: number;
              period: number;
              teacher_id: string;
              subject_id: string;
              class_id: string;
              assignment_period: number | null;
            }>;
            const insertSchedule = db().prepare(
              `INSERT OR IGNORE INTO class_schedules
               (id,teaching_assignment_id,semester_id,time_slot_id,weekday)
               VALUES(?,?,?,?,?)`,
            );
            for (const schedule of schedules) {
              const targetClassId = targetBySource.get(schedule.class_id);
              const targetSemesterId = semesterByPeriod.get(schedule.period);
              const targetAssignmentSemesterId =
                schedule.assignment_period == null
                  ? null
                  : semesterByPeriod.get(schedule.assignment_period);
              if (
                !targetClassId ||
                !targetSemesterId ||
                (schedule.assignment_period != null && !targetAssignmentSemesterId)
              )
                continue;
              const targetAssignment = db()
                .prepare(
                  `SELECT id FROM teaching_assignments
                   WHERE teacher_id=? AND subject_id=? AND class_id=? AND academic_year_id=?
                     AND semester_id IS ?`,
                )
                .get(
                  schedule.teacher_id,
                  schedule.subject_id,
                  targetClassId,
                  id,
                  targetAssignmentSemesterId ?? null,
                ) as { id: string } | undefined;
              if (targetAssignment)
                insertSchedule.run(
                  randomUUID(),
                  targetAssignment.id,
                  targetSemesterId,
                  schedule.time_slot_id,
                  schedule.weekday,
                );
            }
          }

          if (copy.copy_homeroom_assignments) {
            const assignments = db()
              .prepare(
                `SELECT teacher_id,class_id FROM homeroom_assignments
                 WHERE academic_year_id=?`,
              )
              .all(copy.copy_from_academic_year_id) as Array<{
              teacher_id: string;
              class_id: string;
            }>;
            const insert = db().prepare(
              `INSERT OR IGNORE INTO homeroom_assignments
               (id,teacher_id,class_id,academic_year_id) VALUES(?,?,?,?)`,
            );
            for (const assignment of assignments) {
              const targetClassId = targetBySource.get(assignment.class_id);
              if (targetClassId) insert.run(randomUUID(), assignment.teacher_id, targetClassId, id);
            }
          }

          if (copy.copy_extracurricular_assignments) {
            const assignments = db()
              .prepare(
                `SELECT ea.id,ea.extracurricular_id,ea.teacher_id,ea.location,ea.map_url,ea.quota,
                        e.is_required,s.period
                 FROM extracurricular_assignments ea
                 JOIN extracurriculars e ON e.id=ea.extracurricular_id
                 LEFT JOIN semesters s ON s.id=ea.semester_id
                 WHERE ea.academic_year_id=?`,
              )
              .all(copy.copy_from_academic_year_id) as Array<{
              id: string;
              extracurricular_id: string;
              teacher_id: string;
              location: string;
              map_url: string;
              quota: number;
              is_required: number;
              period: number | null;
            }>;
            const insertAssignment = db().prepare(
              `INSERT OR IGNORE INTO extracurricular_assignments
               (id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,map_url,quota,status)
               VALUES(?,?,?,?,?,?,?,?,'draft')`,
            );
            const insertSchedule = db().prepare(
              `INSERT OR IGNORE INTO extracurricular_schedules
               (id,assignment_id,semester_id,time_slot_id,weekday) VALUES(?,?,?,?,?)`,
            );
            const insertParticipant = db().prepare(
              `INSERT OR IGNORE INTO extracurricular_participants
               (id,assignment_id,student_id) VALUES(?,?,?)`,
            );
            for (const assignment of assignments) {
              const targetAssignmentSemesterId =
                assignment.period == null ? null : semesterByPeriod.get(assignment.period);
              if (assignment.period != null && !targetAssignmentSemesterId) continue;
              const targetAssignmentId = randomUUID();
              const inserted = insertAssignment.run(
                targetAssignmentId,
                assignment.extracurricular_id,
                assignment.teacher_id,
                id,
                targetAssignmentSemesterId ?? null,
                assignment.location,
                assignment.map_url,
                assignment.is_required ? 0 : assignment.quota,
              );
              if (inserted.changes) {
                const participants = assignment.is_required
                  ? (db()
                      .prepare(
                        `SELECT DISTINCT s.id AS student_id FROM students s
                         JOIN class_memberships cm ON cm.student_id=s.id
                         WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
                           AND cm.status='active'`,
                      )
                      .all(schoolId, copy.copy_from_academic_year_id) as Array<{
                      student_id: string;
                    }>)
                  : (db()
                      .prepare(
                        `SELECT ep.student_id FROM extracurricular_participants ep
                         JOIN students s ON s.id=ep.student_id AND s.is_active=1
                         JOIN class_memberships cm ON cm.student_id=s.id
                           AND cm.academic_year_id=? AND cm.status='active'
                         WHERE ep.assignment_id=?`,
                      )
                      .all(copy.copy_from_academic_year_id, assignment.id) as Array<{
                      student_id: string;
                    }>);
                for (const participant of participants)
                  insertParticipant.run(randomUUID(), targetAssignmentId, participant.student_id);
              }
              if (!inserted.changes || !copy.copy_extracurricular_schedules) continue;
              const schedules = db()
                .prepare(
                  `SELECT es.time_slot_id,es.weekday,s.period
                   FROM extracurricular_schedules es JOIN semesters s ON s.id=es.semester_id
                   WHERE es.assignment_id=?`,
                )
                .all(assignment.id) as Array<{
                time_slot_id: string;
                weekday: number;
                period: number;
              }>;
              for (const schedule of schedules) {
                const targetScheduleSemesterId = semesterByPeriod.get(schedule.period);
                if (targetScheduleSemesterId)
                  insertSchedule.run(
                    randomUUID(),
                    targetAssignmentId,
                    targetScheduleSemesterId,
                    schedule.time_slot_id,
                    schedule.weekday,
                  );
              }
            }
          }
        }
        details = data;
      }

      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'academic_years',
        id,
        details,
      );
    })();

    return Response.json({ ok: true, id }, { status: method === 'POST' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}

export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
export const DELETE = (request: Request) => mutate(request, 'DELETE');
