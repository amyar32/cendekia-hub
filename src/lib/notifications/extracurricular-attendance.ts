import { db } from '@/lib/db';
import { studentExtracurricularAttendanceMessage } from '@/lib/notifications/templates';
import type { NotificationState } from '@/lib/notifications/types';
import { sendWhatsAppMessages } from '@/lib/notifications/whatsapp';

type ExtracurricularAttendanceStatus = 'present' | 'late' | 'sick' | 'excused' | 'absent';

export async function notifyPrimaryGuardiansOfExtracurricularAttendance(input: {
  sessionId: string;
  schoolName: string;
  extracurricularName: string;
  teacherName: string;
  date: string;
  time: string;
}): Promise<{ state: NotificationState; recipients: number }> {
  const records = db()
    .prepare(
      `SELECT ar.student_name,ar.status,g.phone
       FROM extracurricular_attendance_records ar
       JOIN guardians g ON g.student_id=ar.student_id AND g.is_primary=1
       WHERE ar.session_id=? AND g.phone<>''
       ORDER BY ar.student_name`,
    )
    .all(input.sessionId) as Array<{
    student_name: string;
    status: ExtracurricularAttendanceStatus;
    phone: string;
  }>;
  if (!records.length) return { state: 'no-recipient', recipients: 0 };
  const state = await sendWhatsAppMessages(
    records.map((record) => ({
      phone: record.phone,
      message: studentExtracurricularAttendanceMessage({
        schoolName: input.schoolName,
        extracurricularName: input.extracurricularName,
        teacherName: input.teacherName,
        studentName: record.student_name,
        date: input.date,
        time: input.time,
        status: record.status,
      }),
    })),
  );
  return { state, recipients: records.length };
}
