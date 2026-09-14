import { db } from '@/lib/db';

export type ExamConflict = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  entry_id?: string;
};

type ExamPeriodRules = {
  id: string;
  start_date: string;
  end_date: string;
  max_exams_per_class_per_day: number;
  max_supervisions_per_teacher_per_day: number;
  supervisors_per_room: number;
  minimum_break_minutes: number;
  allow_self_supervision: number;
  enforce_room_capacity: number;
};

function minutes(value: string) {
  const [hours, minute] = value.split(':').map(Number);
  return hours * 60 + minute;
}

export function examConflicts(periodId: string): ExamConflict[] {
  const period = db().prepare('SELECT * FROM exam_periods WHERE id=?').get(periodId) as
    ExamPeriodRules | undefined;
  if (!period) return [];
  const conflicts: ExamConflict[] = [];
  const push = (conflict: ExamConflict) => {
    if (
      !conflicts.some((item) => item.code === conflict.code && item.entry_id === conflict.entry_id)
    )
      conflicts.push(conflict);
  };
  const entries = db()
    .prepare(
      `SELECT e.id,e.subject_id,e.room_id,e.duration_minutes,se.exam_date,se.start_time,se.end_time,
              r.capacity,r.name AS room_name,s.name AS subject_name
       FROM exam_schedule_entries e JOIN exam_sessions se ON se.id=e.exam_session_id
       JOIN rooms r ON r.id=e.room_id JOIN subjects s ON s.id=e.subject_id
       WHERE e.exam_period_id=?`,
    )
    .all(periodId) as Array<{
    id: string;
    subject_id: string;
    room_id: string;
    duration_minutes: number;
    exam_date: string;
    start_time: string;
    end_time: string;
    capacity: number;
    room_name: string;
    subject_name: string;
  }>;

  for (const entry of entries) {
    if (entry.exam_date < period.start_date || entry.exam_date > period.end_date)
      push({
        code: 'SESSION_OUTSIDE_PERIOD',
        severity: 'error',
        entry_id: entry.id,
        message: `${entry.subject_name}: sesi berada di luar periode ujian.`,
      });
    if (entry.duration_minutes > minutes(entry.end_time) - minutes(entry.start_time))
      push({
        code: 'DURATION_EXCEEDS_SESSION',
        severity: 'error',
        entry_id: entry.id,
        message: `${entry.subject_name}: durasi melebihi waktu sesi.`,
      });
    const participantCount = (
      db()
        .prepare(
          'SELECT COALESCE(SUM(participant_count),0) AS count FROM exam_schedule_classes WHERE exam_schedule_entry_id=?',
        )
        .get(entry.id) as { count: number }
    ).count;
    if (period.enforce_room_capacity && participantCount > entry.capacity)
      push({
        code: 'ROOM_CAPACITY',
        severity: 'error',
        entry_id: entry.id,
        message: `${entry.room_name}: ${participantCount} peserta melebihi kapasitas ${entry.capacity}.`,
      });
    const supervisorCount = (
      db()
        .prepare('SELECT COUNT(*) AS count FROM exam_supervisors WHERE exam_schedule_entry_id=?')
        .get(entry.id) as { count: number }
    ).count;
    if (supervisorCount < period.supervisors_per_room)
      push({
        code: 'SUPERVISOR_SHORTAGE',
        severity: 'warning',
        entry_id: entry.id,
        message: `${entry.room_name}: baru ${supervisorCount} dari ${period.supervisors_per_room} pengawas.`,
      });

    const unavailableRoom = db()
      .prepare(
        `SELECT id FROM exam_unavailabilities
         WHERE exam_period_id=? AND resource_type='room' AND room_id=? AND exam_date=?
           AND (exam_session_id IS NULL OR exam_session_id=(SELECT exam_session_id FROM exam_schedule_entries WHERE id=?))`,
      )
      .get(periodId, entry.room_id, entry.exam_date, entry.id);
    if (unavailableRoom)
      push({
        code: 'ROOM_UNAVAILABLE',
        severity: 'error',
        entry_id: entry.id,
        message: `${entry.room_name} ditandai tidak tersedia pada sesi ini.`,
      });

    const supervisors = db()
      .prepare(
        'SELECT teacher_id,teacher_name FROM exam_supervisors WHERE exam_schedule_entry_id=?',
      )
      .all(entry.id) as Array<{ teacher_id: string; teacher_name: string }>;
    for (const supervisor of supervisors) {
      const unavailable = db()
        .prepare(
          `SELECT id FROM exam_unavailabilities
           WHERE exam_period_id=? AND resource_type='teacher' AND teacher_id=? AND exam_date=?
             AND (exam_session_id IS NULL OR exam_session_id=(SELECT exam_session_id FROM exam_schedule_entries WHERE id=?))`,
        )
        .get(periodId, supervisor.teacher_id, entry.exam_date, entry.id);
      if (unavailable)
        push({
          code: `TEACHER_UNAVAILABLE:${supervisor.teacher_id}`,
          severity: 'error',
          entry_id: entry.id,
          message: `${supervisor.teacher_name} ditandai tidak tersedia pada sesi ini.`,
        });
      if (!period.allow_self_supervision) {
        const teaches = db()
          .prepare(
            `SELECT ta.id FROM teaching_assignments ta JOIN exam_schedule_classes ec ON ec.class_id=ta.class_id
             WHERE ec.exam_schedule_entry_id=? AND ta.teacher_id=? AND ta.subject_id=? LIMIT 1`,
          )
          .get(entry.id, supervisor.teacher_id, entry.subject_id);
        if (teaches)
          push({
            code: `SELF_SUPERVISION:${supervisor.teacher_id}`,
            severity: 'warning',
            entry_id: entry.id,
            message: `${supervisor.teacher_name} mengawasi mata pelajaran/rombel yang diampu sendiri.`,
          });
      }
      const dailyCount = (
        db()
          .prepare(
            `SELECT COUNT(*) AS count FROM exam_supervisors es
             JOIN exam_schedule_entries ee ON ee.id=es.exam_schedule_entry_id
             JOIN exam_sessions ss ON ss.id=ee.exam_session_id
             WHERE ee.exam_period_id=? AND es.teacher_id=? AND ss.exam_date=?`,
          )
          .get(periodId, supervisor.teacher_id, entry.exam_date) as { count: number }
      ).count;
      if (dailyCount > period.max_supervisions_per_teacher_per_day)
        push({
          code: `MAX_SUPERVISIONS:${supervisor.teacher_id}`,
          severity: 'warning',
          entry_id: entry.id,
          message: `${supervisor.teacher_name} mendapat ${dailyCount} sesi pengawasan pada ${entry.exam_date}.`,
        });
    }
  }

  const duplicateClasses = db()
    .prepare(
      `SELECT e.id,c.class_name FROM exam_schedule_classes c
       JOIN exam_schedule_entries e ON e.id=c.exam_schedule_entry_id
       WHERE e.exam_period_id=? AND EXISTS (
         SELECT 1 FROM exam_schedule_classes c2 JOIN exam_schedule_entries e2 ON e2.id=c2.exam_schedule_entry_id
         WHERE c2.class_id=c.class_id AND e2.exam_session_id=e.exam_session_id AND e2.id<>e.id
           AND (e.participant_mode='class' OR e2.participant_mode='class')
       )`,
    )
    .all(periodId) as Array<{ id: string; class_name: string }>;
  for (const row of duplicateClasses)
    push({
      code: 'CLASS_DOUBLE_BOOKED',
      severity: 'error',
      entry_id: row.id,
      message: `${row.class_name} memiliki lebih dari satu ujian pada sesi yang sama.`,
    });

  const duplicateStudents = db()
    .prepare(
      `SELECT e.id,ess.student_id,ess.student_name FROM exam_schedule_students ess
       JOIN exam_schedule_entries e ON e.id=ess.exam_schedule_entry_id
       WHERE e.exam_period_id=? AND EXISTS (
         SELECT 1 FROM exam_schedule_students ess2
         JOIN exam_schedule_entries e2 ON e2.id=ess2.exam_schedule_entry_id
         WHERE ess2.student_id=ess.student_id AND e2.exam_session_id=e.exam_session_id AND e2.id<>e.id
       )`,
    )
    .all(periodId) as Array<{ id: string; student_id: string; student_name: string }>;
  for (const row of duplicateStudents)
    push({
      code: `STUDENT_DOUBLE_BOOKED:${row.student_id}`,
      severity: 'error',
      entry_id: row.id,
      message: `${row.student_name} ditempatkan di lebih dari satu ruang pada sesi yang sama.`,
    });

  const duplicateSupervisors = db()
    .prepare(
      `SELECT e.id,es.teacher_name FROM exam_supervisors es
       JOIN exam_schedule_entries e ON e.id=es.exam_schedule_entry_id
       WHERE e.exam_period_id=? AND EXISTS (
         SELECT 1 FROM exam_supervisors es2 JOIN exam_schedule_entries e2 ON e2.id=es2.exam_schedule_entry_id
         WHERE es2.teacher_id=es.teacher_id AND e2.exam_session_id=e.exam_session_id AND e2.id<>e.id
       )`,
    )
    .all(periodId) as Array<{ id: string; teacher_name: string }>;
  for (const row of duplicateSupervisors)
    push({
      code: 'TEACHER_DOUBLE_BOOKED',
      severity: 'error',
      entry_id: row.id,
      message: `${row.teacher_name} ditugaskan di lebih dari satu ruang pada sesi yang sama.`,
    });

  const dailyClassCounts = db()
    .prepare(
      `SELECT MIN(e.id) AS entry_id,c.class_name,se.exam_date,COUNT(*) AS count
       FROM exam_schedule_classes c JOIN exam_schedule_entries e ON e.id=c.exam_schedule_entry_id
       JOIN exam_sessions se ON se.id=e.exam_session_id WHERE e.exam_period_id=?
       GROUP BY c.class_id,se.exam_date HAVING COUNT(*)>?`,
    )
    .all(periodId, period.max_exams_per_class_per_day) as Array<{
    entry_id: string;
    class_name: string;
    exam_date: string;
    count: number;
  }>;
  for (const row of dailyClassCounts)
    push({
      code: `MAX_EXAMS:${row.class_name}:${row.exam_date}`,
      severity: 'warning',
      entry_id: row.entry_id,
      message: `${row.class_name} memiliki ${row.count} ujian pada ${row.exam_date}.`,
    });

  if (period.minimum_break_minutes > 0) {
    const classSessions = db()
      .prepare(
        `SELECT c.class_id,c.class_name,e.id,se.exam_date,se.start_time,se.end_time
         FROM exam_schedule_classes c JOIN exam_schedule_entries e ON e.id=c.exam_schedule_entry_id
         JOIN exam_sessions se ON se.id=e.exam_session_id WHERE e.exam_period_id=?
         ORDER BY c.class_id,se.exam_date,se.start_time`,
      )
      .all(periodId) as Array<{
      class_id: string;
      class_name: string;
      id: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    }>;
    for (let index = 1; index < classSessions.length; index += 1) {
      const previous = classSessions[index - 1];
      const current = classSessions[index];
      if (
        previous.class_id === current.class_id &&
        previous.exam_date === current.exam_date &&
        minutes(current.start_time) - minutes(previous.end_time) < period.minimum_break_minutes
      )
        push({
          code: `MINIMUM_BREAK:${current.class_id}:${current.exam_date}`,
          severity: 'warning',
          entry_id: current.id,
          message: `${current.class_name} mendapat jeda kurang dari ${period.minimum_break_minutes} menit.`,
        });
    }
  }
  return conflicts;
}

export function regularScheduleBlock(schoolId: string, classId: string, date: string) {
  return db()
    .prepare(
      `SELECT ep.name,ep.regular_schedule_policy FROM exam_periods ep
       WHERE ep.school_id=? AND ep.status='published' AND ep.start_date<=? AND ep.end_date>=?
         AND (ep.regular_schedule_policy='suspend_all_classes' OR (
           ep.regular_schedule_policy='suspend_participating_classes' AND EXISTS (
             SELECT 1 FROM exam_schedule_entries ee
             JOIN exam_sessions es ON es.id=ee.exam_session_id
             JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=ee.id
             WHERE ee.exam_period_id=ep.id AND ec.class_id=? AND es.exam_date=?
           )
         ))
       ORDER BY ep.start_date LIMIT 1`,
    )
    .get(schoolId, date, date, classId, date) as
    { name: string; regular_schedule_policy: string } | undefined;
}
