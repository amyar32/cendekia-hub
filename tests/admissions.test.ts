import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const directory = mkdtempSync(join(tmpdir(), 'cms-admissions-test-'));
const port = 3321;
const base = `http://localhost:${port}`;
let server: ChildProcess;
let cookie = '';
let logs = '';

async function api(path: string, method = 'GET', body?: unknown, authenticated = true) {
  return fetch(base + path, {
    method,
    headers: {
      origin: base,
      ...(authenticated && cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  const env = {
    ...process.env,
    DATABASE_PATH: join(directory, 'test.sqlite'),
    UPLOAD_STORAGE_PATH: join(directory, 'uploads'),
    SEED_ADMIN_EMAIL: 'admissions@test.local',
    SEED_ADMIN_PASSWORD: 'test-admin-password-123',
    APP_CURRENT_DATE: '2030-01-15',
  };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env });
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout?.on('data', (value) => (logs += String(value)));
  server.stderr?.on('data', (value) => (logs += String(value)));
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(base + '/login')).ok) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await setTimeout(250);
  }
  throw new Error(`Server tidak siap: ${logs}`);
});

after(async () => {
  server?.kill();
  if (server && server.exitCode === null)
    await new Promise((resolve) => server.once('exit', resolve));
  rmSync(directory, { recursive: true, force: true });
});

test('alur penerimaan publik sampai konversi menjadi murid aktif', async () => {
  let response = await api(
    '/api/auth/login',
    'POST',
    {
      email: 'admissions@test.local',
      password: 'test-admin-password-123',
    },
    false,
  );
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];

  response = await api('/api/modules/school', 'PATCH', {
    name: 'Sekolah Penerimaan',
    code: 'SP',
    npsn: '',
    address: '',
    email: '',
    phone: '',
    logo_url: '',
    principal_name: '',
    principal_nip: '',
    principal_signature_url: '',
    timezone: 'Asia/Jakarta',
    is_active: true,
  });
  assert.equal(response.status, 200);
  response = await api('/api/modules/academic-years', 'POST', {
    name: '2030/2031',
    start_date: '2030-01-01',
    end_date: '2031-06-30',
    is_active: true,
  });
  assert.equal(response.status, 201);
  const year = await response.json();
  response = await api('/api/modules/grades', 'POST', {
    name: 'Kelas 1',
    level_order: 1,
    description: '',
    is_active: true,
  });
  assert.equal(response.status, 201);
  const grade = await response.json();
  response = await api('/api/modules/grades', 'POST', {
    name: 'Kelas 2',
    level_order: 2,
    description: '',
    is_active: true,
  });
  assert.equal(response.status, 201);
  const otherGrade = await response.json();
  response = await api('/api/modules/classes', 'POST', {
    academic_year_id: year.id,
    grade_id: grade.id,
    name: '1-A',
    is_active: true,
  });
  assert.equal(response.status, 201);
  const classroom = await response.json();
  response = await api('/api/modules/classes', 'POST', {
    academic_year_id: year.id,
    grade_id: otherGrade.id,
    name: '2-A',
    is_active: true,
  });
  assert.equal(response.status, 201);
  response = await api('/api/modules/students', 'POST', {
    nis: '2030-0007',
    name: 'Murid Existing',
    gender: 'male',
    enrollment_date: '2030-01-02',
    is_active: true,
  });
  assert.equal(response.status, 201);
  response = await api('/api/modules/admissions', 'POST', {
    entity: 'period',
    academic_year_id: year.id,
    name: 'Gelombang Utama',
    start_date: '2030-01-01',
    end_date: '2030-02-28',
    quota: 1,
    status: 'open',
    registration_prefix: 'PMB',
  });
  assert.equal(response.status, 201);
  const period = await response.json();

  response = await api('/api/public/admissions', 'GET', undefined, false);
  assert.equal(response.status, 200);
  const publicData = await response.json();
  const [left, right] = publicData.captcha.question.match(/\d+/g).map(Number);
  response = await api(
    '/api/public/admissions',
    'POST',
    {
      admission_period_id: period.id,
      nik: '1234567890123456',
      nisn: '0099887766',
      name: 'Calon Murid',
      gender: 'female',
      birth_date: '2023-01-10',
      birth_place: 'Bandung',
      family_card_number: '1234567890123456',
      religion: 'Islam',
      citizenship: 'Indonesia',
      child_order: 1,
      sibling_count: 2,
      birth_certificate_number: 'AKTA-001',
      has_special_needs: true,
      special_needs_type: 'Hambatan penglihatan',
      address: 'Jalan Belajar',
      province_code: '32',
      province_name: 'Jawa Barat',
      regency_code: '3273',
      regency_name: 'Kota Bandung',
      district_code: '3273010',
      district_name: 'Sukasari',
      village_code: '3273010001',
      village_name: 'Sukarasa',
      rt: '001',
      rw: '002',
      postal_code: '40152',
      domicile_matches_family_card: true,
      family_card_issued_date: '2029-01-02',
      latitude: -6.873,
      longitude: 107.587,
      home_distance_km: 3.5,
      phone: '08123456789',
      email: '',
      previous_school_name: 'TK Ceria',
      previous_school_npsn: '',
      previous_school_address: '',
      previous_school_last_grade: '',
      previous_school_graduation_year: '',
      target_grade_id: grade.id,
      admission_path: 'Reguler',
      guardians: [
        {
          name: 'Orang Tua Murid',
          nik: '',
          relation: 'Ibu',
          life_status: 'Hidup',
          birth_place: 'Bandung',
          birth_date: '1990-02-03',
          last_education: 'SMA / sederajat',
          occupation: 'Wiraswasta',
          monthly_income: 5000000,
          phone: '08120000000',
          email: '',
          address: '',
          address_matches_student: true,
          is_primary: true,
        },
      ],
      documents: [],
      captcha_token: publicData.captcha.token,
      captcha_answer: left + right,
      website: '',
    },
    false,
  );
  assert.equal(response.status, 201, await response.clone().text());
  const application = await response.json();
  assert.match(application.registration_number, /^PMB-2030-0001$/);
  assert.match(application.tracking_token, /^\d{6}$/);

  response = await api(
    `/api/public/admissions?tracking_token=${application.tracking_token}`,
    'GET',
    undefined,
    false,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).application.status, 'submitted');
  const transitions = ['verified', 'selection', 'accepted', 'reregistered'];
  for (const status of transitions) {
    response = await api('/api/modules/admissions', 'PATCH', {
      entity: 'status',
      id: application.id,
      status,
      notes: `Masuk status ${status}`,
    });
    assert.equal(response.status, 200, `${status}: ${await response.clone().text()}`);
    response = await api(`/api/modules/admissions?id=${application.id}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).application.status, status);
  }
  response = await api(`/api/modules/admissions?id=${application.id}`);
  assert.equal(response.status, 200);
  const conversionDetail = await response.json();
  assert.deepEqual(conversionDetail.application.conversion_class_options, [
    { value: classroom.id, label: '1-A' },
  ]);
  response = await api('/api/modules/admissions', 'POST', {
    entity: 'convert',
    id: application.id,
    class_id: classroom.id,
    enrollment_date: '2030-07-01',
  });
  assert.equal(response.status, 201, await response.clone().text());
  response = await api('/api/modules/students?q=1234567890123456');
  assert.equal(response.status, 200);
  const students = await response.json();
  assert.equal(students.total, 1);
  assert.equal(students.rows[0].nis, '2030-0008');
  assert.equal(students.rows[0].current_class_name, '1-A');
  assert.equal(students.rows[0].family_card_number, '1234567890123456');
  assert.equal(students.rows[0].has_special_needs, 1);
  assert.equal(students.rows[0].special_needs_type, 'Hambatan penglihatan');
  assert.equal(students.rows[0].province_name, 'Jawa Barat');
  assert.equal(students.rows[0].village_name, 'Sukarasa');
  assert.equal(students.rows[0].family_card_issued_date, '2029-01-02');
  assert.equal(students.rows[0].home_distance_km, 3.5);
  assert.equal(students.rows[0].guardians[0].birth_place, 'Bandung');
  assert.equal(students.rows[0].guardians[0].occupation, 'Wiraswasta');
  assert.equal(students.rows[0].guardians[0].monthly_income, 5000000);
  const convertedStudent = students.rows[0];
  response = await api('/api/modules/students', 'PATCH', {
    ...convertedStudent,
    has_special_needs: Boolean(convertedStudent.has_special_needs),
    domicile_matches_family_card: Boolean(convertedStudent.domicile_matches_family_card),
    is_active: Boolean(convertedStudent.is_active),
    guardians: convertedStudent.guardians.map((guardian: Record<string, unknown>) => ({
      ...guardian,
      address_matches_student: Boolean(guardian.address_matches_student),
      is_primary: Boolean(guardian.is_primary),
    })),
  });
  assert.equal(response.status, 200, await response.clone().text());
  response = await api('/api/modules/students?q=1234567890123456');
  const updatedStudents = await response.json();
  assert.equal(updatedStudents.rows[0].province_name, 'Jawa Barat');
  assert.equal(updatedStudents.rows[0].home_distance_km, 3.5);
  assert.equal(updatedStudents.rows[0].guardians[0].occupation, 'Wiraswasta');
  response = await api('/api/modules/students?q=Murid Existing');
  assert.equal(response.status, 200);
  const existingStudents = await response.json();
  assert.equal(existingStudents.rows[0].nis, '2030-0007');
});
