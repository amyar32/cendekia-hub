import type { NotificationState, WhatsAppMessage } from '@/lib/notifications/types';
import { sendWithWablas } from '@/lib/notifications/wablas';

/**
 * Single entry point for WhatsApp delivery. Add another provider here later
 * without changing attendance, admission, or other business modules.
 */
export function sendWhatsAppMessage(input: WhatsAppMessage): Promise<NotificationState> {
  return sendWithWablas(input);
}
