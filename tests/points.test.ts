import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { tokenHash } from '../src/lib/auth';
import { db } from '../src/lib/db';
import { createMobileSession } from '../src/lib/mobile-api';
import { mobileHandler, webHandler } from '../src/features/points/server/handlers';
import * as points from '../src/features/points/server/service';

const directory = mkdtempSync(join(tmpdir(), 'points-test-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
process.env.APP_CURRENT_DATE = '2029-09-28';
const sql = db();
const school = randomUUID(),
  year = randomUUID(),
  term = randomUUID(),
  grade = randomUUID(),
  classroom = randomUUID(),
  otherClass = randomUUID(),
  pupil = randomUUID(),
  otherPupil = randomUUID();
sql.prepare(`INSERT INTO schools(id,name,code) VALUES (?,?,'POINTS')`).run(school, 'Sekolah Poin');
sql
  .prepare(
    `INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active) VALUES (?,?,'2029/2030','2029-07-01','2030-06-30',1)`,
  )
  .run(year, school);
sql
  .prepare(
    `INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active) VALUES (?,?,'Ganjil',1,'2029-07-01','2029-12-31',1)`,
  )
  .run(term, year);
sql
  .prepare(`INSERT INTO grades(id,school_id,name,level_order) VALUES (?,?,'7',7)`)
  .run(grade, school);
for (const [id, name] of [
  [classroom, '7A'],
  [otherClass, '7B'],
])
  sql
    .prepare('INSERT INTO classes(id,school_id,academic_year_id,grade_id,name) VALUES (?,?,?,?,?)')
    .run(id, school, year, grade, name);
for (const [id, name, c] of [
  [pupil, 'Andi', classroom],
  [otherPupil, 'Budi', otherClass],
]) {
  sql
    .prepare(`INSERT INTO students(id,school_id,nis,name,gender) VALUES (?,?,?,?,'male')`)
    .run(id, school, name, name);
  sql
    .prepare(
      `INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,status) VALUES (?,?,?,?,'2029-07-01','active')`,
    )
    .run(randomUUID(), id, c, year);
}
function actor(name: string, manage = false): points.PointActor {
  const user = randomUUID(),
    teacher = randomUUID();
  const permissions = ['points.read', 'points.write', ...(manage ? ['points.manage'] : [])];
  sql
    .prepare('INSERT INTO roles(id,name,permissions) VALUES (?,?,?)')
    .run(name, name, JSON.stringify(permissions));
  sql
    .prepare('INSERT INTO users(id,name,email,password,role_id) VALUES (?,?,?,?,?)')
    .run(user, name, name + '@points.test', 'unused', name);
  sql
    .prepare(
      `INSERT INTO teachers(id,school_id,user_id,employee_code,name,gender,employment_status) VALUES (?,?,?,?,?,'male','permanent')`,
    )
    .run(teacher, school, user, name, name);
  return {
    user_id: user,
    teacher_id: teacher,
    school_id: school,
    email: name + '@points.test',
    permissions,
  };
}
const admin = actor('admin-test', true),
  reporter = actor('reporter'),
  wali = actor('wali'),
  outsider = actor('outsider');
sql
  .prepare(
    'INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id) VALUES (?,?,?,?)',
  )
  .run(randomUUID(), wali.teacher_id, classroom, year);
const rule = points.saveMaster(admin, 'rules', {
  name: 'Terlambat',
  kind: 'violation',
  points: 5,
}) as { id: string };
const reward = points.saveMaster(admin, 'rules', {
  name: 'Membantu',
  kind: 'appreciation',
  points: 20,
}) as { id: string };
points.saveMaster(admin, 'policies', { name: 'Pembinaan wali', threshold: 5 });
function entry(studentId = pupil, ruleId = rule.id) {
  return {
    student_id: studentId,
    rule_id: ruleId,
    semester_id: term,
    occurred_on: '2029-09-28',
    note: 'Kejadian sudah diperiksa.',
    client_request_id: randomUUID(),
  };
}
const q = (params: Record<string, string> = {}) => new URLSearchParams(params);
after(() => {
  sql.close();
  rmSync(directory, { recursive: true, force: true });
});

test('guru mencari identitas minimal lintas kelas, tanpa riwayat dan data pribadi', () => {
  const students = points.listStudents(reporter, q()).rows as Record<string, unknown>[];
  assert.equal(students.length, 2);
  assert.deepEqual(
    Object.keys(students[0]).sort(),
    ['id', 'name', 'nis', 'photo_url', 'class_id', 'class_name'].sort(),
  );
  assert.throws(
    () => points.summary(reporter, q({ semester_id: term, student_id: pupil })),
    /wali kelas/,
  );
  assert.throws(
    () => points.saveMaster(reporter, 'rules', { name: 'Bebas', kind: 'violation', points: 999 }),
    /pengelola/,
  );
});
test('pengajuan, idempotensi, snapshot bobot, verifikasi, dan ambang hanya sekali', () => {
  const input = entry();
  const created = points.createEntry(reporter, input);
  assert.equal(created.entry.status, 'pending');
  assert.equal(points.createEntry(reporter, input).replayed, true);
  assert.throws(() => points.createEntry(reporter, { ...input, note: 'Isi lain' }), /isi berbeda/);
  assert.equal(points.listEntries(outsider, q()).total, 0);
  assert.throws(() => points.getEntry(outsider, String(created.entry.id)), /tidak ditemukan/);
  assert.throws(
    () => points.reviewEntry(reporter, String(created.entry.id), 'approve', {}),
    /wali kelas/,
  );
  points.saveMaster(
    admin,
    'rules',
    { name: 'Terlambat baru', kind: 'violation', points: 9 },
    rule.id,
  );
  assert.equal(points.getEntry(wali, String(created.entry.id)).points, 5);
  assert.equal(points.getEntry(wali, String(created.entry.id)).rule_name, 'Terlambat');
  points.reviewEntry(wali, String(created.entry.id), 'approve', {});
  assert.throws(() => points.reviewEntry(wali, String(created.entry.id), 'approve', {}), /Status/);
  const second = points.createEntry(wali, entry());
  assert.equal(second.entry.status, 'approved');
  points.createEntry(wali, entry(pupil, reward.id));
  const row = points.summary(wali, q({ semester_id: term, student_id: pupil })).rows[0] as Record<
    string,
    unknown
  >;
  assert.equal(row.violation, 14);
  assert.equal(row.appreciation, 20);
  assert.equal(points.listCases(wali, q()).total, 1);
  assert.throws(() => points.reviewEntry(wali, String(second.entry.id), 'void', {}), /Alasan/);
  points.reviewEntry(wali, String(second.entry.id), 'void', { reason: 'Duplikat kejadian' });
  assert.equal(
    (
      points.summary(wali, q({ semester_id: term, student_id: pupil })).rows[0] as Record<
        string,
        unknown
      >
    ).violation,
    5,
  );
  assert.equal(points.listCases(wali, q()).total, 1);
  assert.ok(
    sql
      .prepare("SELECT id FROM audit WHERE entity='student_point_entries' AND action='void'")
      .get(),
  );
});
test('penolakan, kasus manual, aktivitas, hasil wajib, dan akses kelas lain', () => {
  const created = points.createEntry(reporter, entry());
  points.reviewEntry(wali, String(created.entry.id), 'reject', {
    reason: 'Alasan keterlambatan diterima',
  });
  assert.equal(points.getEntry(reporter, String(created.entry.id)).status, 'rejected');
  assert.throws(
    () =>
      points.createCase(wali, {
        student_id: otherPupil,
        semester_id: term,
        title: 'Kasus',
        note: 'Catatan',
      }),
    /wali kelas/,
  );
  const c = points.createCase(wali, {
    student_id: pupil,
    semester_id: term,
    title: 'Evaluasi',
    note: 'Pembinaan manual',
  });
  points.addActivity(wali, String(c.id), { note: 'Pertemuan pertama selesai.' });
  assert.equal(points.caseDetail(wali, String(c.id)).activities.length, 1);
  assert.throws(
    () => points.updateCase(wali, String(c.id), { status: 'resolved' }),
    /Hasil pembinaan/,
  );
  points.updateCase(wali, String(c.id), {
    status: 'resolved',
    resolution: 'Ada perbaikan.',
    assign_to_me: true,
  });
  assert.equal(points.getCase(wali, String(c.id)).status, 'resolved');
  assert.throws(() => points.getCase(reporter, String(c.id)), /wali kelas/);
});
test('validasi tanggal, semester, nilai dari server, role baca saja, dan isolasi sekolah', () => {
  assert.throws(() => points.createEntry(reporter, { ...entry(), points: 999 }), /Unrecognized/);
  assert.throws(
    () => points.createEntry(reporter, { ...entry(), occurred_on: '2029-09-29' }),
    /Tanggal/,
  );
  assert.throws(() => points.createEntry(reporter, { ...entry(), occurred_on: '2029-02-30' }));
  assert.throws(
    () => points.createEntry({ ...reporter, permissions: ['points.read'] }, entry()),
    /izin/,
  );
  const foreign = { ...admin, school_id: randomUUID() };
  assert.equal(points.listStudents(foreign, q()).total, 0);
  assert.throws(() => points.createEntry(foreign, entry()), /tidak ditemukan/);
  const secondTerm = randomUUID();
  sql
    .prepare(
      `INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date) VALUES (?,?,'Genap',2,'2030-01-01','2030-06-30')`,
    )
    .run(secondTerm, year);
  assert.equal(
    (
      points.summary(admin, q({ semester_id: secondTerm, student_id: pupil })).rows[0] as Record<
        string,
        unknown
      >
    ).violation,
    0,
  );
});
test('API native: token, response, retry, lampiran privat, batas file dan permission', async () => {
  const session = createMobileSession(reporter.user_id, {});
  const otherSession = createMobileSession(outsider.user_id, {});
  async function call(path: string, method = 'GET', body?: unknown, token = session.access_token) {
    const request = new Request('http://localhost/api/v1/points/' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    return mobileHandler(request, {
      params: Promise.resolve({ path: path.split('?')[0].split('/') }),
    });
  }
  assert.equal((await call('options', 'GET', undefined, 'bad')).status, 401);
  const options = await (await call('options')).json();
  assert.equal(options.data.capabilities.homeroom_class_id, null);
  const payload = entry();
  const response = await call('entries', 'POST', payload);
  assert.equal(response.status, 201);
  const created = await response.json();
  const id = created.data.id;
  const retry = await call('entries', 'POST', payload);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).meta.replayed, true);
  const form = new FormData();
  form.set('file', new File(['%PDF-1.4\n%%EOF'], 'bukti.pdf', { type: 'application/pdf' }));
  const uploaded = await call(`entries/${id}/attachments`, 'POST', form);
  assert.equal(uploaded.status, 201);
  const file = (await uploaded.json()).data;
  const download = await call(`entries/${id}/attachments/${file.id}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.equal(
    (
      await call(
        `entries/${id}/attachments/${file.id}`,
        'GET',
        undefined,
        otherSession.access_token,
      )
    ).status,
    404,
  );
  const invalid = new FormData();
  invalid.set('file', new File(['malicious text'], 'fake.png', { type: 'image/png' }));
  assert.equal((await call(`entries/${id}/attachments`, 'POST', invalid)).status, 400);
  for (let i = 0; i < 2; i++)
    assert.equal((await call(`entries/${id}/attachments`, 'POST', form)).status, 201);
  assert.equal((await call(`entries/${id}/attachments`, 'POST', form)).status, 409);
  const malformed = await call('entries', 'POST', { ...entry(), points: 99 });
  assert.equal(malformed.status, 400);
  sql.prepare('UPDATE roles SET permissions=? WHERE id=?').run('[]', 'reporter');
  assert.equal((await call('students')).status, 403);
  sql
    .prepare('UPDATE roles SET permissions=? WHERE id=?')
    .run(JSON.stringify(reporter.permissions), 'reporter');
  const web = await webHandler(
    new Request('http://localhost/api/modules/points/rules', {
      method: 'POST',
      headers: { Origin: 'http://evil.test' },
    }),
    { params: Promise.resolve({ path: ['rules'] }) },
  );
  assert.equal(web.status, 403);
});
test('otorisasi mengikuti pergantian wali kelas, histori pelapor tetap tersedia', () => {
  const created = points.createEntry(reporter, entry());
  sql
    .prepare('UPDATE homeroom_assignments SET teacher_id=? WHERE class_id=?')
    .run(outsider.teacher_id, classroom);
  assert.throws(() => points.getEntry(wali, String(created.entry.id)), /tidak ditemukan/);
  assert.equal(points.entryDetail(outsider, String(created.entry.id)).can_review, 1);
  points.reviewEntry(outsider, String(created.entry.id), 'approve', {});
  assert.equal(points.getEntry(reporter, String(created.entry.id)).status, 'approved');
});

test('HTTP web admin dan native memakai kontrak yang sama, route terdaftar di OpenAPI', async () => {
  const port = 3334,
    origin = `http://localhost:${port}`;
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let logs = '';
  server.stdout.on('data', (data) => {
    logs += String(data);
  });
  server.stderr.on('data', (data) => {
    logs += String(data);
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(origin + '/login')).ok) {
          ready = true;
          break;
        }
      } catch {}
      if (server.exitCode !== null) throw new Error(logs);
      await setTimeout(250);
    }
    assert.ok(ready, logs);
    const token = randomUUID();
    sql
      .prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)')
      .run(tokenHash(token), admin.user_id, Date.now() + 3600000);
    const headers = { cookie: `cms_session=${token}`, origin, 'Content-Type': 'application/json' };
    const web = (path: string, method = 'GET', body?: unknown) =>
      fetch(origin + '/api/modules/points/' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    assert.equal((await fetch(origin + '/api/modules/points/options')).status, 401);
    assert.equal((await web('options')).status, 200);
    const html = await (await fetch(origin + '/points', { headers })).text();
    assert.match(html, /Poin &amp; Pembinaan Murid/);
    const configured = await web('rules', 'POST', {
      name: 'Sikap membantu',
      kind: 'appreciation',
      points: 7,
    });
    assert.equal(configured.status, 201);
    const configuredRule = (await configured.json()).data;
    const mobileSession = createMobileSession(reporter.user_id, {});
    const create = await fetch(origin + '/api/v1/points/entries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mobileSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entry(otherPupil, configuredRule.id)),
    });
    assert.equal(create.status, 201);
    const pending = (await create.json()).data;
    assert.equal(pending.status, 'pending');
    const approve = await web(`entries/${pending.id}/approve`, 'POST', {});
    assert.equal(approve.status, 200);
    const totals = await (await web(`summary?semester_id=${term}&student_id=${otherPupil}`)).json();
    assert.equal(totals.data.rows[0].appreciation, 7);
    const spec = await (await fetch(origin + '/api/v1/openapi.json')).json();
    assert.ok(spec.paths['/points/entries'].post.requestBody);
    assert.ok(spec.paths['/points/entries/{id}/attachments/{attachmentId}'].get);
    assert.ok(spec.components.schemas.PointCase);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
  }
});
