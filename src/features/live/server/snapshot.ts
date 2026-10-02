import { localDateTime } from '@/lib/checkins';
import { db } from '@/lib/db';
import { regularScheduleBlock } from '@/lib/exam-schedules';
import type {
  LiveActivity,
  LiveDisplaySnapshot,
  LivePerson,
  LiveSchedule,
} from '@/lib/live-display';
import { liveActivityLabels } from '@/lib/live-display';

type SchoolRow = {
  name: string;
  logo_url: string;
  timezone: string;
  schedule_bell_enabled: number;
  schedule_weekdays: string;
};

type SlotRow = {
  name: string;
  start_time: string;
  end_time: string;
  is_break: number;
};

type AttendanceRow = {
  total: number;
  present: number | null;
  late: number | null;
  absent: number | null;
};

function attendanceSummary(table: 'students' | 'teachers', schoolId: string, date: string) {
  const checkinTable = table === 'students' ? 'student_checkins' : 'teacher_checkins';
  const foreignKey = table === 'students' ? 'student_id' : 'teacher_id';
  const row = db()
    .prepare(
      `SELECT count(*) AS total,
        sum(CASE WHEN ci.status='present' THEN 1 ELSE 0 END) AS present,
        sum(CASE WHEN ci.status='late' THEN 1 ELSE 0 END) AS late,
        sum(CASE WHEN ci.status='absent' THEN 1 ELSE 0 END) AS absent
       FROM ${table} person
       LEFT JOIN ${checkinTable} ci ON ci.${foreignKey}=person.id AND ci.attendance_date=?
       WHERE person.school_id=? AND person.is_active=1`,
    )
    .get(date, schoolId) as AttendanceRow;
  const present = row.present || 0;
  const late = row.late || 0;
  const absent = row.absent || 0;
  return { total: row.total, present, late, absent, missing: row.total - present - late - absent };
}

function personStatus(status: string | null): LivePerson['status'] {
  return status === 'present' || status === 'late' || status === 'absent' ? status : 'missing';
}

export function liveDisplaySnapshot(schoolId: string, at = new Date()): LiveDisplaySnapshot {
  return db().transaction(() => {
    const school = db()
      .prepare(
        'SELECT name,logo_url,timezone,schedule_bell_enabled,schedule_weekdays FROM schools WHERE id=?',
      )
      .get(schoolId) as SchoolRow;
    const now = localDateTime(school.timezone, at);
    const phase = (start: string, end: string): LiveActivity['phase'] =>
      start <= now.time && now.time < end ? 'current' : start > now.time ? 'upcoming' : 'finished';
    const teacherRows = db()
      .prepare(
        `SELECT t.id,t.name,t.employee_code AS code,t.photo_url,'Guru' AS group_label,
        'teacher' AS person_type,tc.status,tc.checked_in_at
       FROM teachers t LEFT JOIN teacher_checkins tc ON tc.teacher_id=t.id AND tc.attendance_date=?
       WHERE t.school_id=? AND t.is_active=1 ORDER BY t.name`,
      )
      .all(now.date, schoolId) as Array<Omit<LivePerson, 'status'> & { status: string | null }>;
    const teacherById = new Map(
      teacherRows.map((t) => [t.id, { ...t, status: personStatus(t.status) }]),
    );
    const teachersFor = (id: string) => {
      const teacher = teacherById.get(id);
      return teacher ? [teacher] : [];
    };

    const academic = db()
      .prepare(
        `SELECT ay.name AS year,COALESCE(s.name,'Belum ada semester aktif') AS semester
         FROM academic_years ay LEFT JOIN semesters s ON s.academic_year_id=ay.id AND s.is_active=1
         WHERE ay.school_id=? AND ay.is_active=1 LIMIT 1`,
      )
      .get(schoolId) as { year: string; semester: string } | undefined;
    const activeSemester = db()
      .prepare(
        `SELECT s.id FROM semesters s JOIN academic_years ay ON ay.id=s.academic_year_id
         WHERE ay.school_id=? AND ay.is_active=1 AND s.is_active=1
           AND ? BETWEEN s.start_date AND s.end_date AND ? BETWEEN ay.start_date AND ay.end_date LIMIT 1`,
      )
      .get(schoolId, now.date, now.date) as { id: string } | undefined;

    const slots = db()
      .prepare(
        `SELECT name,start_time,end_time,is_break FROM schedule_time_slots
         WHERE school_id=? AND is_active=1 AND EXISTS (
           SELECT 1 FROM json_each(?) WHERE value=?
         ) ORDER BY start_time,slot_order`,
      )
      .all(schoolId, school.schedule_weekdays, now.weekday) as SlotRow[];
    const currentSlot = slots.find(
      (slot) => slot.start_time <= now.time && now.time < slot.end_time,
    );
    const nextSlot = slots.find((slot) => slot.start_time > now.time);

    const rawSchedules = activeSemester
      ? (db()
          .prepare(
            `SELECT cs.id,c.id AS class_id,c.name AS class_name,s.name AS subject_name,s.code AS subject_code,
              t.id AS teacher_id,t.name AS teacher_name,t.photo_url AS teacher_photo_url,
              sts.name AS slot_name,sts.start_time,sts.end_time,
              tc.status AS teacher_status,tc.checked_in_at AS teacher_checked_in_at
             FROM class_schedules cs
             JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
             JOIN classes c ON c.id=ta.class_id
             JOIN subjects s ON s.id=ta.subject_id
             JOIN teachers t ON t.id=ta.teacher_id
             JOIN schedule_time_slots sts ON sts.id=cs.time_slot_id
             LEFT JOIN teacher_checkins tc ON tc.teacher_id=t.id AND tc.attendance_date=?
             WHERE cs.semester_id=? AND cs.weekday=? AND cs.archived_at IS NULL
               AND t.school_id=? AND t.is_active=1 AND sts.is_active=1 AND c.is_active=1
             ORDER BY sts.start_time,c.name,s.name`,
          )
          .all(now.date, activeSemester.id, now.weekday, schoolId) as Array<
          Omit<LiveSchedule, 'phase' | 'teacher_status'> & {
            class_id: string;
            teacher_status: string | null;
          }
        >)
      : [];
    const blockedClasses = new Map<string, boolean>();
    const availableSchedules = rawSchedules.filter((schedule) => {
      if (!blockedClasses.has(schedule.class_id))
        blockedClasses.set(
          schedule.class_id,
          Boolean(regularScheduleBlock(schoolId, schedule.class_id, now.date)),
        );
      return !blockedClasses.get(schedule.class_id);
    });
    const suspendedLessons = rawSchedules.length - availableSchedules.length;
    const daySchedules: LiveSchedule[] = availableSchedules.map((schedule) => ({
      ...schedule,
      teacher_status: personStatus(schedule.teacher_status),
      phase: phase(schedule.start_time, schedule.end_time),
    }));

    const lessonSessions = new Map(
      (
        db()
          .prepare(
            'SELECT class_schedule_id,status FROM student_attendance_sessions WHERE school_id=? AND attendance_date=?',
          )
          .all(schoolId, now.date) as Array<{
          class_schedule_id: string;
          status: 'open' | 'closed';
        }>
      ).map((s) => [s.class_schedule_id, s.status]),
    );
    const activities: LiveActivity[] = daySchedules.map((s) => ({
      id: `lesson:${s.id}`,
      kind: 'lesson',
      title: s.subject_name,
      group_label: s.class_name,
      location: '',
      start_time: s.start_time,
      end_time: s.end_time,
      phase: s.phase,
      teachers: teachersFor(s.teacher_id),
      session_status: lessonSessions.get(s.id) || 'not_started',
    }));
    const programs = db()
      .prepare(
        `SELECT 'tahfidz' AS kind,tg.id,tg.name AS title,tg.name AS group_label,tg.location,
        tg.teacher_id,sts.start_time,sts.end_time,ts.status AS session_status
       FROM tahfidz_groups tg JOIN academic_years ay ON ay.id=tg.academic_year_id
       LEFT JOIN semesters sem ON sem.id=tg.semester_id
       JOIN schedule_time_slots sts ON sts.id=tg.time_slot_id
       LEFT JOIN tahfidz_sessions ts ON ts.group_id=tg.id AND ts.attendance_date=@date
       WHERE tg.school_id=@school AND tg.status='active' AND ay.is_active=1
         AND @date BETWEEN ay.start_date AND ay.end_date AND sts.is_active=1
         AND EXISTS (SELECT 1 FROM json_each(tg.weekdays) WHERE value=@weekday)
         AND (tg.semester_id IS NULL OR @date BETWEEN sem.start_date AND sem.end_date)
       UNION ALL
       SELECT 'extracurricular',es.id,e.name,e.name,ea.location,ea.teacher_id,
         sts.start_time,sts.end_time,ats.status
       FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
       JOIN extracurriculars e ON e.id=ea.extracurricular_id
       JOIN semesters sem ON sem.id=es.semester_id JOIN academic_years ay ON ay.id=sem.academic_year_id
       JOIN schedule_time_slots sts ON sts.id=es.time_slot_id
       LEFT JOIN extracurricular_attendance_sessions ats ON ats.extracurricular_schedule_id=es.id AND ats.attendance_date=@date
       WHERE e.school_id=@school AND e.is_active=1 AND ea.status='active' AND ay.is_active=1
         AND es.weekday=@weekday AND sts.is_active=1
         AND @date BETWEEN sem.start_date AND sem.end_date AND @date BETWEEN ay.start_date AND ay.end_date`,
      )
      .all({ date: now.date, school: schoolId, weekday: now.weekday }) as Array<{
      kind: 'tahfidz' | 'extracurricular';
      id: string;
      title: string;
      group_label: string;
      location: string;
      teacher_id: string;
      start_time: string;
      end_time: string;
      session_status: 'open' | 'closed' | null;
    }>;
    for (const p of programs) {
      const teachers = teachersFor(p.teacher_id);
      if (!teachers.length) continue;
      activities.push({
        ...p,
        id: `${p.kind}:${p.id}`,
        teachers,
        phase: phase(p.start_time, p.end_time),
        session_status: p.session_status || 'not_started',
      });
    }
    const exams = db()
      .prepare(
        `SELECT ee.id,ee.subject_name AS title,ep.name AS group_label,ee.room_name AS location,
        es.start_time,es.end_time,
        COALESCE((SELECT group_concat(ec.class_name, ', ') FROM exam_schedule_classes ec WHERE ec.exam_schedule_entry_id=ee.id),'') AS classes
       FROM exam_schedule_entries ee JOIN exam_sessions es ON es.id=ee.exam_session_id
       JOIN exam_periods ep ON ep.id=ee.exam_period_id
       JOIN academic_years ay ON ay.id=ep.academic_year_id
       WHERE ep.school_id=? AND ep.status='published' AND ay.is_active=1 AND es.exam_date=?
         AND ? BETWEEN ep.start_date AND ep.end_date AND ? BETWEEN ay.start_date AND ay.end_date`,
      )
      .all(schoolId, now.date, now.date, now.date) as Array<{
      id: string;
      title: string;
      group_label: string;
      location: string;
      start_time: string;
      end_time: string;
      classes: string;
    }>;
    const supervisors = db()
      .prepare(
        `SELECT sup.exam_schedule_entry_id,sup.teacher_id FROM exam_supervisors sup
       JOIN exam_schedule_entries ee ON ee.id=sup.exam_schedule_entry_id
       JOIN exam_periods ep ON ep.id=ee.exam_period_id
       JOIN exam_sessions es ON es.id=ee.exam_session_id
       WHERE ep.school_id=? AND ep.status='published' AND es.exam_date=?`,
      )
      .all(schoolId, now.date) as Array<{ exam_schedule_entry_id: string; teacher_id: string }>;
    for (const exam of exams)
      activities.push({
        ...exam,
        id: `exam:${exam.id}`,
        kind: 'exam',
        group_label: [exam.group_label, exam.classes].filter(Boolean).join(' · '),
        phase: phase(exam.start_time, exam.end_time),
        session_status: null,
        teachers: supervisors
          .filter((s) => s.exam_schedule_entry_id === exam.id)
          .flatMap((s) => teachersFor(s.teacher_id)),
      });
    activities.sort(
      (a, b) =>
        a.start_time.localeCompare(b.start_time) ||
        a.title.localeCompare(b.title, 'id', { numeric: true }),
    );
    const scheduledTeachers = new Map(activities.flatMap((a) => a.teachers).map((t) => [t.id, t]));

    const recentCheckins = db()
      .prepare(
        `SELECT * FROM (
          SELECT sc.id,s.name,s.nis AS code,s.photo_url,COALESCE(c.name,'Belum ada rombel') AS group_label,
            'student' AS person_type,sc.status,sc.checked_in_at
          FROM student_checkins sc JOIN students s ON s.id=sc.student_id
          LEFT JOIN classes c ON c.id=(
            SELECT cm.class_id FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
            WHERE cm.student_id=s.id AND cm.status='active' AND ay.is_active=1
              AND cm.start_date<=@date AND (cm.end_date IS NULL OR cm.end_date>=@date)
            ORDER BY cm.start_date DESC,cm.id LIMIT 1
          )
          WHERE sc.school_id=@school AND sc.attendance_date=@date AND sc.status<>'absent' AND s.is_active=1
          UNION ALL
          SELECT tc.id,t.name,t.employee_code AS code,t.photo_url,'Guru' AS group_label,
            'teacher' AS person_type,tc.status,tc.checked_in_at
          FROM teacher_checkins tc JOIN teachers t ON t.id=tc.teacher_id
          WHERE tc.school_id=@school AND tc.attendance_date=@date AND tc.status<>'absent' AND t.is_active=1
            AND t.id IN (SELECT value FROM json_each(@teachers))
        ) ORDER BY julianday(checked_in_at) DESC LIMIT 12`,
      )
      .all({
        school: schoolId,
        date: now.date,
        teachers: JSON.stringify([...scheduledTeachers.keys()]),
      }) as LivePerson[];

    const missingStudents = db()
      .prepare(
        `SELECT s.id,s.name,s.nis AS code,s.photo_url,COALESCE(c.name,'Belum ada rombel') AS group_label,
          'student' AS person_type,'missing' AS status,NULL AS checked_in_at
         FROM students s
         LEFT JOIN classes c ON c.id=(
            SELECT cm.class_id FROM class_memberships cm JOIN academic_years ay ON ay.id=cm.academic_year_id
            WHERE cm.student_id=s.id AND cm.status='active' AND ay.is_active=1
              AND cm.start_date<=@date AND (cm.end_date IS NULL OR cm.end_date>=@date)
            ORDER BY cm.start_date DESC,cm.id LIMIT 1
          )
         WHERE s.school_id=@school AND s.is_active=1 AND NOT EXISTS (
           SELECT 1 FROM student_checkins sc WHERE sc.student_id=s.id AND sc.attendance_date=@date
         ) ORDER BY c.name,s.name`,
      )
      .all({ school: schoolId, date: now.date }) as LivePerson[];
    const neededNow = new Set(
      activities.filter((a) => a.phase === 'current').flatMap((a) => a.teachers.map((t) => t.id)),
    );
    const missingTeachers = [...scheduledTeachers.values()]
      .filter((t) => t.status === 'missing')
      .sort(
        (a, b) =>
          Number(neededNow.has(b.id)) - Number(neededNow.has(a.id)) ||
          a.name.localeCompare(b.name, 'id'),
      );

    const attendance = {
      students: attendanceSummary('students', schoolId, now.date),
      teachers: {
        total: scheduledTeachers.size,
        present: [...scheduledTeachers.values()].filter((t) => t.status === 'present').length,
        late: [...scheduledTeachers.values()].filter((t) => t.status === 'late').length,
        absent: [...scheduledTeachers.values()].filter((t) => t.status === 'absent').length,
        missing: [...scheduledTeachers.values()].filter((t) => t.status === 'missing').length,
      },
    };
    const currentSchedules = daySchedules.filter((schedule) => schedule.phase === 'current');
    const teachersNeededNow = [...scheduledTeachers.values()].filter(
      (t) => neededNow.has(t.id) && (t.status === 'missing' || t.status === 'absent'),
    );
    const notices: LiveDisplaySnapshot['notices'] = [];
    if (teachersNeededNow.length)
      notices.push({
        tone: 'danger',
        title: `${teachersNeededNow.length} guru terjadwal belum hadir`,
        detail: teachersNeededNow
          .slice(0, 3)
          .map((item) => item.name)
          .join(' • '),
      });
    if (attendance.students.late)
      notices.push({
        tone: 'warning',
        title: `${attendance.students.late} murid datang terlambat`,
        detail: 'Data keterlambatan tercatat pada check-in hari ini.',
      });
    if (!activeSemester)
      notices.push({
        tone: 'info',
        title: 'Tidak ada semester aktif yang berlaku hari ini',
        detail: 'Periksa status dan rentang tanggal semester untuk jadwal pelajaran.',
      });
    if (suspendedLessons)
      notices.push({
        tone: 'info',
        title: `${suspendedLessons} jadwal pelajaran ditangguhkan`,
        detail: 'Mengikuti kebijakan periode ujian yang sudah dipublikasikan.',
      });
    const pendingSessions = activities.filter(
      (a) =>
        a.phase !== 'upcoming' &&
        (a.session_status === 'not_started' || a.session_status === 'open'),
    );
    if (pendingSessions.length)
      notices.push({
        tone: 'warning',
        title: `${pendingSessions.length} sesi absensi belum selesai`,
        detail:
          'Pelajaran, tahfidz, atau ekstrakurikuler yang sudah mulai masih perlu diselesaikan.',
      });
    const examsWithoutSupervisors = activities.filter(
      (a) => a.kind === 'exam' && a.phase !== 'finished' && !a.teachers.length,
    );
    if (examsWithoutSupervisors.length)
      notices.push({
        tone: 'danger',
        title: `${examsWithoutSupervisors.length} ruang ujian tanpa pengawas aktif`,
        detail: 'Periksa penugasan pengawas pada jadwal ujian.',
      });
    if (!notices.length)
      notices.push({
        tone: 'info',
        title: 'Operasional sekolah berjalan normal',
        detail: 'Tidak ada perhatian mendesak pada data terbaru.',
      });

    const noticePriority = { danger: 0, warning: 1, info: 2 };
    notices.sort((a, b) => noticePriority[a.tone] - noticePriority[b.tone]);
    const snapshot: LiveDisplaySnapshot = {
      generated_at: at.toISOString(),
      date: now.date,
      local_time: now.time,
      weekday: now.weekday,
      school: {
        name: school.name,
        logo_url: school.logo_url,
        timezone: school.timezone,
        bell_enabled: Boolean(school.schedule_bell_enabled),
      },
      academic: academic || { year: 'Belum ada tahun aktif', semester: '—' },
      bell: {
        current_slot: currentSlot
          ? { ...currentSlot, is_break: Boolean(currentSlot.is_break) }
          : null,
        next_slot: nextSlot ? { ...nextSlot, is_break: Boolean(nextSlot.is_break) } : null,
      },
      attendance,
      current_schedules: currentSchedules,
      day_schedules: daySchedules,
      activities,
      suspended_lessons: suspendedLessons,
      recent_checkins: recentCheckins,
      missing_students: missingStudents,
      missing_teachers: missingTeachers,
      notices,
      ticker: [
        `${attendance.students.present + attendance.students.late} dari ${attendance.students.total} murid telah check-in`,
        `${attendance.teachers.present + attendance.teachers.late} dari ${attendance.teachers.total} guru terjadwal telah check-in`,
        currentSlot
          ? `${currentSlot.name} berlangsung hingga ${currentSlot.end_time}`
          : nextSlot
            ? `${nextSlot.name} dimulai pukul ${nextSlot.start_time}`
            : 'Tidak ada slot bel berikutnya hari ini',
        ...(['exam', 'tahfidz', 'extracurricular'] as const).map(
          (kind) =>
            `${liveActivityLabels[kind]}: ${activities.filter((a) => a.kind === kind && a.phase === 'current').length} berlangsung · ${activities.filter((a) => a.kind === kind && a.phase === 'upcoming').length} berikutnya`,
        ),
        ...(suspendedLessons
          ? [`${suspendedLessons} jadwal pelajaran ditangguhkan mengikuti periode ujian`]
          : []),
      ],
    };
    return snapshot;
  })();
}
