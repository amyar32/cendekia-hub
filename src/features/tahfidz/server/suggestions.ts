import { db } from '@/lib/db';
import type { TahfidzSuggestion } from '../suggestion-types';
import { quranVerseCounts } from './quran-verse-counts';

type PreviousSubmission = {
  attendance_date: string;
  activity_type: 'new' | 'review';
  surah_number: number;
  ayah_from: number;
  ayah_to: number;
  result: 'fluent' | 'repeat';
};

export function suggestSubmission(previous: PreviousSubmission): TahfidzSuggestion | null {
  const count = quranVerseCounts[previous.surah_number - 1];
  if (
    !count ||
    !Number.isInteger(previous.surah_number) ||
    !Number.isInteger(previous.ayah_from) ||
    !Number.isInteger(previous.ayah_to) ||
    previous.ayah_from < 1 ||
    previous.ayah_to < previous.ayah_from ||
    previous.ayah_to > count
  )
    return null;
  const continuation =
    previous.result === 'fluent' && previous.activity_type === 'new' && previous.ayah_to < count;
  return {
    activity_type: continuation ? 'new' : 'review',
    surah_number: previous.surah_number,
    ayah_from: continuation ? previous.ayah_to + 1 : previous.ayah_from,
    ayah_to: continuation
      ? Math.min(count, previous.ayah_to + (previous.ayah_to - previous.ayah_from + 1))
      : previous.ayah_to,
    reason:
      previous.result === 'repeat'
        ? 'repeat'
        : continuation
          ? 'continuation'
          : previous.activity_type === 'new' && previous.ayah_to === count
            ? 'surah_completed'
            : 'review',
    source: {
      attendance_date: previous.attendance_date,
      surah_number: previous.surah_number,
      ayah_from: previous.ayah_from,
      ayah_to: previous.ayah_to,
      result: previous.result,
    },
  };
}

export function tahfidzSuggestions(schoolId: string, teacherId: string, sessionId: string) {
  const previous = db()
    .prepare(
      `
    SELECT current.id record_id,previous.activity_type,previous.surah_number,
      previous.ayah_from,previous.ayah_to,previous.result,source.attendance_date
    FROM tahfidz_session_records current
    JOIN tahfidz_sessions target ON target.id=current.session_id
    JOIN tahfidz_session_records previous ON previous.id=(
      SELECT r.id FROM tahfidz_session_records r JOIN tahfidz_sessions ts ON ts.id=r.session_id
      WHERE r.student_id=current.student_id AND ts.school_id=target.school_id AND ts.teacher_id=target.teacher_id
        AND ts.status='closed' AND ts.attendance_date<target.attendance_date
        AND r.status IN ('present','late') AND r.activity_type IN ('new','review')
        AND r.result IN ('fluent','repeat') AND r.surah_number IS NOT NULL
        AND r.ayah_from IS NOT NULL AND r.ayah_to IS NOT NULL
      ORDER BY ts.attendance_date DESC,ts.starts_at DESC,ts.id DESC,r.id DESC LIMIT 1
    )
    JOIN tahfidz_sessions source ON source.id=previous.session_id
    WHERE target.id=? AND target.school_id=? AND target.teacher_id=? AND target.status='open'
  `,
    )
    .all(sessionId, schoolId, teacherId) as (PreviousSubmission & { record_id: string })[];
  const suggestions: Record<string, TahfidzSuggestion> = {};
  for (const row of previous) {
    const suggestion = suggestSubmission(row);
    if (suggestion) suggestions[row.record_id] = suggestion;
  }
  return suggestions;
}
