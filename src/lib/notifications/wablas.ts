import { toIndonesianWhatsAppNumber } from '@/lib/notifications/phone';
import type { NotificationState, WhatsAppMessage } from '@/lib/notifications/types';

function config() {
  const token = process.env.WABLAS_API_TOKEN?.trim();
  const secretKey = process.env.WABLAS_SECRET_KEY?.trim();
  const url = process.env.WABLAS_API_URL?.trim();
  return token && secretKey && url ? { token, secretKey, url } : null;
}

/** Delivers a single WhatsApp text through Wablas. Provider failures never throw to callers. */
export async function sendWithWablas(input: WhatsAppMessage): Promise<NotificationState> {
  const credentials = config();
  if (!credentials) return 'disabled';

  const phone = toIndonesianWhatsAppNumber(input.phone);
  if (!phone) return 'no-recipient';

  try {
    const response = await fetch(credentials.url, {
      method: 'POST',
      headers: {
        Authorization: `${credentials.token}.${credentials.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{ phone, message: input.message, isGroup: 'false', flag: 'instant' }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json().catch(() => null)) as { status?: boolean } | null;
    if (!response.ok || body?.status !== true) {
      console.error('Wablas tidak dapat menerima notifikasi.', { status: response.status });
      return 'failed';
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
