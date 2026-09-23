import { openApiDocument } from '@/lib/openapi';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(openApiDocument, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
