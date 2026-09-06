import { ZodError } from 'zod';
import { HttpError } from './auth';
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message || 'Data tidak valid.' },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ error: 'Format JSON tidak valid.' }, { status: 400 });
  if (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('SQLITE_CONSTRAINT')
  )
    return Response.json(
      { error: 'Data sudah digunakan atau masih memiliki relasi.' },
      { status: 409 },
    );
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server.' }, { status: 500 });
}
