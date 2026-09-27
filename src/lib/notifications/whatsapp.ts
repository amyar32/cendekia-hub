import type { NotificationState, WhatsAppMessage } from '@/lib/notifications/types';
import { sendWithWablas, sendWithWablasMessages } from '@/lib/notifications/wablas';

/**
 * Single entry point for WhatsApp delivery. Add another provider here later
 * without changing attendance, admission, or other business modules.
 */
export function sendWhatsAppMessage(input: WhatsAppMessage): Promise<NotificationState> {
  return sendWithWablas(input);
}

export function sendWhatsAppMessages(inputs: WhatsAppMessage[]): Promise<NotificationState> {
  return sendWithWablasMessages(inputs);
}
