export type TahfidzSuggestion = {
  activity_type: 'new' | 'review';
  surah_number: number;
  ayah_from: number;
  ayah_to: number;
  reason: 'continuation' | 'repeat' | 'review' | 'surah_completed';
  source: {
    attendance_date: string;
    surah_number: number;
    ayah_from: number;
    ayah_to: number;
    result: 'fluent' | 'repeat';
  };
};
