import { randomUUID } from 'node:crypto';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { mobileData, mobileFailure, MobileApiError, requireMobileTeacher } from '@/lib/mobile-api';
import { flushPushNotificationOutbox } from '@/lib/notifications/push';
import { currentSchoolId } from '@/lib/server/academic-context';
import { safeOriginalName, validateDocument } from '@/lib/uploads/validation';
import * as service from './service';

type Context = { params: Promise<{ path: string[] }> };
async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max)
    service.fail(413, 'PAYLOAD_TOO_LARGE', 'Ukuran request terlalu besar.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          service.fail(413, 'PAYLOAD_TOO_LARGE', 'Ukuran request terlalu besar.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks);
}
async function json(request: Request) {
  return JSON.parse((await boundedBody(request, 32768)).toString('utf8') || '{}');
}
function mayAttach(a: service.PointActor, id: string) {
  service.requireWrite(a);
  const row = service.getEntry(a, id);
  if (
    row.created_by !== a.user_id ||
    (row.status !== 'pending' && !(row.status === 'approved' && row.reviewed_by === a.user_id))
  )
    service.fail(
      403,
      'ATTACHMENT_FORBIDDEN',
      'Bukti hanya dapat ditambah oleh pencatat pada pengajuan tertunda atau catatan yang disahkan sendiri.',
    );
}
async function upload(a: service.PointActor, id: string, request: Request) {
  mayAttach(a, id);
  const bytes = await boundedBody(request, 6 * 1024 * 1024);
  const form = await new Response(bytes, {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  }).formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024)
    service.fail(
      400,
      'INVALID_ATTACHMENT',
      'Pilih satu file PNG, JPEG, WebP, atau PDF maksimal 5 MB.',
    );
  const content = Buffer.from(await file.arrayBuffer());
  try {
    validateDocument(content, file.type);
  } catch {
    service.fail(
      400,
      'INVALID_ATTACHMENT',
      'Isi file tidak sesuai format PNG, JPEG, WebP, atau PDF.',
    );
  }
  return db().transaction(() => {
    mayAttach(a, id);
    const count = db()
      .prepare('SELECT count(*) AS n FROM point_entry_attachments WHERE entry_id=?')
      .get(id) as { n: number };
    if (count.n >= 3) service.fail(409, 'ATTACHMENT_LIMIT', 'Maksimal tiga bukti per catatan.');
    const attachmentId = randomUUID();
    db()
      .prepare(
        `INSERT INTO point_entry_attachments(id,entry_id,original_name,mime_type,size,content,created_by) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(attachmentId, id, safeOriginalName(file.name), file.type, file.size, content, a.user_id);
    audit(a.email, 'create', 'point_entry_attachments', attachmentId, {
      entry_id: id,
      size: file.size,
    });
    return {
      id: attachmentId,
      original_name: safeOriginalName(file.name),
      mime_type: file.type,
      size: file.size,
    };
  })();
}
function download(a: service.PointActor, id: string, attachmentId: string) {
  service.getEntry(a, id);
  const file = db()
    .prepare(
      'SELECT original_name,mime_type,content FROM point_entry_attachments WHERE id=? AND entry_id=?',
    )
    .get(service.uuid.parse(attachmentId), id) as
    { original_name: string; mime_type: string; content: Buffer } | undefined;
  if (!file) service.fail(404, 'ATTACHMENT_NOT_FOUND', 'Bukti tidak ditemukan.');
  return new Response(new Uint8Array(file.content), {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function dispatch(a: service.PointActor, request: Request, path: string[]) {
  const [resource, id, action, attachmentId] = path;
  const method = request.method;
  const q = new URL(request.url).searchParams;
  if (path.length === 1 && method === 'GET') {
    if (resource === 'options') return mobileData(service.options(a));
    if (resource === 'students') return mobileData(service.listStudents(a, q));
    if (resource === 'rules' || resource === 'policies')
      return mobileData(service.listMaster(a, resource, q));
    if (resource === 'entries') return mobileData(service.listEntries(a, q));
    if (resource === 'summary') return mobileData(service.summary(a, q));
    if (resource === 'cases') return mobileData(service.listCases(a, q));
  }
  if (
    (resource === 'rules' || resource === 'policies') &&
    ((method === 'POST' && path.length === 1) || (method === 'PATCH' && path.length === 2))
  )
    return mobileData(service.saveMaster(a, resource, await json(request), id), {
      status: method === 'POST' ? 201 : 200,
    });
  if (resource === 'entries') {
    if (method === 'POST' && path.length === 1) {
      const result = service.createEntry(a, await json(request));
      await flushPushNotificationOutbox();
      return mobileData(
        result.entry,
        { status: result.replayed ? 200 : 201 },
        { replayed: result.replayed },
      );
    }
    if (id) service.uuid.parse(id);
    if (method === 'GET' && path.length === 2) return mobileData(service.entryDetail(a, id));
    if (method === 'POST' && path.length === 3 && ['approve', 'reject', 'void'].includes(action)) {
      const result = service.reviewEntry(
        a,
        id,
        action as 'approve' | 'reject' | 'void',
        await json(request),
      );
      await flushPushNotificationOutbox();
      return mobileData(result);
    }
    if (action === 'attachments' && method === 'POST' && path.length === 3)
      return mobileData(await upload(a, id, request), { status: 201 });
    if (action === 'attachments' && method === 'GET' && path.length === 4)
      return download(a, id, attachmentId);
  }
  if (resource === 'cases') {
    if (method === 'POST' && path.length === 1) {
      const result = service.createCase(a, await json(request));
      await flushPushNotificationOutbox();
      return mobileData(result, { status: 201 });
    }
    if (id) service.uuid.parse(id);
    if (method === 'GET' && path.length === 2) return mobileData(service.caseDetail(a, id));
    if (method === 'PATCH' && path.length === 2) {
      const result = service.updateCase(a, id, await json(request));
      await flushPushNotificationOutbox();
      return mobileData(result);
    }
    if (method === 'POST' && path.length === 3 && action === 'activities') {
      const result = service.addActivity(a, id, await json(request));
      await flushPushNotificationOutbox();
      return mobileData(result, { status: 201 });
    }
  }
  service.fail(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}
export async function mobileHandler(request: Request, context: Context) {
  try {
    const a = requireMobileTeacher(request, { permission: 'points.read' });
    return await dispatch(a, request, (await context.params).path);
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function webHandler(request: Request, context: Context) {
  try {
    if (request.method !== 'GET') checkOrigin(request);
    const user = await requireUser('points.read');
    const schoolId = currentSchoolId();
    const teacher = db()
      .prepare('SELECT id FROM teachers WHERE user_id=? AND school_id=? AND is_active=1')
      .get(user.id, schoolId) as { id: string } | undefined;
    return await dispatch(
      {
        user_id: user.id,
        email: user.email,
        permissions: user.permissions,
        school_id: schoolId,
        teacher_id: teacher?.id,
      },
      request,
      (await context.params).path,
    );
  } catch (error) {
    return mobileFailure(
      error instanceof HttpError
        ? new MobileApiError(error.status, 'FORBIDDEN', error.message)
        : error,
    );
  }
}
