import { db } from '@/lib/db';
import { isoWeekday } from '@/lib/dates';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import { queuePushNotification } from '@/lib/notifications/push';

const SCHEDULE_NOTICE_LEAD_MINUTES = 15;
const ATTENDANCE_REMINDER_DELAY_MINUTES = 10;
const DELIVERY_WINDOW_MINUTES = 10;

type School = { id: string; timezone: string };
type Schedule = {
  school_id: string;
  schedule_id: string;
  teacher_user_id: string | null;
  class_id: string;
  class_name: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  attendance_status: string | null;
};

function localDateTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  };
}

function minutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * Queues teacher push notifications. Invoke this endpoint at least once every
 * ten minutes; unique outbox event keys make repeated runs safe.
 */
export function queueTeacherScheduleNotifications(now = new Date()) {
  let scheduleNotifications = 0;
  let attendanceReminders = 0;
  const schools = db()
    .prepare('SELECT id,timezone FROM schools WHERE is_active=1')
    .all() as School[];
  const schedules = db().prepare(
    `SELECT c.school_id,cs.id AS schedule_id,t.user_id AS teacher_user_id,ta.class_id,
       c.name AS class_name,s.name AS subject_name,sts.start_time,sts.end_time,
       ats.status AS attendance_status
     FROM class_schedules cs
     JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
     JOIN teachers t ON t.id=ta.teacher_id AND t.is_active=1
     JOIN classes c ON c.id=ta.class_id AND c.is_active=1
     JOIN subjects s ON s.id=ta.subject_id
     JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id AND sts.is_active=1 AND sts.is_break=0
     JOIN semesters sem ON sem.id=cs.semester_id
     JOIN academic_years ay ON ay.id=sem.academic_year_id AND ay.is_active=1
     LEFT JOIN student_attendance_sessions ats ON ats.class_schedule_id=cs.id AND ats.attendance_date=?
     WHERE c.school_id=? AND cs.archived_at IS NULL AND cs.weekday=?
       AND sem.start_date<=? AND sem.end_date>=?`,
  );

  for (const school of schools) {
    const local = localDateTime(now, school.timezone || 'Asia/Jakarta');
    const currentMinutes = minutes(local.time);
    for (const row of schedules.all(
      local.date,
      school.id,
      isoWeekday(local.date),
      local.date,
      local.date,
    ) as Schedule[]) {
      if (!row.teacher_user_id || regularScheduleBlock(school.id, row.class_id, local.date))
        continue;
      const startNoticeAt = minutes(row.start_time) - SCHEDULE_NOTICE_LEAD_MINUTES;
      if (
        currentMinutes >= startNoticeAt &&
        currentMinutes < startNoticeAt + DELIVERY_WINDOW_MINUTES
      ) {
        scheduleNotifications += queuePushNotification({
          recipientUserId: row.teacher_user_id,
          eventKey: `lesson-schedule:${school.id}:${row.schedule_id}:${local.date}`,
          type: 'lesson_schedule',
          title: 'Jadwal mengajar segera dimulai',
          body: `${row.subject_name} · ${row.class_name} dimulai pukul ${row.start_time.slice(0, 5)}.`,
          data: { schedule_id: row.schedule_id, date: local.date },
        });
      }
      const reminderAt = minutes(row.end_time) + ATTENDANCE_REMINDER_DELAY_MINUTES;
      if (
        row.attendance_status !== 'closed' &&
        currentMinutes >= reminderAt &&
        currentMinutes < reminderAt + DELIVERY_WINDOW_MINUTES
      ) {
        attendanceReminders += queuePushNotification({
          recipientUserId: row.teacher_user_id,
          eventKey: `attendance-reminder:${school.id}:${row.schedule_id}:${local.date}`,
          type: 'attendance_reminder',
          title: 'Presensi belum diisi',
          body: `Presensi ${row.subject_name} · ${row.class_name} pukul ${row.end_time.slice(0, 5)} belum ditutup.`,
          data: { schedule_id: row.schedule_id, date: local.date },
        });
      }
    }
  }
  return { scheduleNotifications, attendanceReminders };
}
