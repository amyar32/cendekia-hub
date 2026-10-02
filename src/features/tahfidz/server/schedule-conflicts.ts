import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';

export function assertTahfidzScheduleAvailable(input: {
  schoolId: string;
  yearId: string;
  semesterId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  classId?: string;
  studentIds?: string[];
}) {
  const scope = `FROM tahfidz_groups g JOIN schedule_time_slots slot ON slot.id=g.time_slot_id
    WHERE g.school_id=? AND g.academic_year_id=? AND g.status='active'
      AND (g.semester_id IS NULL OR g.semester_id=?)
      AND EXISTS(SELECT 1 FROM json_each(g.weekdays) WHERE value=?)
      AND NOT(slot.end_time<=? OR slot.start_time>=?)`;
  const args = [
    input.schoolId,
    input.yearId,
    input.semesterId,
    input.weekday,
    input.startTime,
    input.endTime,
  ];
  if (
    db()
      .prepare(`SELECT g.id ${scope} AND g.teacher_id=? LIMIT 1`)
      .get(...args, input.teacherId)
  )
    throw new HttpError(409, 'Guru memiliki jadwal tahfidz pada waktu tersebut.');
  if (
    input.classId &&
    db()
      .prepare(
        `SELECT g.id ${scope} AND EXISTS(
    SELECT 1 FROM tahfidz_group_members gm JOIN class_memberships cm ON cm.student_id=gm.student_id
    WHERE gm.group_id=g.id AND cm.academic_year_id=g.academic_year_id AND cm.class_id=? AND cm.status='active') LIMIT 1`,
      )
      .get(...args, input.classId)
  )
    throw new HttpError(
      409,
      'Salah satu murid rombel ini memiliki jadwal tahfidz pada waktu tersebut.',
    );
  const studentConflict = db().prepare(`SELECT g.id ${scope} AND EXISTS(
    SELECT 1 FROM tahfidz_group_members gm WHERE gm.group_id=g.id AND gm.student_id=?) LIMIT 1`);
  for (const studentId of input.studentIds || [])
    if (studentConflict.get(...args, studentId))
      throw new HttpError(409, 'Salah satu peserta memiliki jadwal tahfidz pada waktu tersebut.');
}
