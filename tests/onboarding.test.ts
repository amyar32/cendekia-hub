import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

const directory = mkdtempSync(join(tmpdir(), 'cendekia-onboarding-test-'));
const port = 3318;
const base = `http://localhost:${port}`;
let server: ChildProcess;
let cookie = '';
let logs = '';

async function api(path: string, method = 'GET', body?: unknown) {
  return fetch(base + path, {
    method,
    headers: { origin: base, cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  const env = {
    ...process.env,
    DATABASE_PATH: join(directory, 'onboarding.sqlite'),
    UPLOAD_STORAGE_PATH: join(directory, 'uploads'),
    SEED_ADMIN_EMAIL: 'onboarding@test.local',
    SEED_ADMIN_PASSWORD: 'onboarding-password-123',
  };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env });
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout?.on('data', (data) => (logs += String(data)));
  server.stderr?.on('data', (data) => (logs += String(data)));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await setTimeout(250);
  }
  const response = await api('/api/auth/login', 'POST', {
    email: 'onboarding@test.local',
    password: 'onboarding-password-123',
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
});

after(async () => {
  server?.kill();
  if (server && server.exitCode === null)
    await new Promise((resolve) => server.once('exit', resolve));
  rmSync(directory, { recursive: true, force: true });
});

test('wizard onboarding SD, preview Excel, dan import data simulasi', async () => {
  let response = await api('/api/modules/onboarding');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).school, null);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'profile',
    education_level: 'sd',
    name: 'SD Uji Cendekia',
    code: 'SDUC',
    npsn: '12345678',
    address: 'Jalan Pendidikan Nomor 1',
    email: '',
    phone: '',
    logo_url: '',
    principal_nip: '',
    principal_signature_url: '',
    timezone: 'Asia/Jakarta',
  });
  assert.equal(response.status, 400);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'profile',
    education_level: 'sd',
    name: 'SD Uji Cendekia',
    code: 'SDUC',
    npsn: '12345678',
    address: 'Jalan Pendidikan Nomor 1',
    email: 'admin@sd-uji.test',
    phone: '0215550101',
    logo_url: '',
    principal_name: 'Dr. Kepala Sekolah',
    principal_nip: '198001012005011001',
    principal_signature_url: '',
    timezone: 'Asia/Jakarta',
  });
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.school.principal_name, 'Dr. Kepala Sekolah');
  assert.equal(state.school.principal_nip, '198001012005011001');

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'grades',
    education_level: 'sd',
    grades: Array.from({ length: 6 }, (_, index) => ({
      name: `Kelas ${index + 1}`,
      level_order: index + 1,
      description: `Tingkat ${index + 1} SD`,
    })),
  });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.grades.length, 6);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'master_data',
    subjects: [
      {
        code: 'MAT',
        name: 'Matematika',
        category: 'Wajib',
        description: 'Numerasi dasar',
      },
    ],
    extracurriculars: [
      {
        code: 'PRAMUKA',
        name: 'Pramuka',
        category: 'Kepanduan',
        description: 'Program kepanduan sekolah',
        is_required: true,
      },
    ],
  });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.subjects.length, 1);
  assert.equal(state.extracurriculars.length, 1);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'academic',
    year: {
      name: '2026/2027',
      start_date: '2026-07-01',
      end_date: '2027-06-30',
      semesters: [
        {
          name: 'Semester Ganjil',
          period: 1,
          start_date: '2026-07-01',
          end_date: '2026-12-31',
          is_active: true,
        },
        {
          name: 'Semester Genap',
          period: 2,
          start_date: '2027-01-01',
          end_date: '2027-06-30',
          is_active: false,
        },
      ],
      classrooms: state.grades.map((grade: { id: string; name: string }) => ({
        grade_id: grade.id,
        name: grade.name.replace('Kelas ', ''),
        capacity: 32,
      })),
    },
  });
  assert.equal(response.status, 200);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'schedule',
    checkin_late_after: '07:10',
    weekdays: [1, 2, 3, 4, 5],
    slots: [
      {
        name: 'Jam ke-1',
        start_time: '07:00',
        end_time: '07:35',
        slot_order: 1,
        is_break: false,
      },
      {
        name: 'Istirahat',
        start_time: '07:35',
        end_time: '07:50',
        slot_order: 2,
        is_break: true,
      },
    ],
  });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.school.checkin_late_after, '07:10');

  response = await api('/api/modules/onboarding/import?level=sd&simulation=1');
  assert.equal(response.status, 200);
  const workbook = await response.arrayBuffer();
  assert.ok(workbook.byteLength > 10_000);
  const form = new FormData();
  form.set(
    'file',
    new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'simulasi-sd.xlsx',
  );
  response = await fetch(`${base}/api/modules/onboarding/import`, {
    method: 'POST',
    headers: { origin: base, cookie },
    body: form,
  });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.summary.total, 65);
  assert.equal(preview.summary.error, 0);
  assert.equal(preview.summary.warning, 0);

  response = await api('/api/modules/onboarding/import', 'POST', {
    action: 'commit',
    rows: preview.rows,
  });
  assert.equal(response.status, 200);
  const imported = await response.json();
  assert.deepEqual(imported.created, {
    teachers: 15,
    students: 50,
    placements: 50,
  });

  state = await (await api('/api/modules/onboarding')).json();
  assert.equal(state.counts.teachers, 15);
  assert.equal(state.counts.students, 50);
  assert.equal(state.readiness.schedules, false);
  response = await api('/api/modules/onboarding', 'POST', {
    action: 'assignments',
    teaching_assignments: [
      {
        teacher_id: state.teachers[0].id,
        subject_id: state.subjects[0].id,
        class_id: state.active_year.classrooms[0].id,
        semester_id: 'all',
      },
    ],
    homeroom_assignments: [
      {
        teacher_id: state.teachers[1].id,
        class_id: state.active_year.classrooms[0].id,
      },
    ],
    extracurricular_assignments: [
      {
        extracurricular_id: state.extracurriculars[0].id,
        teacher_id: state.teachers[0].id,
        semester_id: 'all',
        location: 'Lapangan sekolah',
        quota: 32,
        status: 'active',
        student_ids: [state.students[0].id],
      },
    ],
  });
  assert.equal(response.status, 400);

  response = await api('/api/modules/onboarding', 'POST', {
    action: 'assignments',
    teaching_assignments: [
      {
        teacher_id: state.teachers[0].id,
        subject_id: state.subjects[0].id,
        class_id: state.active_year.classrooms[0].id,
        semester_id: 'all',
      },
    ],
    homeroom_assignments: state.active_year.classrooms.map(
      (classroom: { id: string }, index: number) => ({
        teacher_id: state.teachers[index + 1].id,
        class_id: classroom.id,
      }),
    ),
    extracurricular_assignments: [
      {
        extracurricular_id: state.extracurriculars[0].id,
        teacher_id: state.teachers[0].id,
        semester_id: 'all',
        location: 'Lapangan sekolah',
        quota: 0,
        student_ids: [],
      },
    ],
  });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.counts.teaching_assignments, 1);
  assert.equal(state.counts.homeroom_assignments, 6);
  assert.equal(state.counts.extracurricular_assignments, 1);
  assert.equal(state.extracurricular_assignments[0].status, 'active');
  assert.deepEqual(
    [...state.extracurricular_assignments[0].student_ids].sort(),
    state.students.map((student: { id: string }) => student.id).sort(),
  );
  assert.equal(state.readiness.teaching_assignments, true);
  assert.equal(state.readiness.homeroom_assignments, true);
  assert.equal(state.readiness.extracurricular_assignments, true);
  assert.equal((await api('/api/modules/onboarding', 'POST', { action: 'complete' })).status, 409);
});
