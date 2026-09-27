export type NotificationState = 'disabled' | 'no-recipient' | 'queued' | 'failed';

export type WhatsAppMessage = {
  phone: string;
  message: string;
};
