import type { TahfidzHistoryRecord } from './history-types';

export type TahfidzRecapFilters = {
  date_from: string;
  date_to: string;
  group_id: string;
  student_id: string;
  session_status: 'closed' | 'open' | 'all';
};
export type TahfidzRecapCounts = {
  total: number;
  present: number;
  late: number;
  sick: number;
  excused: number;
  absent: number;
  new_count: number;
  review_count: number;
  fluent: number;
  repeat: number;
  not_assessed: number;
  not_submitted: number;
};
export type TahfidzRecapRow = TahfidzRecapCounts & {
  student_id: string;
  student_name: string;
  student_nis: string;
  attendance_rate: number;
};
export type TahfidzRecap = {
  school_name: string;
  filters: TahfidzRecapFilters;
  options: {
    groups: { value: string; label: string }[];
    students: { value: string; label: string }[];
  };
  summary: TahfidzRecapCounts & { sessions: number; students: number; open_sessions: number };
  rows: TahfidzRecapRow[];
  total: number;
  page: number;
  page_size: number;
  records?: (TahfidzHistoryRecord & { student_name: string; student_nis: string })[];
};
