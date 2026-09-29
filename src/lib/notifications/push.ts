import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { MobileTeacherActor } from '@/lib/mobile-api';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 5;

export const pushTokenSchema = z
  .object({
    token: z
      .string()
      .trim()
      .max(512)
      .regex(/^Expo(?:nent)?PushToken\[[^\]]+\]$/, 'Token push Expo tidak valid.'),
    platform: z.enum(['android', 'ios']),
  })
  .strict();

type OutboxRow = {
  id: string;
  token_id: string;
  expo_push_token: string;
  title: string;
  body: string;
  data_json: string;
  attempts: number;
};

export function registerPushToken(actor: MobileTeacherActor, input: unknown) {
  const data = pushTokenSchema.parse(input);
  return db().transaction(() => {
    db()
      .prepare(
        `UPDATE mobile_push_tokens SET active=0
         WHERE mobile_session_id=? AND expo_push_token<>?`,
      )
      .run(actor.session_id, data.token);
    const previous = db()
      .prepare(
        `SELECT id,user_id,mobile_session_id
         FROM mobile_push_tokens WHERE expo_push_token=?`,
      )
      .get(data.token) as { id: string; user_id: string; mobile_session_id: string } | undefined;
    const id = previous?.id ?? randomUUID();
    const sameOwner =
      previous?.user_id === actor.user_id && previous.mobile_session_id === actor.session_id;
    if (previous && !sameOwner)
      db()
        .prepare(
          `UPDATE push_notification_outbox
           SET status='failed',attempts=?,processing_at=NULL,last_error='Token didaftarkan ulang.'
           WHERE token_id=? AND status<>'sent'`,
        )
        .run(MAX_ATTEMPTS, id);
    if (sameOwner)
      db()
        .prepare(
          `UPDATE push_notification_outbox
           SET status='pending',attempts=0,available_at=?,processing_at=NULL,last_error=''
           WHERE token_id=? AND status='failed' AND last_error='Token didaftarkan ulang.'`,
        )
        .run(Date.now(), id);
    db()
      .prepare(
        `INSERT INTO mobile_push_tokens(
           id,user_id,mobile_session_id,expo_push_token,platform,active,last_seen_at
         ) VALUES (?,?,?,?,?,1,datetime('now'))
         ON CONFLICT(expo_push_token) DO UPDATE SET
           user_id=excluded.user_id,
           mobile_session_id=excluded.mobile_session_id,
           platform=excluded.platform,
           active=1,
           last_seen_at=datetime('now')`,
      )
      .run(id, actor.user_id, actor.session_id, data.token, data.platform);
    return { registered: true };
  })();
}

export function deactivateSessionPushTokens(sessionId: string) {
  db()
    .prepare('UPDATE mobile_push_tokens SET active=0 WHERE mobile_session_id=? AND active=1')
    .run(sessionId);
}

export function queuePushNotification(input: {
  recipientUserId: string | null | undefined;
  eventKey: string;
  type: 'point_entry' | 'coaching_case' | 'lesson_schedule' | 'attendance_reminder';
  title: string;
  body: string;
  data: Record<string, string>;
  excludeUserId?: string;
}) {
  if (!input.recipientUserId || input.recipientUserId === input.excludeUserId) return 0;
  const tokens = db()
    .prepare('SELECT id FROM mobile_push_tokens WHERE user_id=? AND active=1')
    .all(input.recipientUserId) as { id: string }[];
  const insert = db().prepare(
    `INSERT OR IGNORE INTO push_notification_outbox(
       id,token_id,event_key,notification_type,title,body,data_json,available_at
     ) VALUES (?,?,?,?,?,?,?,?)`,
  );
  let queued = 0;
  for (const token of tokens) {
    const result = insert.run(
      randomUUID(),
      token.id,
      input.eventKey,
      input.type,
      input.title,
      input.body,
      JSON.stringify({ type: input.type, ...input.data }),
      Date.now(),
    );
    queued += result.changes;
  }
  return queued;
}

function claimOutbox(limit = 100) {
  return db().transaction(() => {
    const now = Date.now();
    const stale = now - 15 * 60_000;
    const rows = db()
      .prepare(
        `SELECT o.id,o.token_id,t.expo_push_token,o.title,o.body,o.data_json,o.attempts
         FROM push_notification_outbox o
         JOIN mobile_push_tokens t ON t.id=o.token_id
         WHERE t.active=1 AND o.attempts<? AND o.available_at<=?
           AND (o.status IN ('pending','failed') OR (o.status='sending' AND o.processing_at<?))
         ORDER BY o.created_at,o.id LIMIT ?`,
      )
      .all(MAX_ATTEMPTS, now, stale, limit) as OutboxRow[];
    const claim = db().prepare(
      `UPDATE push_notification_outbox
       SET status='sending',processing_at=?,attempts=attempts+1
       WHERE id=?`,
    );
    for (const row of rows) claim.run(now, row.id);
    return rows;
  })();
}

function retryDelay(attempts: number) {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(attempts, 0));
}

function markForRetry(row: OutboxRow, message: string) {
  const attempts = row.attempts + 1;
  db()
    .prepare(
      `UPDATE push_notification_outbox
       SET status=?,available_at=?,processing_at=NULL,last_error=? WHERE id=?`,
    )
    .run(
      attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      Date.now() + retryDelay(attempts),
      message.slice(0, 1000),
      row.id,
    );
}

function markPermanentFailure(row: OutboxRow, message: string) {
  db()
    .prepare(
      `UPDATE push_notification_outbox
       SET status='failed',attempts=?,processing_at=NULL,last_error=? WHERE id=?`,
    )
    .run(MAX_ATTEMPTS, message.slice(0, 1000), row.id);
}

/** Best-effort delivery. Mutations remain successful when Expo is unavailable. */
export async function flushPushNotificationOutbox() {
  const rows = claimOutbox();
  if (!rows.length) return;
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    if (process.env.EXPO_ACCESS_TOKEN)
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        rows.map((row) => ({
          to: row.expo_push_token,
          title: row.title,
          body: row.body,
          sound: 'default',
          channelId: 'general',
          data: JSON.parse(row.data_json) as Record<string, string>,
        })),
      ),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Expo Push API HTTP ${response.status}`);
    const result = (await response.json()) as {
      data?: { status?: string; message?: string; details?: { error?: string } }[];
    };
    if (!Array.isArray(result.data) || result.data.length !== rows.length)
      throw new Error('Respons Expo Push API tidak sesuai.');
    const sent = db().prepare(
      `UPDATE push_notification_outbox
       SET status='sent',sent_at=datetime('now'),processing_at=NULL,last_error='' WHERE id=?`,
    );
    for (const [index, row] of rows.entries()) {
      const ticket = result.data[index];
      if (ticket?.status === 'ok') {
        sent.run(row.id);
        continue;
      }
      const error = ticket?.details?.error || ticket?.message || 'Expo menolak notifikasi.';
      if (error === 'DeviceNotRegistered') {
        db().transaction(() => {
          db().prepare('UPDATE mobile_push_tokens SET active=0 WHERE id=?').run(row.token_id);
          markPermanentFailure(row, error);
        })();
      } else if (['InvalidCredentials', 'MismatchSenderId', 'MessageTooBig'].includes(error)) {
        markPermanentFailure(row, error);
      } else {
        markForRetry(row, error);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pengiriman push gagal.';
    for (const row of rows) markForRetry(row, message);
  }
}
