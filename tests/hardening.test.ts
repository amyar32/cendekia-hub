import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('private uploads are not publicly cacheable and automatic absences require write access', async () => {
  const uploadRoute = await readFile('src/app/api/uploads/[id]/route.ts', 'utf8');
  assert.match(uploadRoute, /scope\.public[\s\S]*'private, no-store'/);
  for (const file of [
    'src/app/api/modules/student-checkins/handlers.ts',
    'src/app/api/modules/teacher-checkins/handlers.ts',
    'src/app/api/modules/checkins/scanner/route.ts',
  ]) {
    const source = await readFile(file, 'utf8');
    const getHandler = source.slice(
      source.indexOf('export async function GET'),
      source.indexOf('export async function POST'),
    );
    assert.match(
      getHandler,
      /permissions\.includes\('checkins\.write'\)[\s\S]*assignAutomaticAbsences/,
    );
  }
});

test('rate limits persist in SQLite and orphan upload cleanup preserves referenced files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cendekia-hardening-'));
  process.env.DATABASE_PATH = join(root, 'test.sqlite');
  process.env.UPLOAD_STORAGE_PATH = join(root, 'uploads');
  try {
    const [{ admissionRateLimit }, { db }, { pruneOrphanedUploads, storeUpload, uploadUrl }] =
      await Promise.all([
        import('../src/lib/admissions-public'),
        import('../src/lib/db'),
        import('../src/lib/uploads'),
      ]);
    const request = new Request('http://localhost/api/public/admissions', {
      headers: { 'user-agent': 'hardening-test' },
    });
    for (let attempt = 0; attempt < 6; attempt += 1) admissionRateLimit(request, 'submission');
    assert.throws(() => admissionRateLimit(request, 'submission'), /Terlalu banyak percobaan/);
    assert.equal(
      (
        db().prepare('SELECT count(*) AS count FROM admission_rate_limits').get() as {
          count: number;
        }
      ).count,
      1,
    );

    const orphanKey = await storeUpload(new Uint8Array([1, 2, 3]), '.bin', 'documents');
    const keptKey = await storeUpload(new Uint8Array([4, 5, 6]), '.bin', 'images');
    const orphanId = '00000000-0000-4000-8000-000000000001';
    const keptId = '00000000-0000-4000-8000-000000000002';
    db()
      .prepare(
        "INSERT INTO uploads(id,storage_key,original_name,mime_type,size,scope,created_by,created_at) VALUES(?,?,?,?,?,?,?,datetime('now','-2 days'))",
      )
      .run(
        orphanId,
        orphanKey,
        'orphan.bin',
        'application/octet-stream',
        3,
        'student.document',
        'test',
      );
    db()
      .prepare(
        "INSERT INTO uploads(id,storage_key,original_name,mime_type,size,scope,created_by,created_at) VALUES(?,?,?,?,?,?,?,datetime('now','-2 days'))",
      )
      .run(keptId, keptKey, 'kept.bin', 'application/octet-stream', 3, 'school.logo', 'test');
    db()
      .prepare('INSERT INTO schools(id,name,logo_url) VALUES(?,?,?)')
      .run('school', 'Test', uploadUrl(keptId));

    assert.equal(pruneOrphanedUploads({ graceHours: 24 }), 1);
    assert.equal(db().prepare('SELECT id FROM uploads WHERE id=?').get(orphanId), undefined);
    assert.ok(db().prepare('SELECT id FROM uploads WHERE id=?').get(keptId));
    await assert.rejects(access(join(root, 'uploads', orphanKey)));
    await access(join(root, 'uploads', keptKey));
    db().close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
