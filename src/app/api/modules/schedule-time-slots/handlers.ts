import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm.');
const schema = z
  .object({
    name: z.string().trim().min(2, 'Nama slot minimal 2 karakter.').max(50),
    start_time: time,
    end_time: time,
    slot_order: z.coerce.number().int().min(1, 'Urutan minimal 1.').max(100),
    is_break: z.boolean().default(false),
    is_active: z.boolean().default(true),
  })
  .refine((value) => value.start_time < value.end_time, {
    message: 'Jam selesai harus setelah jam mulai.',
    path: ['end_time'],
  });

export async function GET() {
  try {
    await requireUser('schedules.read');
    const schoolId = currentSchoolId();
    const rows = db()
      .prepare(
        `SELECT * FROM schedule_time_slots WHERE school_id=?
         ORDER BY slot_order, start_time`,
      )
      .all(schoolId);
    return Response.json(
      { rows, total: rows.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    checkOrigin(request);
    const actor = await requireUser('schedules.write');
    const input = await request.json();
    const schoolId = currentSchoolId();
    const id =
      method === 'POST' ? randomUUID() : z.string().uuid('ID tidak valid.').parse(input.id);
    db().transaction(() => {
      const previous =
        method === 'POST'
          ? undefined
          : (db()
              .prepare('SELECT * FROM schedule_time_slots WHERE id=? AND school_id=?')
              .get(id, schoolId) as Record<string, unknown> | undefined);
      if (method !== 'POST' && !previous) throw new HttpError(404, 'Slot waktu tidak ditemukan.');
      let details: unknown = previous || {};
      if (method === 'DELETE') {
        db().prepare('DELETE FROM schedule_time_slots WHERE id=?').run(id);
      } else {
        const data = schema.parse(input);
        if (
          data.is_break &&
          db().prepare('SELECT id FROM class_schedules WHERE time_slot_id=? LIMIT 1').get(id)
        )
          throw new HttpError(
            409,
            'Slot yang sudah berisi jadwal tidak dapat diubah menjadi istirahat.',
          );
        if (data.is_active) {
          const overlap = db()
            .prepare(
              `SELECT id FROM schedule_time_slots
               WHERE school_id=? AND id<>? AND is_active=1
                 AND NOT (end_time<=? OR start_time>=?)`,
            )
            .get(schoolId, id, data.start_time, data.end_time);
          if (overlap)
            throw new HttpError(409, 'Rentang waktu bertabrakan dengan slot aktif lain.');
        }
        details = data;
        if (method === 'POST')
          db()
            .prepare(
              `INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order,is_break,is_active)
               VALUES(?,?,?,?,?,?,?,?)`,
            )
            .run(
              id,
              schoolId,
              data.name,
              data.start_time,
              data.end_time,
              data.slot_order,
              Number(data.is_break),
              Number(data.is_active),
            );
        else
          db()
            .prepare(
              `UPDATE schedule_time_slots SET name=?,start_time=?,end_time=?,slot_order=?,is_break=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
            )
            .run(
              data.name,
              data.start_time,
              data.end_time,
              data.slot_order,
              Number(data.is_break),
              Number(data.is_active),
              id,
            );
      }
      audit(
        actor.email,
        method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'delete',
        'schedule_time_slots',
        id,
        details,
      );
    })();
    return Response.json({ ok: true, id }, { status: method === 'POST' ? 201 : 200 });
  } catch (error) {
    return failure(error);
  }
}

export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
export const DELETE = (request: Request) => mutate(request, 'DELETE');
