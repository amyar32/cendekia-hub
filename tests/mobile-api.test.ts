import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { hashPassword } from '../src/lib/password';

const directory = mkdtempSync(join(tmpdir(), 'mobile-api-test-'));
const databasePath = join(directory, 'test.sqlite');
const port = 3322;
const base = `http://localhost:${port}`;
let server: ChildProcess;
let logs = '';

const ids = {
  school: randomUUID(),
  year: randomUUID(),
  semester: randomUUID(),
  grade: randomUUID(),
  classroom: randomUUID(),
  subject: randomUUID(),
  teacherUser: randomUUID(),
  teacher: randomUUID(),
  assignment: randomUUID(),
  slot: randomUUID(),
  schedule: randomUUID(),
  student: randomUUID(),
  membership: randomUUID(),
  extracurricular: randomUUID(),
  extracurricularAssignment: randomUUID(),
  extracurricularSlot: randomUUID(),
  extracurricularSchedule: randomUUID(),
  extracurricularParticipant: randomUUID(),
};

async function api(path: string, method = 'GET', body?: unknown, accessToken = '') {
  return fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  const env = {
    ...process.env,
    DATABASE_PATH: databasePath,
    SEED_ADMIN_EMAIL: 'admin@mobile.test',
    SEED_ADMIN_PASSWORD: 'admin-mobile-password-123',
    APP_CURRENT_DATE: '2029-07-02',
    MOBILE_API_CORS_ORIGINS: 'http://localhost:8081',
  };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env });
  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.transaction(() => {
    database
      .prepare("INSERT INTO schools(id,name,code,is_active) VALUES (?,?,'MOBILE',1)")
      .run(ids.school, 'Sekolah Mobile');
    database
      .prepare(
        "INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active) VALUES (?,?,?,'2029-07-01','2030-06-30',1)",
      )
      .run(ids.year, ids.school, '2029/2030');
    database
      .prepare(
        "INSERT INTO semesters(id,academic_year_id,name,period,start_date,end_date,is_active) VALUES (?,?,?,1,'2029-07-01','2029-12-31',1)",
      )
      .run(ids.semester, ids.year, 'Semester 1');
    database
      .prepare('INSERT INTO grades(id,school_id,name,level_order) VALUES (?,?,?,?)')
      .run(ids.grade, ids.school, 'Kelas 7', 7);
    database
      .prepare(
        'INSERT INTO classes(id,school_id,academic_year_id,grade_id,name) VALUES (?,?,?,?,?)',
      )
      .run(ids.classroom, ids.school, ids.year, ids.grade, '7A');
    database
      .prepare('INSERT INTO subjects(id,school_id,code,name) VALUES (?,?,?,?)')
      .run(ids.subject, ids.school, 'MAT', 'Matematika');
    database
      .prepare(
        'INSERT INTO users(id,name,email,password,role_id,must_change_password) VALUES (?,?,?,?,?,1)',
      )
      .run(
        ids.teacherUser,
        'Budi Guru',
        'budi@mobile.test',
        hashPassword('temporary-password-123'),
        'teacher',
      );
    database
      .prepare(
        "INSERT INTO teachers(id,school_id,user_id,employee_code,name,gender,employment_status,email) VALUES (?,?,?,?,?,'male','permanent',?)",
      )
      .run(ids.teacher, ids.school, ids.teacherUser, 'GR-001', 'Budi Guru', 'budi@mobile.test');
    database
      .prepare(
        'INSERT INTO teaching_assignments(id,teacher_id,subject_id,class_id,academic_year_id,semester_id) VALUES (?,?,?,?,?,?)',
      )
      .run(ids.assignment, ids.teacher, ids.subject, ids.classroom, ids.year, ids.semester);
    database
      .prepare(
        "INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order) VALUES (?,?,?,'07:00','08:00',1)",
      )
      .run(ids.slot, ids.school, 'Jam 1');
    database
      .prepare(
        'INSERT INTO class_schedules(id,teaching_assignment_id,semester_id,time_slot_id,weekday) VALUES (?,?,?,?,1)',
      )
      .run(ids.schedule, ids.assignment, ids.semester, ids.slot);
    database
      .prepare(
        "INSERT INTO students(id,school_id,nis,nisn,name,gender,nik) VALUES (?,?,?,?,?,'male','1234567890123456')",
      )
      .run(ids.student, ids.school, 'S-001', '0099999999', 'Andi Murid');
    database
      .prepare(
        "INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,status) VALUES (?,?,?,?,'2029-07-01','active')",
      )
      .run(ids.membership, ids.student, ids.classroom, ids.year);
    database
      .prepare('INSERT INTO extracurriculars(id,school_id,code,name,category) VALUES (?,?,?,?,?)')
      .run(ids.extracurricular, ids.school, 'BASKET', 'Bola Basket', 'Olahraga');
    database
      .prepare(
        "INSERT INTO extracurricular_assignments(id,extracurricular_id,teacher_id,academic_year_id,semester_id,location,status) VALUES (?,?,?,?,?,?,'active')",
      )
      .run(
        ids.extracurricularAssignment,
        ids.extracurricular,
        ids.teacher,
        ids.year,
        ids.semester,
        'Lapangan',
      );
    database
      .prepare(
        "INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order) VALUES (?,?,?,'15:00','16:00',2)",
      )
      .run(ids.extracurricularSlot, ids.school, 'Ekstrakurikuler');
    database
      .prepare(
        'INSERT INTO extracurricular_schedules(id,assignment_id,semester_id,time_slot_id,weekday) VALUES (?,?,?,?,1)',
      )
      .run(
        ids.extracurricularSchedule,
        ids.extracurricularAssignment,
        ids.semester,
        ids.extracurricularSlot,
      );
    database
      .prepare(
        'INSERT INTO extracurricular_participants(id,assignment_id,student_id) VALUES (?,?,?)',
      )
      .run(ids.extracurricularParticipant, ids.extracurricularAssignment, ids.student);
  })();
  database.close();

  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout?.on('data', (chunk) => (logs += String(chunk)));
  server.stderr?.on('data', (chunk) => (logs += String(chunk)));
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(base + '/login');
      if (response.ok) return;
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

test('mobile API accepts an allowed browser origin and its preflight', async () => {
  const origin = 'http://localhost:8081';
  const preflight = await fetch(base + '/api/v1/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, PUT, OPTIONS');
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');

  const response = await fetch(base + '/api/v1/me', { headers: { Origin: origin } });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});

test('mobile teacher authentication and attendance flow', async () => {
  let response = await api('/api/v1/me');
  assert.equal(response.status, 401);

  response = await api('/api/v1/auth/login', 'POST', {
    email: 'budi@mobile.test',
    password: 'temporary-password-123',
    device_id: 'test-device',
    device_name: 'Test Phone',
  });
  assert.equal(response.status, 200);
  let login = (await response.json()).data;
  assert.equal(login.actor.type, 'teacher');
  assert.equal(login.actor.id, ids.teacher);
  assert.equal(login.must_change_password, true);

  response = await api('/api/v1/me', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.user.must_change_password, true);
  response = await api('/api/v1/me/schedule', 'GET', undefined, login.access_token);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'PASSWORD_CHANGE_REQUIRED');

  response = await api(
    '/api/v1/auth/password',
    'POST',
    { current_password: 'temporary-password-123', new_password: 'new-mobile-password-123' },
    login.access_token,
  );
  assert.equal(response.status, 200);
  login = (await response.json()).data;

  response = await api('/api/v1/me/schedule?date=2029-07-02', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  const combinedSchedule = (await response.json()).data.schedules;
  assert.equal(combinedSchedule.length, 2);
  assert.deepEqual(
    combinedSchedule.map((entry: { type: string }) => entry.type),
    ['lesson', 'extracurricular'],
  );

  response = await api('/api/v1/classes', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.classes[0].id, ids.classroom);
  response = await api(
    `/api/v1/classes/${ids.classroom}/students`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const student = (await response.json()).data.students[0];
  assert.equal(student.id, ids.student);
  assert.equal('nik' in student, false);

  const attendanceInput = { schedule_id: ids.schedule, attendance_date: '2029-07-02' };
  response = await api('/api/v1/attendance-sessions', 'POST', attendanceInput, login.access_token);
  assert.equal(response.status, 201);
  const sessionId = (await response.json()).data.id;
  response = await api('/api/v1/attendance-sessions', 'POST', attendanceInput, login.access_token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.id, sessionId);

  response = await api(
    `/api/v1/attendance-sessions/${sessionId}`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const recordId = (await response.json()).data.records[0].id;
  response = await api(
    `/api/v1/attendance-sessions/${sessionId}/records`,
    'PUT',
    { records: [{ id: recordId, status: 'present', note: '' }] },
    login.access_token,
  );
  assert.equal(response.status, 200);
  response = await api(
    `/api/v1/attendance-sessions/${sessionId}/close`,
    'POST',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  response = await api(
    `/api/v1/attendance-sessions/${sessionId}/records`,
    'PUT',
    { records: [{ id: recordId, status: 'late', note: '' }] },
    login.access_token,
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'SESSION_CLOSED');

  response = await api('/api/v1/extracurriculars', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  const extracurricular = (await response.json()).data.extracurriculars[0];
  assert.equal(extracurricular.assignment_id, ids.extracurricularAssignment);
  assert.equal(extracurricular.participant_count, 1);
  assert.equal(extracurricular.schedules[0].schedule_id, ids.extracurricularSchedule);
  response = await api(
    `/api/v1/extracurriculars/${ids.extracurricularAssignment}/participants`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const participant = (await response.json()).data.participants[0];
  assert.equal(participant.id, ids.student);
  assert.equal('nik' in participant, false);

  const extracurricularAttendanceInput = {
    schedule_id: ids.extracurricularSchedule,
    attendance_date: '2029-07-02',
  };
  response = await api(
    '/api/v1/extracurricular-attendance-sessions',
    'POST',
    extracurricularAttendanceInput,
    login.access_token,
  );
  assert.equal(response.status, 201);
  const extracurricularSessionId = (await response.json()).data.id;
  response = await api(
    '/api/v1/extracurricular-attendance-sessions',
    'POST',
    extracurricularAttendanceInput,
    login.access_token,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.id, extracurricularSessionId);
  response = await api(
    '/api/v1/extracurricular-attendance-sessions?date=2029-07-02',
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.sessions[0].session_id, extracurricularSessionId);
  response = await api(
    `/api/v1/extracurricular-attendance-sessions/${extracurricularSessionId}`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const extracurricularRecordId = (await response.json()).data.records[0].id;
  response = await api(
    `/api/v1/extracurricular-attendance-sessions/${extracurricularSessionId}/records`,
    'PUT',
    { records: [{ id: extracurricularRecordId, status: 'present', note: '' }] },
    login.access_token,
  );
  assert.equal(response.status, 200);
  response = await api(
    `/api/v1/extracurricular-attendance-sessions/${extracurricularSessionId}/close`,
    'POST',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  response = await api(
    `/api/v1/extracurricular-attendance-sessions/${extracurricularSessionId}/records`,
    'PUT',
    { records: [{ id: extracurricularRecordId, status: 'late', note: '' }] },
    login.access_token,
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'SESSION_CLOSED');

  const oldAccessToken = login.access_token;
  const oldRefreshToken = login.refresh_token;
  response = await api('/api/v1/auth/refresh', 'POST', { refresh_token: oldRefreshToken });
  assert.equal(response.status, 200);
  login = (await response.json()).data;
  assert.equal((await api('/api/v1/me', 'GET', undefined, oldAccessToken)).status, 401);
  assert.equal(
    (await api('/api/v1/auth/refresh', 'POST', { refresh_token: oldRefreshToken })).status,
    401,
  );
  assert.equal((await api('/api/v1/me', 'GET', undefined, login.access_token)).status, 200);
  assert.equal(
    (await api('/api/v1/auth/logout', 'POST', undefined, login.access_token)).status,
    200,
  );
  assert.equal((await api('/api/v1/me', 'GET', undefined, login.access_token)).status, 401);
});
