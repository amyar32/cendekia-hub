export type TahfidzHistoryRecord = {
  id: string;
  student_id: string;
  class_name: string;
  status: 'present' | 'late' | 'sick' | 'excused' | 'absent';
  activity_type: 'none' | 'new' | 'review';
  surah_number: number | null;
  surah_name: string | null;
  ayah_from: number | null;
  ayah_to: number | null;
  result: 'not_assessed' | 'fluent' | 'repeat' | 'not_submitted';
  note: string;
  attendance_date: string;
  group_name: string;
  teacher_name: string;
  session_status: 'open' | 'closed';
};
export type TahfidzHistory = {
  students: { id: string; name: string; nis: string }[];
  student: { id: string; name: string; nis: string } | null;
  records: TahfidzHistoryRecord[];
  total: number;
  page: number;
  page_size: number;
};
export const historyStatuses = {
  present: 'Hadir',
  late: 'Telat',
  sick: 'Sakit',
  excused: 'Izin',
  absent: 'Alpa',
};
export const historyActivities = { none: 'Belum setor', new: 'Hafalan baru', review: 'Murajaah' };
export const historyResults = {
  not_assessed: 'Belum dinilai',
  fluent: 'Lancar',
  repeat: 'Ulang',
  not_submitted: 'Belum setor',
};
