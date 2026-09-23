import { z } from 'zod';
import { schoolLocalDate } from '@/app/api/modules/_shared/academic-context';
import { db } from '@/lib/db';
import { MobileApiError, mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid.');

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const actor = requireMobileTeacher(request);
    const url = new URL(request.url);
    const today = schoolLocalDate(actor.school_id);
    const from = dateSchema.parse(url.searchParams.get('from') || daysBefore(today, 29));
    const to = dateSchema.parse(url.searchParams.get('to') || today);
    if (from > to)
      throw new MobileApiError(400, 'INVALID_DATE_RANGE', 'Rentang tanggal tidak valid.');
    const rows = db()
      .prepare(
        `SELECT id,attendance_date,checked_in_at,status,source,note,updated_at
         FROM teacher_checkins WHERE teacher_id=? AND school_id=? AND attendance_date BETWEEN ? AND ?
         ORDER BY attendance_date DESC,checked_in_at DESC LIMIT 100`,
      )
      .all(actor.teacher_id, actor.school_id, from, to);
    return mobileData({ from, to, check_ins: rows });
  } catch (error) {
    return mobileFailure(error);
  }
}
