import { db } from '@/lib/db';
import {
  studentCheckinMessage,
  type StudentCheckinTemplateData,
} from '@/lib/notifications/templates';
import type { NotificationState } from '@/lib/notifications/types';
import { sendWhatsAppMessage } from '@/lib/notifications/whatsapp';

export type StudentCheckinNotification = StudentCheckinTemplateData & {
  studentId: string;
};

/** Notifies only the student's designated primary guardian. */
export async function notifyPrimaryGuardianOfStudentCheckin(
  input: StudentCheckinNotification,
): Promise<NotificationState> {
  const guardian = db()
    .prepare('SELECT phone FROM guardians WHERE student_id=? AND is_primary=1')
    .get(input.studentId) as { phone: string } | undefined;
  if (!guardian?.phone.trim()) return 'no-recipient';

  return sendWhatsAppMessage({
    phone: guardian.phone,
    message: studentCheckinMessage(input),
  });
}
