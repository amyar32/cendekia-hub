import { randomUUID } from 'node:crypto';
import { audit, db } from '@/lib/db';

export function localDateTime(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
    weekday: ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[
      value.weekday
    ],
  };
}

export function assignAutomaticAbsences(schoolId: string, actor: { id: string; email: string }) {
  const school = db()
    .prepare('SELECT timezone,checkin_absent_after,schedule_weekdays FROM schools WHERE id=?')
    .get(schoolId) as
    { timezone: string; checkin_absent_after: string; schedule_weekdays: string } | undefined;
  if (!school?.checkin_absent_after) return { students: 0, teachers: 0 };

  const now = localDateTime(school.timezone);
  if (now.time < school.checkin_absent_after) return { students: 0, teachers: 0 };
  let activeWeekdays: number[];
  try {
    activeWeekdays = JSON.parse(school.schedule_weekdays || '[1,2,3,4,5]') as number[];
  } catch {
    activeWeekdays = [1, 2, 3, 4, 5];
  }
  if (!activeWeekdays.includes(now.weekday)) return { students: 0, teachers: 0 };

  const students = db()
    .prepare(
      `SELECT DISTINCT s.id FROM students s
       JOIN class_memberships cm ON cm.student_id=s.id
       WHERE s.school_id=? AND s.is_active=1 AND cm.status='active'
         AND cm.start_date<=? AND (cm.end_date IS NULL OR cm.end_date>=?)
         AND NOT EXISTS (
           SELECT 1 FROM student_checkins sc
           WHERE sc.student_id=s.id AND sc.attendance_date=?
         )`,
    )
    .all(schoolId, now.date, now.date, now.date) as Array<{ id: string }>;
  const teachers = db()
    .prepare(
      `SELECT t.id FROM teachers t WHERE t.school_id=? AND t.is_active=1
       AND NOT EXISTS (
         SELECT 1 FROM teacher_checkins tc
         WHERE tc.teacher_id=t.id AND tc.attendance_date=?
       )`,
    )
    .all(schoolId, now.date) as Array<{ id: string }>;

  const result = db().transaction(() => {
    const note = `Otomatis tidak hadir setelah pukul ${school.checkin_absent_after}`;
    const insertStudent = db().prepare(
      `INSERT OR IGNORE INTO student_checkins
       (id,school_id,student_id,attendance_date,status,source,note,recorded_by)
       VALUES(?,?,?,?,'absent','staff',?,?)`,
    );
    const insertTeacher = db().prepare(
      `INSERT OR IGNORE INTO teacher_checkins
       (id,school_id,teacher_id,attendance_date,status,source,note,recorded_by)
       VALUES(?,?,?,?,'absent','staff',?,?)`,
    );
    let studentCount = 0;
    let teacherCount = 0;
    for (const student of students)
      studentCount += Number(
        insertStudent.run(randomUUID(), schoolId, student.id, now.date, note, actor.id).changes,
      );
    for (const teacher of teachers)
      teacherCount += Number(
        insertTeacher.run(randomUUID(), schoolId, teacher.id, now.date, note, actor.id).changes,
      );
    if (studentCount || teacherCount)
      audit(actor.email, 'create', 'automatic_absences', schoolId, {
        date: now.date,
        after: school.checkin_absent_after,
        students: studentCount,
        teachers: teacherCount,
      });
    return { students: studentCount, teachers: teacherCount };
  });

  return result();
}
