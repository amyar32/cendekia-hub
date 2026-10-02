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
  homeroomAssignment: randomUUID(),
  assignment: randomUUID(),
  slot: randomUUID(),
  schedule: randomUUID(),
  student: randomUUID(),
  membership: randomUUID(),
  guardian: randomUUID(),
  extracurricular: randomUUID(),
  extracurricularAssignment: randomUUID(),
  extracurricularSlot: randomUUID(),
  extracurricularSchedule: randomUUID(),
  extracurricularParticipant: randomUUID(),
  tahfidzSlot: randomUUID(),
  tahfidzGroup: randomUUID(),
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
        'INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id) VALUES (?,?,?,?)',
      )
      .run(ids.homeroomAssignment, ids.teacher, ids.classroom, ids.year);
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
      .prepare(
        "INSERT INTO guardians(id,student_id,name,relation,phone,email,is_primary,nik,address) VALUES (?,?,?,'mother',?, ?,1,'3200000000000000','Alamat rahasia')",
      )
      .run(ids.guardian, ids.student, 'Ibu Andi', '08123456789', 'ibu.andi@example.test');
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
    database
      .prepare(
        "INSERT INTO schedule_time_slots(id,school_id,name,start_time,end_time,slot_order) VALUES (?,?,?,'09:00','10:00',3)",
      )
      .run(ids.tahfidzSlot, ids.school, 'Tahfidz');
    database
      .prepare(
        "INSERT INTO tahfidz_groups(id,school_id,name,teacher_id,academic_year_id,semester_id,time_slot_id,weekday,weekdays,location,status) VALUES (?,?,?,?,?,?,?,1,'[1]','Ruang Tahfidz','active')",
      )
      .run(
        ids.tahfidzGroup,
        ids.school,
        'Kelompok A',
        ids.teacher,
        ids.year,
        ids.semester,
        ids.tahfidzSlot,
      );
    database
      .prepare('INSERT INTO tahfidz_group_members(id,group_id,student_id) VALUES (?,?,?)')
      .run(randomUUID(), ids.tahfidzGroup, ids.student);
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
  assert.equal(
    preflight.headers.get('access-control-allow-methods'),
    'GET, POST, PUT, PATCH, OPTIONS',
  );
  assert.equal(
    preflight.headers.get('access-control-allow-headers'),
    'Authorization, Content-Type',
  );

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
  assert.equal(combinedSchedule.length, 3);
  assert.deepEqual(
    combinedSchedule.map((entry: { type: string }) => entry.type),
    ['lesson', 'tahfidz', 'extracurricular'],
  );
  assert.equal(combinedSchedule[1].schedule_id, ids.tahfidzGroup);
  assert.equal(combinedSchedule[1].group_name, 'Kelompok A');
  assert.equal(combinedSchedule[1].teacher_name, 'Budi Guru');
  assert.equal(combinedSchedule[1].student_count, 1);
  assert.equal(combinedSchedule[1].attendance_session_id, null);
  const tahfidzDb = new Database(databasePath);
  const archivedYearId = randomUUID(),
    archivedGroupId = randomUUID();
  try {
    tahfidzDb
      .prepare(
        "INSERT INTO academic_years(id,school_id,name,start_date,end_date) VALUES(?,?,'2028/2029','2028-07-01','2029-06-30')",
      )
      .run(archivedYearId, ids.school);
    tahfidzDb
      .prepare(
        "INSERT INTO tahfidz_groups(id,school_id,name,teacher_id,academic_year_id,time_slot_id,weekday,weekdays,status) VALUES(?,?,'Kelompok tahun lama',?,?,?,1,'[1]','active')",
      )
      .run(archivedGroupId, ids.school, ids.teacher, archivedYearId, ids.tahfidzSlot);
    response = await api(
      '/api/v1/tahfidz/sessions?date=2029-07-02',
      'GET',
      undefined,
      login.access_token,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).data.sessions.map((row: { group_id: string }) => row.group_id),
      [ids.tahfidzGroup],
    );
    response = await api(
      '/api/v1/tahfidz/sessions?date=2028-06-26',
      'GET',
      undefined,
      login.access_token,
    );
    assert.deepEqual((await response.json()).data.sessions, []);
    response = await api(
      '/api/v1/me/schedule?date=2028-06-26',
      'GET',
      undefined,
      login.access_token,
    );
    assert.ok(
      (await response.json()).data.schedules.every(
        (row: { type: string }) => row.type !== 'tahfidz',
      ),
    );
    response = await api(
      '/api/v1/tahfidz/sessions',
      'POST',
      { schedule_id: ids.tahfidzGroup, attendance_date: '2028-06-26' },
      login.access_token,
    );
    assert.equal(response.status, 400);
    assert.equal(
      (await api('/api/v1/tahfidz/sessions?date=2029-02-30', 'GET', undefined, login.access_token))
        .status,
      400,
    );
  } finally {
    tahfidzDb.prepare('DELETE FROM tahfidz_groups WHERE id=?').run(archivedGroupId);
    tahfidzDb.prepare('DELETE FROM academic_years WHERE id=?').run(archivedYearId);
    tahfidzDb.close();
  }

  assert.equal((await api('/api/v1/attendances')).status, 401);
  response = await api('/api/v1/attendances', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  const subjectData = (await response.json()).data;
  assert.equal(subjectData.academic_year.id, ids.year);
  assert.equal(subjectData.subjects.length, 1);
  assert.equal(subjectData.subjects[0].assignment_id, ids.assignment);
  assert.equal(subjectData.subjects[0].subject_id, ids.subject);
  assert.equal(subjectData.subjects[0].class_id, ids.classroom);
  assert.equal(subjectData.subjects[0].student_count, 1);
  assert.equal(subjectData.subjects[0].schedules[0].schedule_id, ids.schedule);

  const assignmentDatabase = new Database(databasePath);
  try {
    assignmentDatabase
      .prepare("UPDATE class_schedules SET archived_at=datetime('now') WHERE id=?")
      .run(ids.schedule);
    response = await api('/api/v1/attendances', 'GET', undefined, login.access_token);
    const withoutSchedule = (await response.json()).data.subjects;
    assert.equal(withoutSchedule.length, 1);
    assert.deepEqual(withoutSchedule[0].schedules, []);
    assignmentDatabase.prepare('UPDATE subjects SET is_active=0 WHERE id=?').run(ids.subject);
    response = await api('/api/v1/attendances', 'GET', undefined, login.access_token);
    assert.deepEqual((await response.json()).data.subjects, []);
    assignmentDatabase.prepare('UPDATE subjects SET is_active=1 WHERE id=?').run(ids.subject);
    assignmentDatabase
      .prepare('UPDATE teaching_assignments SET semester_id=NULL WHERE id=?')
      .run(ids.assignment);
    response = await api('/api/v1/attendances', 'GET', undefined, login.access_token);
    assert.equal((await response.json()).data.subjects[0].semester_name, 'Semua Semester');
  } finally {
    assignmentDatabase.prepare('UPDATE subjects SET is_active=1 WHERE id=?').run(ids.subject);
    assignmentDatabase
      .prepare('UPDATE teaching_assignments SET semester_id=? WHERE id=?')
      .run(ids.semester, ids.assignment);
    assignmentDatabase
      .prepare('UPDATE class_schedules SET archived_at=NULL WHERE id=?')
      .run(ids.schedule);
    assignmentDatabase.close();
  }

  response = await api('/api/v1/classes', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  const accessibleClass = (await response.json()).data.classes[0];
  assert.equal(accessibleClass.id, ids.classroom);
  assert.equal(accessibleClass.is_homeroom, 1);
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

  response = await api('/api/v1/me/homeroom', 'GET', undefined, login.access_token);
  assert.equal(response.status, 200);
  const homeroom = (await response.json()).data;
  assert.equal(homeroom.is_homeroom_teacher, true);
  assert.equal(homeroom.homeroom.class_id, ids.classroom);

  response = await api(
    '/api/v1/homeroom/dashboard?date=2029-07-02',
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  let homeroomDashboard = (await response.json()).data;
  assert.equal(homeroomDashboard.summary.total_students, 1);
  assert.equal(homeroomDashboard.summary.unrecorded_lessons, 1);
  assert.equal(homeroomDashboard.summary.not_checked_in, 1);

  response = await api(
    `/api/v1/homeroom/students/${ids.student}`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const homeroomStudent = (await response.json()).data;
  assert.equal(homeroomStudent.guardians[0].phone, '08123456789');
  assert.equal('nik' in homeroomStudent.student, false);
  assert.equal('address' in homeroomStudent.student, false);
  assert.equal('nik' in homeroomStudent.guardians[0], false);
  assert.equal('address' in homeroomStudent.guardians[0], false);

  response = await api(
    '/api/v1/homeroom/follow-ups',
    'POST',
    {
      student_id: ids.student,
      category: 'attendance',
      note: 'Hubungi wali terkait keterlambatan.',
      due_date: '2029-07-05',
    },
    login.access_token,
  );
  assert.equal(response.status, 201);
  const followUpId = (await response.json()).data.id;
  response = await api(
    '/api/v1/homeroom/follow-ups?status=open',
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.follow_ups[0].id, followUpId);
  response = await api(
    `/api/v1/homeroom/follow-ups/${followUpId}`,
    'PATCH',
    { status: 'resolved' },
    login.access_token,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, 'resolved');

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
    `/api/v1/homeroom/attendance-sessions/${sessionId}`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const homeroomSession = (await response.json()).data;
  assert.equal(homeroomSession.session.id, sessionId);
  assert.equal(homeroomSession.records[0].student_id, ids.student);
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

  const homeroomDatabase = new Database(databasePath);
  try {
    homeroomDatabase
      .prepare(
        "INSERT INTO student_checkins(id,school_id,student_id,attendance_date,status,source,recorded_by) VALUES (?,?,?,'2029-07-02','present','card',?)",
      )
      .run(randomUUID(), ids.school, ids.student, ids.teacherUser);
  } finally {
    homeroomDatabase.close();
  }
  response = await api(
    '/api/v1/homeroom/dashboard?date=2029-07-02',
    'GET',
    undefined,
    login.access_token,
  );
  homeroomDashboard = (await response.json()).data;
  assert.equal(homeroomDashboard.summary.on_time, 1);
  assert.equal(homeroomDashboard.summary.closed_lessons, 1);
  response = await api(
    `/api/v1/homeroom/attendance?from=2029-07-01&to=2029-07-31&student_id=${ids.student}`,
    'GET',
    undefined,
    login.access_token,
  );
  assert.equal(response.status, 200);
  const attendanceSummary = (await response.json()).data.students[0];
  assert.equal(attendanceSummary.checkin_present, 1);
  assert.equal(attendanceSummary.lesson_present, 1);

  const assignmentDatabaseForAccess = new Database(databasePath);
  try {
    assignmentDatabaseForAccess
      .prepare('DELETE FROM homeroom_assignments WHERE id=?')
      .run(ids.homeroomAssignment);
    response = await api('/api/v1/me/homeroom', 'GET', undefined, login.access_token);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.is_homeroom_teacher, false);
    response = await api(
      '/api/v1/homeroom/dashboard?date=2029-07-02',
      'GET',
      undefined,
      login.access_token,
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'HOMEROOM_NOT_ASSIGNED');
    response = await api(
      `/api/v1/homeroom/attendance-sessions/${sessionId}`,
      'GET',
      undefined,
      login.access_token,
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'HOMEROOM_NOT_ASSIGNED');
  } finally {
    assignmentDatabaseForAccess
      .prepare(
        'INSERT INTO homeroom_assignments(id,teacher_id,class_id,academic_year_id) VALUES (?,?,?,?)',
      )
      .run(ids.homeroomAssignment, ids.teacher, ids.classroom, ids.year);
    assignmentDatabaseForAccess.close();
  }

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
