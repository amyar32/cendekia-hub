import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';
import { listParams } from '@/app/api/modules/_shared/list-params';

export async function GET(request: Request) {
  try {
    await requireUser('audit.read');
    const { filter, offset } = listParams(request);
    const rows = db()
      .prepare(
        'SELECT * FROM audit WHERE actor LIKE ? OR action LIKE ? OR entity LIKE ? ORDER BY id DESC LIMIT 10 OFFSET ?',
      )
      .all(filter, filter, filter, offset);
    const total = (
      db()
        .prepare(
          'SELECT count(*) AS n FROM audit WHERE actor LIKE ? OR action LIKE ? OR entity LIKE ?',
        )
        .get(filter, filter, filter) as { n: number }
    ).n;

    return Response.json({ rows, total, roles: [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

async function readOnly(request: Request) {
  try {
    checkOrigin(request);
    throw new HttpError(405, 'Audit trail hanya dapat dibaca.');
  } catch (error) {
    return failure(error);
  }
}

export const POST = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
