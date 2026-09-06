import { test, before, after } from 'node:test';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const dir = mkdtempSync(join(tmpdir(), 'cms-test-'));
const port = 3317;
const base = `http://localhost:${port}`;
let server: ChildProcess;
let logs = '';
let adminCookie = '';
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = adminCookie,
  origin = base,
) {
  return fetch(base + path, {
    method,
    headers: { origin, cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
}
before(async () => {
  const env = {
    ...process.env,
    DATABASE_PATH: join(dir, 'test.sqlite'),
    SEED_ADMIN_EMAIL: 'admin@test.local',
    SEED_ADMIN_PASSWORD: 'test-admin-password-123',
  };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env });
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout?.on('data', (d) => (logs += String(d)));
  server.stderr?.on('data', (d) => (logs += String(d)));
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(base + '/login');
      if (res.ok) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await setTimeout(250);
  }
  throw new Error('Server tidak siap: ' + logs);
});
after(async () => {
  server?.kill();
  if (server && server.exitCode === null)
    await new Promise((resolve) => server.once('exit', resolve));
  rmSync(dir, { recursive: true, force: true });
});
test('authentication, CRUD, RBAC, session revocation and audit end-to-end', async () => {
  assert.equal((await api('/api/modules/users', 'GET', undefined, '')).status, 401);
  assert.equal((await api('/', 'GET', undefined, '')).status, 307);
  assert.equal(
    (await api('/api/auth/login', 'POST', { email: 'admin@test.local', password: 'wrong' }, ''))
      .status,
    401,
  );
  let res = await api(
    '/api/auth/login',
    'POST',
    { email: 'admin@test.local', password: 'test-admin-password-123' },
    '',
  );
  assert.equal(res.status, 200);
  adminCookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.match(adminCookie, /cms_session=/);
  assert.equal((await api('/')).status, 200);
  assert.equal(
    (
      await api(
        '/api/modules/categories',
        'POST',
        { name: 'Blocked' },
        adminCookie,
        'https://evil.example',
      )
    ).status,
    403,
  );
  res = await api('/api/modules/categories', 'POST', {
    name: 'Pendidikan',
    description: 'Kategori uji',
    active: true,
  });
  assert.equal(res.status, 201);
  const category = await res.json();
  assert.equal(
    (
      await api('/api/modules/categories', 'PATCH', {
        id: category.id,
        name: 'Pendidikan baru',
        active: false,
      })
    ).status,
    200,
  );
  res = await api('/api/modules/categories?q=Pendidikan');
  assert.equal((await res.json()).total, 1);
  assert.equal(
    (await api('/api/modules/roles', 'PATCH', { id: 'admin', name: 'Unsafe', permissions: [] }))
      .status,
    403,
  );
  res = await api('/api/modules/users', 'POST', {
    name: 'Viewer test',
    email: 'viewer@test.local',
    password: 'viewer-password-123',
    role_id: 'viewer',
    active: true,
  });
  assert.equal(res.status, 201);
  const viewer = await res.json();
  res = await api(
    '/api/auth/login',
    'POST',
    { email: 'viewer@test.local', password: 'viewer-password-123' },
    '',
  );
  assert.equal(res.status, 200);
  const viewerCookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await api('/api/modules/categories', 'GET', undefined, viewerCookie)).status, 200);
  assert.equal(
    (await api('/api/modules/categories', 'POST', { name: 'Unauthorized' }, viewerCookie)).status,
    403,
  );
  assert.equal((await api('/api/modules/users', 'GET', undefined, viewerCookie)).status, 403);
  assert.equal((await api('/api/modules/audit', 'GET', undefined, viewerCookie)).status, 403);
  assert.equal(
    (
      await api('/api/modules/users', 'PATCH', {
        id: viewer.id,
        name: 'Viewer test',
        email: 'viewer@test.local',
        role_id: 'viewer',
        active: false,
      })
    ).status,
    200,
  );
  assert.equal((await api('/api/modules/categories', 'GET', undefined, viewerCookie)).status, 401);
  assert.equal((await api('/api/modules/categories', 'DELETE', { id: category.id })).status, 200);
  res = await api('/api/modules/audit?q=categories');
  const history = await res.json();
  assert.equal(history.total, 3);
  assert.deepEqual(
    history.rows.map((r: { action: string }) => r.action),
    ['delete', 'update', 'create'],
  );
  assert.equal((await api('/api/modules/audit', 'DELETE', { id: history.rows[0].id })).status, 405);
  res = await api('/api/modules/roles', 'POST', {
    name: 'Operator',
    permissions: ['categories.read', 'roles.read', 'roles.write'],
  });
  assert.equal(res.status, 201);
  const role = await res.json();
  res = await api('/api/modules/users', 'POST', {
    name: 'Operator test',
    email: 'operator@test.local',
    password: 'operator-password-123',
    role_id: role.id,
  });
  assert.equal(res.status, 201);
  const operator = await res.json();
  res = await api(
    '/api/auth/login',
    'POST',
    { email: 'operator@test.local', password: 'operator-password-123' },
    '',
  );
  assert.equal(res.status, 200);
  const operatorCookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.equal(
    (await api('/api/modules/categories', 'GET', undefined, operatorCookie)).status,
    200,
  );
  assert.equal(
    (
      await api(
        '/api/modules/roles',
        'POST',
        { name: 'Elevated', permissions: ['users.write'] },
        operatorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        '/api/modules/roles',
        'PATCH',
        { id: role.id, name: 'Self edit', permissions: [] },
        operatorCookie,
      )
    ).status,
    403,
  );
  assert.equal((await api('/api/modules/roles', 'DELETE', { id: role.id })).status, 409);
  assert.equal(
    (
      await api('/api/modules/roles', 'PATCH', {
        id: role.id,
        name: 'Operator revised',
        permissions: [],
      })
    ).status,
    200,
  );
  assert.equal(
    (await api('/api/modules/categories', 'GET', undefined, operatorCookie)).status,
    403,
  );
  assert.equal((await api('/api/modules/users', 'DELETE', { id: operator.id })).status, 200);
  assert.equal((await api('/api/modules/roles', 'DELETE', { id: role.id })).status, 200);
  res = await api('/api/modules/users');
  const users = await res.json();
  assert.ok(users.rows.every((row: Record<string, unknown>) => !('password' in row)));
  const database = new Database(join(dir, 'test.sqlite'));
  try {
    assert.throws(() => database.prepare('DELETE FROM audit').run(), /append-only/);
    assert.throws(() => database.prepare("UPDATE audit SET actor='tampered'").run(), /append-only/);
    const auditText = JSON.stringify(database.prepare('SELECT * FROM audit').all());
    assert.ok(!auditText.includes('test-admin-password-123'));
    assert.ok(!auditText.includes(adminCookie.split('=')[1]));
  } finally {
    database.close();
  }
  res = await api('/api/auth/password', 'POST', {
    currentPassword: 'test-admin-password-123',
    password: 'new-admin-password-123',
  });
  assert.equal(res.status, 200);
  const newCookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await api('/api/modules/users')).status, 401);
  assert.equal((await api('/api/modules/users', 'GET', undefined, newCookie)).status, 200);
  assert.equal((await api('/api/auth/logout', 'POST', {}, newCookie)).status, 200);
  assert.equal((await api('/api/modules/users', 'GET', undefined, newCookie)).status, 401);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await api('/api/auth/login', 'POST', { email: 'absent@test.local', password: 'wrong' }, ''))
        .status,
      401,
    );
  assert.equal(
    (await api('/api/auth/login', 'POST', { email: 'absent@test.local', password: 'wrong' }, ''))
      .status,
    429,
  );
});
