import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, db } from '@/lib/db';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { failure } from '@/lib/http';
import { uploadIdFromUrl } from '@/lib/uploads';

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => !value || z.email().safeParse(value).success, 'Format email tidak valid.');

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value || uploadIdFromUrl(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Format URL logo tidak valid.');

const schoolSchema = z.object({
  name: z.string().trim().min(2, 'Nama sekolah minimal 2 karakter.').max(150),
  code: z.string().trim().max(50).default(''),
  npsn: z
    .string()
    .trim()
    .max(20)
    .refine((value) => !value || /^\d{8}$/.test(value), 'NPSN harus terdiri dari 8 digit.'),
  address: z.string().trim().max(1000).default(''),
  email: optionalEmail.default(''),
  phone: z.string().trim().max(30).default(''),
  logo_url: optionalUrl.default(''),
  timezone: z
    .string()
    .trim()
    .min(1, 'Zona waktu wajib diisi.')
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('id-ID', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, 'Zona waktu tidak valid.'),
  is_active: z.boolean().default(true),
});

type SchoolRow = {
  id: string;
  name: string;
  code: string;
  npsn: string;
  address: string;
  email: string;
  phone: string;
  logo_url: string;
  timezone: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function getSchool() {
  return db().prepare('SELECT * FROM schools ORDER BY created_at LIMIT 1').get() as
    SchoolRow | undefined;
}

export async function GET() {
  try {
    await requireUser('school.read');
    return Response.json(
      { school: getSchool() ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireUser('school.write');
    const data = schoolSchema.parse(await request.json());
    const uploadId = uploadIdFromUrl(data.logo_url);
    if (uploadId) {
      const upload = db()
        .prepare("SELECT id FROM uploads WHERE id = ? AND scope = 'school.logo'")
        .get(uploadId);
      if (!upload) throw new HttpError(400, 'Logo hasil upload tidak valid.');
    }
    let id = '';

    db().transaction(() => {
      const previous = getSchool();
      id = previous?.id ?? randomUUID();
      if (previous) {
        db()
          .prepare(
            `UPDATE schools SET name=?, code=?, npsn=?, address=?, email=?, phone=?, logo_url=?, timezone=?, is_active=?, updated_at=datetime('now') WHERE id=?`,
          )
          .run(
            data.name,
            data.code,
            data.npsn,
            data.address,
            data.email,
            data.phone,
            data.logo_url,
            data.timezone,
            Number(data.is_active),
            id,
          );
      } else {
        db()
          .prepare(
            `INSERT INTO schools(id, name, code, npsn, address, email, phone, logo_url, timezone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            data.name,
            data.code,
            data.npsn,
            data.address,
            data.email,
            data.phone,
            data.logo_url,
            data.timezone,
            Number(data.is_active),
          );
      }
      audit(actor.email, previous ? 'update' : 'create', 'schools', id, data);
    })();

    return Response.json({ ok: true, school: getSchool() });
  } catch (error) {
    return failure(error);
  }
}
