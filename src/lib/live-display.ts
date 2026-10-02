export type LivePerson = {
  id: string;
  name: string;
  code: string;
  photo_url: string;
  group_label: string;
  person_type: 'student' | 'teacher';
  status: 'present' | 'late' | 'absent' | 'missing';
  checked_in_at: string | null;
};

export type LiveSchedule = {
  id: string;
  class_name: string;
  subject_name: string;
  subject_code: string;
  teacher_id: string;
  teacher_name: string;
  teacher_photo_url: string;
  start_time: string;
  end_time: string;
  slot_name: string;
  teacher_status: 'present' | 'late' | 'absent' | 'missing';
  teacher_checked_in_at: string | null;
  phase: 'current' | 'upcoming' | 'finished';
};

export type LiveActivityKind = 'lesson' | 'exam' | 'tahfidz' | 'extracurricular';
export type LiveActivity = {
  id: string;
  kind: LiveActivityKind;
  title: string;
  group_label: string;
  location: string;
  start_time: string;
  end_time: string;
  phase: LiveSchedule['phase'];
  teachers: LivePerson[];
  session_status: 'not_started' | 'open' | 'closed' | null;
};

export const liveActivityLabels: Record<LiveActivityKind, string> = {
  lesson: 'Pelajaran',
  exam: 'Ujian',
  tahfidz: 'Tahfidz',
  extracurricular: 'Ekstrakurikuler',
};

export type LiveDisplaySnapshot = {
  generated_at: string;
  date: string;
  local_time: string;
  weekday: number;
  school: {
    name: string;
    logo_url: string;
    timezone: string;
    bell_enabled: boolean;
  };
  academic: { year: string; semester: string };
  bell: {
    current_slot: { name: string; start_time: string; end_time: string; is_break: boolean } | null;
    next_slot: { name: string; start_time: string; end_time: string; is_break: boolean } | null;
  };
  attendance: {
    students: { total: number; present: number; late: number; absent: number; missing: number };
    teachers: { total: number; present: number; late: number; absent: number; missing: number };
  };
  current_schedules: LiveSchedule[];
  day_schedules: LiveSchedule[];
  activities: LiveActivity[];
  suspended_lessons: number;
  recent_checkins: LivePerson[];
  missing_students: LivePerson[];
  missing_teachers: LivePerson[];
  notices: Array<{ tone: 'danger' | 'warning' | 'info'; title: string; detail: string }>;
  ticker: string[];
};

export const LIVE_PAGE_DURATION = 12_000;
export const LIVE_ACTIVITY_PAGE_SIZE = 6;

export function livePage<T>(rows: T[], page: number, size: number): T[] {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const start = (page % pages) * size;
  return rows.slice(start, start + size);
}

export function liveScenePageCounts(data: LiveDisplaySnapshot) {
  const pages = (count: number, size: number) => Math.ceil(count / size);
  return [
    Math.max(
      1,
      pages(data.current_schedules.length, 5),
      pages(data.notices.length, 3),
      pages(data.recent_checkins.length, 3),
    ),
    Math.max(
      1,
      pages(data.recent_checkins.length, 6),
      pages(data.missing_students.length, 6),
      pages(data.missing_teachers.length, 6),
    ),
    Math.max(1, pages(data.day_schedules.filter((s) => s.phase === 'upcoming').length, 6)),
    Math.max(
      1,
      pages(
        data.activities.filter((activity) => activity.kind !== 'tahfidz').length,
        LIVE_ACTIVITY_PAGE_SIZE,
      ),
    ),
    Math.max(
      1,
      pages(data.activities.filter((activity) => activity.kind === 'tahfidz').length, 12),
    ),
  ];
}

export type LiveFrame = { scene: number; pages: number[]; step: number };

// Resume long lists next cycle; halaqah gets three pages to cover 25–36 groups at once.
export function nextLiveFrame(frame: LiveFrame, pageCount: number): LiveFrame {
  const pages = [...frame.pages];
  pages[frame.scene] = (pages[frame.scene] + 1) % Math.max(1, pageCount);
  const rotate = frame.step + 1 >= Math.min(frame.scene === 4 ? 3 : 2, Math.max(1, pageCount));
  return {
    scene: rotate ? (frame.scene + 1) % pages.length : frame.scene,
    pages,
    step: rotate ? 0 : frame.step + 1,
  };
}

// Mix the different modules so large lesson lists do not hide exams or school programs.
export function liveActivityOrder(activities: LiveActivity[]): LiveActivity[] {
  const priority = { current: 0, upcoming: 1, finished: 2 };
  const groups = Object.keys(liveActivityLabels).map((kind) =>
    activities
      .filter((a) => a.kind === kind)
      .sort(
        (a, b) =>
          priority[a.phase] - priority[b.phase] ||
          (a.phase === 'finished'
            ? b.start_time.localeCompare(a.start_time)
            : a.start_time.localeCompare(b.start_time)) ||
          a.title.localeCompare(b.title, 'id', { numeric: true }),
      ),
  );
  const result: LiveActivity[] = [];
  for (let index = 0; groups.some((group) => index < group.length); index++)
    for (const group of groups) if (group[index]) result.push(group[index]);
  return result;
}
