import { NextRequest, NextResponse } from 'next/server';

const corsMethods = 'GET, POST, PUT, OPTIONS';
const corsHeaders = 'Authorization, Content-Type';

function allowedOrigins() {
  return new Set(
    (process.env.MOBILE_API_CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isLocalDevelopmentOrigin(origin: string) {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string) {
  return allowedOrigins().has(origin) || isLocalDevelopmentOrigin(origin);
}

function corsResponse(origin: string, init?: ResponseInit) {
  const response = new NextResponse(null, init);
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', corsMethods);
  response.headers.set('Access-Control-Allow-Headers', corsHeaders);
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set(
    'Vary',
    'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  );
  return response;
}

/** Adds browser CORS support only to the token-based mobile API. */
export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return NextResponse.next();

  if (!isAllowedOrigin(origin)) {
    if (request.method === 'OPTIONS') return new NextResponse(null, { status: 403 });
    return NextResponse.next();
  }

  if (request.method === 'OPTIONS') return corsResponse(origin, { status: 204 });

  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  return response;
}

export const config = { matcher: '/api/v1/:path*' };
