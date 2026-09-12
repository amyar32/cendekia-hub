import { z } from 'zod';
import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure } from '@/lib/http';

const levels = z.enum(['province', 'regency', 'district', 'village']);
const sourceBase = 'https://emsifa.github.io/api-wilayah-indonesia/api';

type SourceRegion = { id: string; name: string };

function sourceUrl(level: z.infer<typeof levels>, parent: string) {
  if (level === 'province') return `${sourceBase}/provinces.json`;
  const resource = { regency: 'regencies', district: 'districts', village: 'villages' }[level];
  return `${sourceBase}/${resource}/${encodeURIComponent(parent)}.json`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const level = levels.parse(url.searchParams.get('level'));
    const parent = z
      .string()
      .regex(/^\d*$/, 'Induk wilayah tidak valid.')
      .parse(url.searchParams.get('parent') || '');
    if (level !== 'province' && !parent) throw new HttpError(400, 'Induk wilayah wajib dipilih.');

    const cached = db()
      .prepare(
        'SELECT id AS value,name AS label FROM administrative_regions WHERE level=? AND parent_id=? ORDER BY name',
      )
      .all(level, parent);
    if (cached.length) return Response.json({ regions: cached, source: 'cache' });

    const response = await fetch(sourceUrl(level, parent), {
      cache: 'force-cache',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new HttpError(503, 'Data wilayah belum dapat dimuat. Coba lagi sebentar.');
    const regions = (await response.json()) as SourceRegion[];
    if (!Array.isArray(regions)) throw new HttpError(502, 'Format data wilayah tidak valid.');
    const insert = db().prepare(
      "INSERT OR REPLACE INTO administrative_regions(id,parent_id,level,name,updated_at) VALUES(?,?,?,?,datetime('now'))",
    );
    db().transaction(() => {
      for (const region of regions)
        if (typeof region.id === 'string' && typeof region.name === 'string')
          insert.run(region.id, parent, level, region.name);
    })();
    return Response.json({
      regions: regions
        .filter((region) => typeof region.id === 'string' && typeof region.name === 'string')
        .map((region) => ({ value: region.id, label: region.name })),
      source: 'remote',
    });
  } catch (error) {
    return failure(error);
  }
}
