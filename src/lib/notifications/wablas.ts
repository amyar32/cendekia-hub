import { toIndonesianWhatsAppNumber } from '@/lib/notifications/phone';
import type { NotificationState, WhatsAppMessage } from '@/lib/notifications/types';

function config() {
  const token = process.env.WABLAS_API_TOKEN?.trim();
  const secretKey = process.env.WABLAS_SECRET_KEY?.trim();
  const url = process.env.WABLAS_API_URL?.trim();
  return token && secretKey && url ? { token, secretKey, url } : null;
}

const WABLAS_BATCH_SIZE = 100;

/** Delivers WhatsApp texts through Wablas. Provider failures never throw to callers. */
export async function sendWithWablasMessages(
  inputs: WhatsAppMessage[],
): Promise<NotificationState> {
  const credentials = config();
  if (!credentials) return 'disabled';

  const data = inputs.flatMap((input) => {
    const phone = toIndonesianWhatsAppNumber(input.phone);
    return phone ? [{ phone, message: input.message, isGroup: 'false', flag: 'instant' }] : [];
  });
  if (!data.length) return 'no-recipient';

  try {
    for (let start = 0; start < data.length; start += WABLAS_BATCH_SIZE) {
      const response = await fetch(credentials.url, {
        method: 'POST',
        headers: {
          Authorization: `${credentials.token}.${credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: data.slice(start, start + WABLAS_BATCH_SIZE) }),
        signal: AbortSignal.timeout(8_000),
      });
      const body = (await response.json().catch(() => null)) as { status?: boolean } | null;
      if (!response.ok || body?.status !== true) {
        console.error('Wablas tidak dapat menerima notifikasi.', { status: response.status });
        return 'failed';
      }
    }
    return 'queued';
  } catch (error) {
    console.error(
      'Pengiriman notifikasi Wablas gagal.',
      error instanceof Error ? error.name : error,
    );
    return 'failed';
  }
}

export function sendWithWablas(input: WhatsAppMessage): Promise<NotificationState> {
  return sendWithWablasMessages([input]);
}
