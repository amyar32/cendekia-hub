import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activeAcademicYear,
  currentSchoolId,
  gradeOptions,
  requireGrade,
} from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const actionSchema = z.object({
  student_id: z.string().uuid('Murid tidak valid.'),
  outcome: z.enum(['promoted', 'retained', 'graduated', 'withdrawn']),
  target_class_id: z.union([z.literal(''), z.string().uuid('Rombel tujuan tidak valid.')]),
});
const schema = z.object({
  source_academic_year_id: z.string().uuid('Tahun ajaran asal tidak valid.'),
  target_academic_year_id: z.string().uuid('Tahun ajaran tujuan tidak valid.').optional(),
  activate_target: z.boolean().default(false),
  actions: z.array(actionSchema),
});

const createClassSchema = z.object({
  target_academic_year_id: z.string().uuid('Tahun ajaran tujuan tidak valid.'),
  grade_id: z.string().uuid('Tingkat / kelas tidak valid.'),
  name: z.string().trim().min(1, 'Nama rombel wajib diisi.').max(50),
});
const updateClassSchema = createClassSchema.extend({
  id: z.string().uuid('Rombel tidak valid.'),
});
const assignmentSemester = z.union([
  z.literal('all'),
  z.string().uuid('Semester penugasan tidak valid.'),
]);
const transitionAssignmentsSchema = z.object({
  action: z.literal('assignments'),
  target_academic_year_id: z.string().uuid('Tahun ajaran tujuan tidak valid.'),
  teaching_assignments: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        teacher_id: z.string().uuid('Guru tidak valid.'),
        subject_id: z.string().uuid('Mata pelajaran tidak valid.'),
        class_id: z.string().uuid('Rombel tidak valid.'),
        semester_id: assignmentSemester.default('all'),
      }),
    )
    .min(1, 'Tambahkan minimal satu penugasan mata pelajaran.')
    .max(500),
  homeroom_assignments: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        teacher_id: z.string().uuid('Wali kelas tidak valid.'),
        class_id: z.string().uuid('Rombel wali kelas tidak valid.'),
      }),
    )
    .min(1, 'Tambahkan minimal satu wali kelas.')
    .max(100),
  extracurricular_assignments: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        extracurricular_id: z.string().uuid('Ekstrakurikuler tidak valid.'),
        teacher_id: z.string().uuid('Pembina tidak valid.'),
        semester_id: assignmentSemester.default('all'),
        location: z.string().trim().max(100).default(''),
        quota: z.coerce.number().int().min(0).max(1000).default(0),
        status: z.enum(['draft', 'active']).default('active'),
        student_ids: z.array(z.string().uuid('Murid tidak valid.')).max(1000).default([]),
      }),
    )
    .min(1, 'Tambahkan minimal satu penugasan ekstrakurikuler.')
    .max(100),
});

type AcademicYearRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
};

function academicYear(schoolId: string, id: string) {
  const year = db()
    .prepare(
      `SELECT id,name,start_date,end_date,is_active FROM academic_years
       WHERE id=? AND school_id=?`,
    )
    .get(id, schoolId) as AcademicYearRow | undefined;
  if (!year) throw new HttpError(400, 'Tahun ajaran tidak valid.');
  return year;
}

export async function GET(request: Request) {
  try {
    await requireUser('promotions.read');
    const schoolId = currentSchoolId();
    const activeYear = activeAcademicYear(schoolId);
    const url = new URL(request.url);
    const transitionMode = url.searchParams.get('mode') === 'transition';
    const requestedSource = url.searchParams.get('source_academic_year_id');
    const requestedTarget = url.searchParams.get('target_academic_year_id');
    const previousYears = db()
      .prepare(
        `SELECT id AS value,name AS label FROM academic_years
         WHERE school_id=? AND start_date < ? ORDER BY start_date DESC`,
      )
      .all(schoolId, activeYear.start_date) as { value: string; label: string }[];
    const draftYears = db()
      .prepare(
        `SELECT id AS value,name || ' · Draft' AS label FROM academic_years
         WHERE school_id=? AND is_active=0 AND start_date>? ORDER BY start_date`,
      )
      .all(schoolId, activeYear.start_date) as { value: string; label: string }[];

    const sourceYearId = transitionMode
      ? requestedSource || activeYear.id
      : requestedSource || previousYears[0]?.value || '';
    const targetYear = requestedTarget
      ? academicYear(schoolId, requestedTarget)
      : transitionMode
        ? null
        : academicYear(schoolId, activeYear.id);
    const sourceYear = sourceYearId ? academicYear(schoolId, sourceYearId) : null;
    if (sourceYear && targetYear && sourceYear.start_date >= targetYear.start_date)
      throw new HttpError(400, 'Tahun ajaran tujuan harus berada setelah tahun ajaran asal.');

    const sourceClasses = sourceYear
      ? db()
          .prepare(
            `SELECT c.id,c.name,c.grade_id,g.name AS grade_name,g.level_order,
                    count(cm.id) AS student_count
             FROM classes c JOIN grades g ON g.id=c.grade_id
             LEFT JOIN class_memberships cm ON cm.class_id=c.id AND cm.status='active'
             WHERE c.school_id=? AND c.academic_year_id=?
             GROUP BY c.id ORDER BY g.level_order,c.name`,
          )
          .all(schoolId, sourceYear.id)
      : [];
    const students = sourceYear
      ? db()
          .prepare(
            `SELECT s.id,s.nis,s.name,cm.class_id AS source_class_id,c.name AS source_class_name,
                    g.level_order AS source_level_order
             FROM class_memberships cm JOIN students s ON s.id=cm.student_id
             JOIN classes c ON c.id=cm.class_id JOIN grades g ON g.id=c.grade_id
             WHERE s.school_id=? AND cm.academic_year_id=? AND cm.status='active'
             ORDER BY g.level_order,c.name,s.name`,
          )
          .all(schoolId, sourceYear.id)
      : [];
    const targetClasses = targetYear
      ? db()
          .prepare(
            `SELECT c.id AS value,c.name || ' — ' || g.name AS label,c.name,c.grade_id,
                    g.name AS grade_name,g.level_order
             FROM classes c JOIN grades g ON g.id=c.grade_id
             WHERE c.school_id=? AND c.academic_year_id=? AND c.is_active=1
             ORDER BY g.level_order,c.name`,
          )
          .all(schoolId, targetYear.id)
      : [];
    const lastBatch =
      sourceYear && targetYear
        ? db()
            .prepare(
              `SELECT id,created_at FROM promotion_batches
             WHERE school_id=? AND source_academic_year_id=? AND target_academic_year_id=?
               AND status='completed' ORDER BY created_at DESC LIMIT 1`,
            )
            .get(schoolId, sourceYear.id, targetYear.id)
        : undefined;
    const semesters = targetYear
      ? db()
          .prepare('SELECT id,name,period FROM semesters WHERE academic_year_id=? ORDER BY period')
          .all(targetYear.id)
      : [];
    const teachingAssignments = targetYear
      ? db()
          .prepare(
            `SELECT id,teacher_id,subject_id,class_id,COALESCE(semester_id,'all') AS semester_id
             FROM teaching_assignments WHERE academic_year_id=? ORDER BY created_at,id`,
          )
          .all(targetYear.id)
      : [];
    const homeroomAssignments = targetYear
      ? db()
          .prepare(
            `SELECT id,teacher_id,class_id FROM homeroom_assignments
             WHERE academic_year_id=? ORDER BY created_at,id`,
          )
          .all(targetYear.id)
      : [];
    const extracurricularAssignments = targetYear
      ? db()
          .prepare(
            `SELECT id,extracurricular_id,teacher_id,COALESCE(semester_id,'all') AS semester_id,
                    location,quota,status FROM extracurricular_assignments
             WHERE academic_year_id=? AND status<>'completed' ORDER BY created_at,id`,
          )
          .all(targetYear.id)
          .map((assignment) => ({
            ...(assignment as Record<string, unknown> & { id: string }),
            student_ids: (
              db()
                .prepare(
                  'SELECT student_id FROM extracurricular_participants WHERE assignment_id=? ORDER BY created_at',
                )
                .all((assignment as { id: string }).id) as Array<{ student_id: string }>
            ).map((participant) => participant.student_id),
          }))
      : [];

    return Response.json(
      {
        active_academic_year: {
          value: activeYear.id,
          label: activeYear.name,
          start_date: activeYear.start_date,
          end_date: activeYear.end_date,
        },
        target_academic_year: targetYear
          ? {
              value: targetYear.id,
              label: targetYear.name,
              start_date: targetYear.start_date,
              end_date: targetYear.end_date,
              is_active: targetYear.is_active,
            }
          : null,
        source_academic_year_id: sourceYearId,
        source_years: transitionMode
          ? [{ value: activeYear.id, label: `${activeYear.name} (Aktif)` }]
          : previousYears,
        draft_years: draftYears,
        source_classes: sourceClasses,
        target_classes: targetClasses,
        students,
        semesters,
        teachers: db()
          .prepare(
            'SELECT id,employee_code,name FROM teachers WHERE school_id=? AND is_active=1 ORDER BY name',
          )
          .all(schoolId),
        subjects: db()
          .prepare(
            'SELECT id,code,name FROM subjects WHERE school_id=? AND is_active=1 ORDER BY name',
          )
          .all(schoolId),
        extracurriculars: db()
          .prepare(
            'SELECT id,code,name,is_required FROM extracurriculars WHERE school_id=? AND is_active=1 ORDER BY name',
          )
          .all(schoolId),
        teaching_assignments: teachingAssignments,
        homeroom_assignments: homeroomAssignments,
        extracurricular_assignments: extracurricularAssignments,
        grade_options: gradeOptions(schoolId),
        last_batch: lastBatch || null,
        max_grade_level: (
          db()
            .prepare(
              'SELECT max(level_order) AS level FROM grades WHERE school_id=? AND is_active=1',
            )
            .get(schoolId) as { level: number | null }
        ).level,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('promotions.write');
    const schoolId = currentSchoolId();
    const input = createClassSchema.parse(await request.json());
    const sourceYear = activeAcademicYear(schoolId);
    const targetYear = academicYear(schoolId, input.target_academic_year_id);
    if (targetYear.is_active || targetYear.start_date <= sourceYear.start_date)
      throw new HttpError(
        400,
        'Rombel baru hanya dapat ditambahkan pada draft tahun ajaran berikutnya.',
      );
    requireGrade(schoolId, input.grade_id);

    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO classes(id,school_id,academic_year_id,grade_id,name,is_active)
         VALUES(?,?,?,?,?,1)`,
      )
      .run(id, schoolId, targetYear.id, input.grade_id, input.name);
    audit(actor.email, 'create', 'classes', id, { ...input, via: 'annual-transition' });
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('promotions.write');
    const schoolId = currentSchoolId();
    const input = updateClassSchema.parse(await request.json());
    const sourceYear = activeAcademicYear(schoolId);
    const targetYear = academicYear(schoolId, input.target_academic_year_id);
    if (targetYear.is_active || targetYear.start_date <= sourceYear.start_date)
      throw new HttpError(400, 'Rombel hanya dapat diedit pada draft tahun ajaran berikutnya.');
    requireGrade(schoolId, input.grade_id);
    const classroom = db()
      .prepare('SELECT id FROM classes WHERE id=? AND school_id=? AND academic_year_id=?')
      .get(input.id, schoolId, targetYear.id);
    if (!classroom) throw new HttpError(404, 'Rombel tidak ditemukan pada draft ini.');

    db()
      .prepare(
        `UPDATE classes SET grade_id=?,name=?,updated_at=datetime('now')
         WHERE id=? AND school_id=? AND academic_year_id=?`,
      )
      .run(input.grade_id, input.name, input.id, schoolId, targetYear.id);
    audit(actor.email, 'update', 'classes', input.id, {
      ...input,
      via: 'annual-transition',
    });
    return Response.json({ ok: true, id: input.id });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('promotions.write');
    const schoolId = currentSchoolId();
    const body = await request.json();
    if (body.action === 'assignments') {
      await requireUser('teaching-assignments.write');
      await requireUser('homeroom-assignments.write');
      await requireUser('extracurricular-assignments.write');
      const input = transitionAssignmentsSchema.parse(body);
      const activeYear = activeAcademicYear(schoolId);
      const targetYear = academicYear(schoolId, input.target_academic_year_id);
      if (targetYear.is_active || targetYear.start_date <= activeYear.start_date)
        throw new HttpError(
          400,
          'Penugasan hanya dapat diatur pada draft tahun ajaran berikutnya.',
        );

      const teacherIds = new Set(
        (
          db()
            .prepare('SELECT id FROM teachers WHERE school_id=? AND is_active=1')
            .all(schoolId) as Array<{ id: string }>
        ).map((item) => item.id),
      );
      const subjectIds = new Set(
        (
          db()
            .prepare('SELECT id FROM subjects WHERE school_id=? AND is_active=1')
            .all(schoolId) as Array<{ id: string }>
        ).map((item) => item.id),
      );
      const extracurricularIds = new Set(
        (
          db()
            .prepare('SELECT id FROM extracurriculars WHERE school_id=? AND is_active=1')
            .all(schoolId) as Array<{ id: string }>
        ).map((item) => item.id),
      );
      const classIds = new Set(
        (
          db()
            .prepare(
              'SELECT id FROM classes WHERE school_id=? AND academic_year_id=? AND is_active=1',
            )
            .all(schoolId, targetYear.id) as Array<{ id: string }>
        ).map((item) => item.id),
      );
      const semesterIds = new Set(
        (
          db()
            .prepare('SELECT id FROM semesters WHERE academic_year_id=?')
            .all(targetYear.id) as Array<{ id: string }>
        ).map((item) => item.id),
      );
      const activeStudentIds = (
        db()
          .prepare(
            `SELECT s.id FROM students s
             JOIN class_memberships cm ON cm.student_id=s.id
             WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=?
               AND cm.status='active' ORDER BY s.name`,
          )
          .all(schoolId, activeYear.id) as Array<{ id: string }>
      ).map((student) => student.id);
      const activeStudentIdSet = new Set(activeStudentIds);
      const periodId = (value: string) => {
        if (value === 'all') return null;
        if (!semesterIds.has(value)) throw new HttpError(400, 'Semester penugasan tidak valid.');
        return value;
      };
      const ensureTeacher = (id: string) => {
        if (!teacherIds.has(id)) throw new HttpError(400, 'Guru tidak aktif atau tidak valid.');
      };

      if (input.homeroom_assignments.length !== classIds.size)
        throw new HttpError(400, 'Tetapkan tepat satu wali kelas untuk setiap rombel tahun baru.');
      if (new Set(input.homeroom_assignments.map((item) => item.class_id)).size !== classIds.size)
        throw new HttpError(400, 'Setiap rombel harus memiliki satu wali kelas yang berbeda.');
      if (
        new Set(input.homeroom_assignments.map((item) => item.teacher_id)).size !==
        input.homeroom_assignments.length
      )
        throw new HttpError(400, 'Satu guru hanya dapat menjadi wali untuk satu rombel.');

      db().transaction(() => {
        const existingTeaching = db()
          .prepare('SELECT * FROM teaching_assignments WHERE academic_year_id=?')
          .all(targetYear.id) as Array<Record<string, unknown> & { id: string }>;
        const submittedTeachingIds = new Set(
          input.teaching_assignments.flatMap((item) => item.id || []),
        );
        for (const existing of existingTeaching)
          if (!submittedTeachingIds.has(existing.id)) {
            db()
              .prepare('DELETE FROM class_schedules WHERE teaching_assignment_id=?')
              .run(existing.id);
            db().prepare('DELETE FROM teaching_assignments WHERE id=?').run(existing.id);
          }
        for (const assignment of input.teaching_assignments) {
          ensureTeacher(assignment.teacher_id);
          if (!subjectIds.has(assignment.subject_id))
            throw new HttpError(400, 'Mata pelajaran tidak aktif atau tidak valid.');
          if (!classIds.has(assignment.class_id))
            throw new HttpError(400, 'Rombel penugasan tidak berada pada tahun ajaran baru.');
          const semesterId = periodId(assignment.semester_id);
          const existing = assignment.id
            ? existingTeaching.find((item) => item.id === assignment.id)
            : undefined;
          if (assignment.id && !existing)
            throw new HttpError(404, 'Penugasan mata pelajaran tidak ditemukan.');
          if (existing) {
            const changed =
              existing.teacher_id !== assignment.teacher_id ||
              existing.subject_id !== assignment.subject_id ||
              existing.class_id !== assignment.class_id ||
              existing.semester_id !== semesterId;
            if (changed)
              db()
                .prepare('DELETE FROM class_schedules WHERE teaching_assignment_id=?')
                .run(existing.id);
            db()
              .prepare(
                `UPDATE teaching_assignments SET teacher_id=?,subject_id=?,class_id=?,semester_id=?,
                 updated_at=datetime('now') WHERE id=?`,
              )
              .run(
                assignment.teacher_id,
                assignment.subject_id,
                assignment.class_id,
                semesterId,
                existing.id,
              );
          } else
            db()
              .prepare(
                `INSERT INTO teaching_assignments
                 (id,teacher_id,subject_id,class_id,academic_year_id,semester_id)
                 VALUES(?,?,?,?,?,?)`,
              )
              .run(
                randomUUID(),
                assignment.teacher_id,
                assignment.subject_id,
                assignment.class_id,
                targetYear.id,
                semesterId,
              );
        }

        db()
          .prepare('DELETE FROM homeroom_assignments WHERE academic_year_id=?')
          .run(targetYear.id);
        const insertHomeroom = db().prepare(
          `INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id)
           VALUES(?,?,?,?)`,
        );
        for (const assignment of input.homeroom_assignments) {
          ensureTeacher(assignment.teacher_id);
          if (!classIds.has(assignment.class_id))
            throw new HttpError(400, 'Rombel wali kelas tidak berada pada tahun ajaran baru.');
          insertHomeroom.run(
            randomUUID(),
            assignment.teacher_id,
            assignment.class_id,
            targetYear.id,
          );
        }

        const existingExtracurricular = db()
          .prepare('SELECT id FROM extracurricular_assignments WHERE academic_year_id=?')
          .all(targetYear.id) as Array<{ id: string }>;
        const submittedExtracurricularIds = new Set(
          input.extracurricular_assignments.flatMap((item) => item.id || []),
        );
        for (const existing of existingExtracurricular)
          if (!submittedExtracurricularIds.has(existing.id))
            db().prepare('DELETE FROM extracurricular_assignments WHERE id=?').run(existing.id);
        for (const assignment of input.extracurricular_assignments) {
          ensureTeacher(assignment.teacher_id);
          if (!extracurricularIds.has(assignment.extracurricular_id))
            throw new HttpError(400, 'Ekstrakurikuler tidak aktif atau tidak valid.');
          const extracurricular = db()
            .prepare('SELECT is_required FROM extracurriculars WHERE id=? AND school_id=?')
            .get(assignment.extracurricular_id, schoolId) as { is_required: number } | undefined;
          const participantIds = extracurricular?.is_required
            ? activeStudentIds
            : assignment.student_ids;
          if (new Set(participantIds).size !== participantIds.length)
            throw new HttpError(400, 'Daftar peserta memuat murid yang sama.');
          for (const studentId of participantIds)
            if (!activeStudentIdSet.has(studentId))
              throw new HttpError(
                400,
                'Semua peserta harus merupakan murid aktif pada tahun ajaran sebelumnya.',
              );
          if (assignment.quota > 0 && participantIds.length > assignment.quota)
            throw new HttpError(400, 'Jumlah peserta ekstrakurikuler melebihi kuota.');
          const semesterId = periodId(assignment.semester_id);
          const existing = assignment.id
            ? existingExtracurricular.find((item) => item.id === assignment.id)
            : undefined;
          if (assignment.id && !existing)
            throw new HttpError(404, 'Penugasan ekstrakurikuler tidak ditemukan.');
          const assignmentId = existing?.id || randomUUID();
          if (existing)
            db()
              .prepare(
                `UPDATE extracurricular_assignments SET extracurricular_id=?,teacher_id=?,
                 semester_id=?,location=?,quota=?,status=?,updated_at=datetime('now') WHERE id=?`,
              )
              .run(
                assignment.extracurricular_id,
                assignment.teacher_id,
                semesterId,
                assignment.location,
                assignment.quota,
                assignment.status,
                assignmentId,
              );
          else
            db()
              .prepare(
                `INSERT INTO extracurricular_assignments
                 (id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,map_url,quota,status)
                 VALUES(?,?,?,?,?,?,?,?,?)`,
              )
              .run(
                assignmentId,
                assignment.extracurricular_id,
                assignment.teacher_id,
                targetYear.id,
                semesterId,
                assignment.location,
                '',
                assignment.quota,
                assignment.status,
              );
          db()
            .prepare('DELETE FROM extracurricular_participants WHERE assignment_id=?')
            .run(assignmentId);
          const insertParticipant = db().prepare(
            'INSERT INTO extracurricular_participants(id,assignment_id,student_id) VALUES(?,?,?)',
          );
          for (const studentId of participantIds)
            insertParticipant.run(randomUUID(), assignmentId, studentId);
        }
        audit(actor.email, 'update', 'annual-transition-assignments', targetYear.id, {
          teaching_assignments: input.teaching_assignments.length,
          homeroom_assignments: input.homeroom_assignments.length,
          extracurricular_assignments: input.extracurricular_assignments.length,
        });
      })();
      return Response.json({ ok: true });
    }
    const input = schema.parse(body);
    if (!input.activate_target && input.actions.length === 0)
      throw new HttpError(400, 'Pilih minimal satu murid.');
    const sourceYear = academicYear(schoolId, input.source_academic_year_id);
    const targetYear = input.target_academic_year_id
      ? academicYear(schoolId, input.target_academic_year_id)
      : academicYear(schoolId, activeAcademicYear(schoolId).id);
    if (sourceYear.start_date >= targetYear.start_date)
      throw new HttpError(400, 'Tahun ajaran tujuan harus berada setelah tahun ajaran asal.');
    if (input.activate_target) {
      if (!sourceYear.is_active)
        throw new HttpError(
          409,
          'Tahun ajaran asal bukan lagi tahun ajaran aktif. Muat ulang proses.',
        );
      if (targetYear.is_active) throw new HttpError(409, 'Tahun ajaran tujuan sudah aktif.');
      const semesterCount = (
        db()
          .prepare('SELECT count(*) AS total FROM semesters WHERE academic_year_id=?')
          .get(targetYear.id) as { total: number }
      ).total;
      if (semesterCount !== 2)
        throw new HttpError(409, 'Tahun ajaran tujuan harus memiliki tepat dua semester.');
    }
    if (new Set(input.actions.map((action) => action.student_id)).size !== input.actions.length)
      throw new HttpError(400, 'Satu murid tidak boleh diproses lebih dari sekali.');

    const summary = { promoted: 0, retained: 0, graduated: 0, withdrawn: 0 };
    const batchId = randomUUID();
    db().transaction(() => {
      const targets = new Map(
        (
          db()
            .prepare(
              `SELECT c.id,g.level_order FROM classes c
               JOIN grades g ON g.id=c.grade_id
               WHERE c.school_id=? AND c.academic_year_id=? AND c.is_active=1`,
            )
            .all(schoolId, targetYear.id) as {
            id: string;
            level_order: number;
          }[]
        ).map((row) => [row.id, row]),
      );
      if (input.activate_target && targets.size === 0)
        throw new HttpError(409, 'Tahun ajaran tujuan belum memiliki rombel aktif.');
      const maxLevel = (
        db()
          .prepare('SELECT max(level_order) AS level FROM grades WHERE school_id=? AND is_active=1')
          .get(schoolId) as { level: number | null }
      ).level;
      const storedActions: Array<z.infer<typeof actionSchema> & { source_membership_id: string }> =
        [];
      for (const action of input.actions) {
        const membership = db()
          .prepare(
            `SELECT cm.id,g.level_order FROM class_memberships cm
             JOIN students s ON s.id=cm.student_id JOIN classes c ON c.id=cm.class_id
             JOIN grades g ON g.id=c.grade_id
             WHERE cm.student_id=? AND s.school_id=? AND cm.academic_year_id=? AND cm.status='active'`,
          )
          .get(action.student_id, schoolId, sourceYear.id) as
          { id: string; level_order: number } | undefined;
        if (!membership)
          throw new HttpError(400, 'Ada murid yang tidak lagi aktif pada tahun ajaran asal.');
        const needsClass = action.outcome === 'promoted' || action.outcome === 'retained';
        if (needsClass && !action.target_class_id)
          throw new HttpError(
            400,
            'Rombel tujuan wajib dipilih untuk murid yang naik/tinggal kelas.',
          );
        if (!needsClass && action.target_class_id)
          throw new HttpError(400, 'Murid lulus atau keluar tidak boleh memiliki rombel tujuan.');
        if (needsClass) {
          const target = targets.get(action.target_class_id);
          if (!target) throw new HttpError(400, 'Rombel tujuan tidak valid.');
          if (
            input.activate_target &&
            action.outcome === 'promoted' &&
            target.level_order !== membership.level_order + 1
          )
            throw new HttpError(
              400,
              'Rombel murid yang naik harus berada tepat satu tingkat di atasnya.',
            );
          if (
            input.activate_target &&
            action.outcome === 'retained' &&
            target.level_order !== membership.level_order
          )
            throw new HttpError(
              400,
              'Rombel murid yang tinggal kelas harus berada pada tingkat yang sama.',
            );
        }
        if (
          input.activate_target &&
          action.outcome === 'graduated' &&
          membership.level_order !== maxLevel
        )
          throw new HttpError(
            400,
            'Status lulus hanya dapat diberikan kepada murid tingkat terakhir.',
          );
        storedActions.push({ ...action, source_membership_id: membership.id });
      }
      if (input.activate_target) {
        const sourceStudentCount = (
          db()
            .prepare(
              "SELECT count(*) AS total FROM class_memberships WHERE academic_year_id=? AND status='active'",
            )
            .get(sourceYear.id) as { total: number }
        ).total;
        if (storedActions.length !== sourceStudentCount)
          throw new HttpError(
            409,
            'Semua murid aktif harus ditinjau sebelum tahun ajaran baru diaktifkan.',
          );
      }
      db()
        .prepare(
          `INSERT INTO promotion_batches
           (id,school_id,source_academic_year_id,target_academic_year_id,actions,activates_target,created_by)
           VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          batchId,
          schoolId,
          sourceYear.id,
          targetYear.id,
          JSON.stringify(storedActions),
          Number(input.activate_target),
          actor.email,
        );
      for (const action of storedActions) {
        const status = action.outcome === 'withdrawn' ? 'withdrawn' : 'completed';
        db()
          .prepare(
            `UPDATE class_memberships SET status=?,completion_reason=?,end_date=?,updated_at=datetime('now')
             WHERE id=? AND status='active'`,
          )
          .run(status, action.outcome, sourceYear.end_date, action.source_membership_id);
        if (action.outcome === 'promoted' || action.outcome === 'retained') {
          db()
            .prepare(
              `INSERT INTO class_memberships
               (id,student_id,class_id,academic_year_id,start_date,status,promotion_batch_id)
               VALUES(?,?,?,?,?,'active',?)`,
            )
            .run(
              randomUUID(),
              action.student_id,
              action.target_class_id,
              targetYear.id,
              targetYear.start_date,
              batchId,
            );
          db()
            .prepare("UPDATE students SET is_active=1,updated_at=datetime('now') WHERE id=?")
            .run(action.student_id);
        } else {
          db()
            .prepare("UPDATE students SET is_active=0,updated_at=datetime('now') WHERE id=?")
            .run(action.student_id);
        }
        summary[action.outcome]++;
      }
      if (input.activate_target) {
        db()
          .prepare(
            "UPDATE academic_years SET is_active=0,updated_at=datetime('now') WHERE school_id=?",
          )
          .run(schoolId);
        db()
          .prepare("UPDATE academic_years SET is_active=1,updated_at=datetime('now') WHERE id=?")
          .run(targetYear.id);
        db()
          .prepare(
            `UPDATE semesters SET is_active=0,updated_at=datetime('now')
             WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id=?)`,
          )
          .run(schoolId);
        db()
          .prepare(
            `UPDATE semesters SET is_active=1,updated_at=datetime('now')
             WHERE id=(SELECT id FROM semesters WHERE academic_year_id=? ORDER BY period LIMIT 1)`,
          )
          .run(targetYear.id);
      }
      audit(
        actor.email,
        input.activate_target ? 'transition' : 'promote',
        'class_memberships',
        batchId,
        {
          source_academic_year_id: sourceYear.id,
          target_academic_year_id: targetYear.id,
          summary,
        },
      );
    })();
    return Response.json({ ok: true, id: batchId, summary });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('promotions.write');
    const schoolId = currentSchoolId();
    const id = z
      .string()
      .uuid('Batch kenaikan tidak valid.')
      .parse((await request.json()).id);
    db().transaction(() => {
      const batch = db()
        .prepare(
          "SELECT * FROM promotion_batches WHERE id=? AND school_id=? AND status='completed'",
        )
        .get(id, schoolId) as
        | {
            id: string;
            source_academic_year_id: string;
            target_academic_year_id: string;
            actions: string;
            activates_target: number;
          }
        | undefined;
      if (!batch) throw new HttpError(404, 'Proses kenaikan aktif tidak ditemukan.');
      const changedTarget = db()
        .prepare(
          `SELECT count(*) AS total FROM class_memberships
           WHERE promotion_batch_id=? AND status<>'active'`,
        )
        .get(id) as { total: number };
      if (changedTarget.total)
        throw new HttpError(
          409,
          'Proses tidak dapat dibatalkan karena penempatan tahun baru sudah berubah.',
        );
      if (batch.activates_target) {
        const unrelatedTarget = (
          db()
            .prepare(
              `SELECT count(*) AS total FROM class_memberships
               WHERE academic_year_id=? AND status='active'
                 AND (promotion_batch_id IS NULL OR promotion_batch_id<>?)`,
            )
            .get(batch.target_academic_year_id, id) as { total: number }
        ).total;
        if (unrelatedTarget)
          throw new HttpError(
            409,
            'Proses tidak dapat dibatalkan karena tahun baru sudah memiliki perubahan lanjutan.',
          );
      }
      const actions = JSON.parse(batch.actions) as Array<
        z.infer<typeof actionSchema> & { source_membership_id?: string }
      >;
      db().prepare('DELETE FROM class_memberships WHERE promotion_batch_id=?').run(id);
      for (const action of actions) {
        const anotherActive = db()
          .prepare("SELECT id FROM class_memberships WHERE student_id=? AND status='active'")
          .get(action.student_id);
        if (anotherActive)
          throw new HttpError(
            409,
            'Murid sudah memiliki penempatan baru sehingga proses tidak dapat dibatalkan.',
          );
        const restored = action.source_membership_id
          ? db()
              .prepare(
                `UPDATE class_memberships SET status='active',completion_reason='',end_date=NULL,
                 updated_at=datetime('now') WHERE id=? AND completion_reason=?`,
              )
              .run(action.source_membership_id, action.outcome)
          : db()
              .prepare(
                `UPDATE class_memberships SET status='active',completion_reason='',end_date=NULL,
                 updated_at=datetime('now')
                 WHERE student_id=? AND academic_year_id=? AND completion_reason=?`,
              )
              .run(action.student_id, batch.source_academic_year_id, action.outcome);
        if (!restored.changes)
          throw new HttpError(409, 'Riwayat asal telah berubah dan tidak dapat dipulihkan.');
        db()
          .prepare("UPDATE students SET is_active=1,updated_at=datetime('now') WHERE id=?")
          .run(action.student_id);
      }
      if (batch.activates_target) {
        const currentActive = activeAcademicYear(schoolId);
        if (currentActive.id !== batch.target_academic_year_id)
          throw new HttpError(
            409,
            'Tahun ajaran aktif sudah berubah sehingga proses tidak dapat dibatalkan.',
          );
        db()
          .prepare(
            "UPDATE academic_years SET is_active=0,updated_at=datetime('now') WHERE school_id=?",
          )
          .run(schoolId);
        db()
          .prepare("UPDATE academic_years SET is_active=1,updated_at=datetime('now') WHERE id=?")
          .run(batch.source_academic_year_id);
        db()
          .prepare(
            `UPDATE semesters SET is_active=0,updated_at=datetime('now')
             WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id=?)`,
          )
          .run(schoolId);
        db()
          .prepare(
            `UPDATE semesters SET is_active=1,updated_at=datetime('now')
             WHERE id=(SELECT id FROM semesters WHERE academic_year_id=? ORDER BY period DESC LIMIT 1)`,
          )
          .run(batch.source_academic_year_id);
      }
      db()
        .prepare(
          "UPDATE promotion_batches SET status='undone',undone_at=datetime('now') WHERE id=?",
        )
        .run(id);
      audit(actor.email, 'undo', 'class_memberships', id, {
        source_academic_year_id: batch.source_academic_year_id,
        target_academic_year_id: batch.target_academic_year_id,
        student_count: actions.length,
      });
    })();
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
