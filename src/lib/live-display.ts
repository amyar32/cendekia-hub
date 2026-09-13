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
  recent_checkins: LivePerson[];
  missing_students: LivePerson[];
  missing_teachers: LivePerson[];
  notices: Array<{ tone: 'danger' | 'warning' | 'info'; title: string; detail: string }>;
  ticker: string[];
};
