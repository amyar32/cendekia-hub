import { randomUUID } from 'node:crypto';
import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';

// Copy configuration and participants only; sessions remain attached to their original year.
export function copyTahfidzGroups(schoolId: string, sourceYearId: string, targetYearId: string) {
  const groups = db()
    .prepare(
      `
    SELECT g.*,s.period FROM tahfidz_groups g
    JOIN teachers t ON t.id=g.teacher_id AND t.is_active=1 AND t.school_id=g.school_id
    JOIN schedule_time_slots slot ON slot.id=g.time_slot_id AND slot.is_active=1 AND slot.is_break=0
    LEFT JOIN semesters s ON s.id=g.semester_id
    WHERE g.school_id=? AND g.academic_year_id=? AND g.status<>'completed'
    ORDER BY g.id
  `,
    )
    .all(schoolId, sourceYearId) as Array<{
    id: string;
    name: string;
    teacher_id: string;
    period: number | null;
    time_slot_id: string;
    weekday: number;
    weekdays: string;
    location: string;
    quota: number;
  }>;
  for (const group of groups) {
    const semester =
      group.period === null
        ? null
        : (db()
            .prepare('SELECT id FROM semesters WHERE academic_year_id=? AND period=?')
            .get(targetYearId, group.period) as { id: string } | undefined);
    if (group.period !== null && !semester)
      throw new HttpError(409, 'Semester tujuan untuk kelompok tahfidz belum tersedia.');
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO tahfidz_groups
      (id,school_id,name,teacher_id,academic_year_id,semester_id,time_slot_id,weekday,weekdays,location,quota,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft')`,
      )
      .run(
        id,
        schoolId,
        group.name,
        group.teacher_id,
        targetYearId,
        semester?.id ?? null,
        group.time_slot_id,
        group.weekday,
        group.weekdays,
        group.location,
        group.quota,
      );
    const members = db()
      .prepare(
        `SELECT DISTINCT gm.student_id FROM tahfidz_group_members gm
      JOIN students s ON s.id=gm.student_id AND s.school_id=? AND s.is_active=1
      JOIN class_memberships cm ON cm.student_id=s.id AND cm.academic_year_id=? AND cm.status='active'
      WHERE gm.group_id=?`,
      )
      .all(schoolId, sourceYearId, group.id) as { student_id: string }[];
    const insert = db().prepare(
      'INSERT INTO tahfidz_group_members(id,group_id,student_id) VALUES(?,?,?)',
    );
    for (const member of members) insert.run(randomUUID(), id, member.student_id);
  }
  return groups.length;
}

function participants(schoolId: string, yearId: string) {
  return (
    db()
      .prepare('SELECT id FROM tahfidz_groups WHERE school_id=? AND academic_year_id=? ORDER BY id')
      .all(schoolId, yearId) as { id: string }[]
  ).map(({ id }) => ({
    id,
    student_ids: db()
      .prepare('SELECT student_id FROM tahfidz_group_members WHERE group_id=? ORDER BY student_id')
      .pluck()
      .all(id) as string[],
  }));
}

export function reconcileTahfidzParticipants(schoolId: string, yearId: string) {
  const before = participants(schoolId, yearId);
  db()
    .prepare(
      `DELETE FROM tahfidz_group_members
    WHERE group_id IN (SELECT id FROM tahfidz_groups WHERE school_id=? AND academic_year_id=?)
      AND NOT EXISTS(SELECT 1 FROM students s JOIN class_memberships cm ON cm.student_id=s.id
        WHERE s.id=tahfidz_group_members.student_id AND s.school_id=? AND s.is_active=1
          AND cm.academic_year_id=? AND cm.status='active')`,
    )
    .run(schoolId, yearId, schoolId, yearId);
  return JSON.stringify({ before, after: participants(schoolId, yearId) });
}

export function restoreTahfidzParticipants(schoolId: string, yearId: string, snapshot: string) {
  if (
    db()
      .prepare(
        `SELECT ts.id FROM tahfidz_sessions ts JOIN tahfidz_groups g ON g.id=ts.group_id
    WHERE g.school_id=? AND g.academic_year_id=? LIMIT 1`,
      )
      .get(schoolId, yearId)
  )
    throw new HttpError(
      409,
      'Pergantian tidak dapat dibatalkan karena tahun baru sudah memiliki sesi tahfidz.',
    );
  if (!snapshot) return;
  const saved = JSON.parse(snapshot) as {
    before: ReturnType<typeof participants>;
    after: ReturnType<typeof participants>;
  };
  if (JSON.stringify(participants(schoolId, yearId)) !== JSON.stringify(saved.after))
    throw new HttpError(
      409,
      'Peserta tahfidz tahun baru sudah berubah sehingga pergantian tidak dapat dibatalkan.',
    );
  const insert = db().prepare(
    'INSERT OR IGNORE INTO tahfidz_group_members(id,group_id,student_id) VALUES(?,?,?)',
  );
  for (const group of saved.before)
    for (const studentId of group.student_ids) insert.run(randomUUID(), group.id, studentId);
}
