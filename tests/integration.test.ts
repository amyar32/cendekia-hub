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
async function uploadApi(
  bytes: Uint8Array,
  mimeType: string,
  cookie = adminCookie,
  origin = base,
  scope = 'school.logo',
) {
  const body = new FormData();
  body.set('scope', scope);
  body.set('file', new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }), 'logo.png');
  return fetch(base + '/api/uploads', {
    method: 'POST',
    headers: { origin, cookie },
    body,
  });
}
before(async () => {
  const env = {
    ...process.env,
    DATABASE_PATH: join(dir, 'test.sqlite'),
    UPLOAD_STORAGE_PATH: join(dir, 'uploads'),
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
  assert.equal((await api('/api/modules/school', 'GET', undefined, '')).status, 401);
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
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  assert.equal((await uploadApi(png, 'image/png', '')).status, 401);
  assert.equal(
    (await uploadApi(png, 'image/png', adminCookie, 'https://evil.example')).status,
    403,
  );
  assert.equal((await uploadApi(new Uint8Array([1, 2, 3]), 'image/png')).status, 415);
  res = await uploadApi(png, 'image/png');
  assert.equal(res.status, 201);
  const uploadedLogo = (await res.json()).upload;
  assert.match(uploadedLogo.url, /^\/api\/uploads\/[0-9a-f-]{36}$/);
  res = await fetch(base + uploadedLogo.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);
  assert.equal(
    (
      await api(
        '/api/modules/school',
        'PATCH',
        { name: 'Sekolah Ditolak', timezone: 'Asia/Jakarta' },
        adminCookie,
        'https://evil.example',
      )
    ).status,
    403,
  );
  res = await api('/api/modules/school', 'PATCH', {
    name: 'SMA Cendekia Utama',
    code: 'SCU',
    npsn: '12345678',
    address: 'Jalan Pendidikan 1',
    email: 'halo@cendekia.test',
    phone: '+62 21 555 0101',
    logo_url: uploadedLogo.url,
    timezone: 'Asia/Jakarta',
    is_active: true,
  });
  assert.equal(res.status, 200);
  const createdSchool = (await res.json()).school;
  assert.equal(createdSchool.name, 'SMA Cendekia Utama');
  assert.equal(createdSchool.is_active, 1);
  assert.equal(createdSchool.logo_url, uploadedLogo.url);
  assert.equal(
    (
      await api('/api/modules/school', 'PATCH', {
        name: 'Logo invalid',
        logo_url: '/api/uploads/00000000-0000-4000-8000-000000000000',
        timezone: 'Asia/Jakarta',
      })
    ).status,
    400,
  );
  res = await api('/api/modules/school', 'PATCH', {
    name: 'SMA Cendekia Baru',
    code: 'SCB',
    npsn: '12345678',
    address: '',
    email: '',
    phone: '',
    logo_url: '',
    timezone: 'Asia/Makassar',
    is_active: false,
  });
  assert.equal(res.status, 200);
  const updatedSchool = (await res.json()).school;
  assert.equal(updatedSchool.id, createdSchool.id);
  assert.equal(updatedSchool.name, 'SMA Cendekia Baru');
  assert.equal(updatedSchool.is_active, 0);
  assert.equal(
    (
      await api('/api/modules/academic-years', 'POST', {
        name: 'Tidak valid',
        start_date: '2027-07-01',
        end_date: '2026-06-30',
        is_active: false,
      })
    ).status,
    400,
  );
  res = await api('/api/modules/academic-years', 'POST', {
    name: '2025/2026',
    start_date: '2025-07-01',
    end_date: '2026-06-30',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const firstAcademicYear = await res.json();
  res = await api('/api/modules/academic-years', 'POST', {
    name: '2026/2027',
    start_date: '2026-07-01',
    end_date: '2027-06-30',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const secondAcademicYear = await res.json();
  res = await api('/api/modules/academic-years');
  const academicYears = await res.json();
  assert.equal(academicYears.total, 2);
  assert.equal(academicYears.rows[0].id, secondAcademicYear.id);
  assert.equal(
    academicYears.rows.find((row: { id: string }) => row.id === firstAcademicYear.id).is_active,
    0,
  );
  assert.equal(
    academicYears.rows.find((row: { id: string }) => row.id === secondAcademicYear.id).is_active,
    1,
  );
  assert.equal(
    (
      await api(
        '/api/modules/academic-years',
        'PATCH',
        {
          id: secondAcademicYear.id,
          name: '2026/2027 revisi',
          start_date: '2026-07-13',
          end_date: '2027-06-30',
          is_active: true,
        },
        adminCookie,
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api('/api/modules/academic-years', 'PATCH', {
        id: secondAcademicYear.id,
        name: '2026/2027 revisi',
        start_date: '2026-07-13',
        end_date: '2027-06-30',
        is_active: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api('/api/modules/semesters', 'POST', {
        academic_year_id: secondAcademicYear.id,
        name: 'Di luar tahun ajaran',
        period: 1,
        start_date: '2026-06-01',
        end_date: '2026-12-31',
        is_active: false,
      })
    ).status,
    400,
  );
  res = await api('/api/modules/semesters', 'POST', {
    academic_year_id: secondAcademicYear.id,
    name: 'Semester Ganjil',
    period: 1,
    start_date: '2026-07-13',
    end_date: '2026-12-31',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const semester = await res.json();
  assert.equal(
    (
      await api('/api/modules/semesters', 'POST', {
        academic_year_id: secondAcademicYear.id,
        name: 'Semester Bertabrakan',
        period: 2,
        start_date: '2026-12-15',
        end_date: '2027-06-15',
      })
    ).status,
    400,
  );
  res = await api('/api/modules/grades', 'POST', {
    name: 'Kelas 7',
    level_order: 7,
    description: 'Tingkat pertama SMP',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const grade = await res.json();
  res = await api('/api/modules/classes', 'POST', {
    academic_year_id: secondAcademicYear.id,
    grade_id: grade.id,
    name: '7A',
    capacity: 32,
    is_active: true,
  });
  assert.equal(res.status, 201);
  const classroom = await res.json();
  res = await api('/api/modules/classes?q=7A');
  const classrooms = await res.json();
  assert.equal(classrooms.total, 1);
  assert.equal(classrooms.rows[0].grade_name, 'Kelas 7');
  assert.equal(classrooms.rows[0].academic_year_name, '2026/2027 revisi');
  assert.ok(classrooms.options.academic_year_id.length >= 2);
  assert.ok(
    classrooms.options.grade_id.some((option: { value: string }) => option.value === grade.id),
  );
  assert.equal(
    (
      await api('/api/modules/classes', 'PATCH', {
        id: classroom.id,
        academic_year_id: secondAcademicYear.id,
        grade_id: '00000000-0000-4000-8000-000000000000',
        name: '7A',
        capacity: 30,
        is_active: true,
      })
    ).status,
    400,
  );
  res = await api('/api/modules/subjects', 'POST', {
    code: 'mat',
    name: 'Matematika',
    category: 'Wajib',
    description: 'Mata pelajaran wajib',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const subject = await res.json();
  assert.equal(
    (
      await api('/api/modules/subjects', 'PATCH', {
        id: subject.id,
        code: 'mat-01',
        name: 'Matematika',
        category: 'Wajib',
        description: '',
        is_active: true,
      })
    ).status,
    200,
  );
  res = await api('/api/modules/subjects?q=MAT-01');
  assert.equal((await res.json()).total, 1);
  res = await api('/api/modules/teachers', 'POST', {
    user_id: '',
    photo_url: '',
    employee_code: 'gr-001',
    nip: '198801012020121001',
    name: 'Budi Santoso',
    gender: 'male',
    birth_date: '1988-01-01',
    phone: '081234567890',
    email: 'budi@cendekia.test',
    address: 'Jalan Pendidikan 2',
    join_date: '2020-07-01',
    employment_status: 'permanent',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const teacher = await res.json();
  res = await uploadApi(png, 'image/png', adminCookie, base, 'teacher.photo');
  assert.equal(res.status, 201);
  const teacherPhoto = (await res.json()).upload;
  assert.equal((await fetch(base + teacherPhoto.url)).status, 401);
  assert.equal(
    (
      await api('/api/modules/teachers', 'PATCH', {
        id: teacher.id,
        user_id: '',
        photo_url: teacherPhoto.url,
        employee_code: 'GR-001',
        nip: '198801012020121001',
        name: 'Budi Santoso',
        gender: 'male',
        birth_date: '1988-01-01',
        phone: '081234567890',
        email: 'budi@cendekia.test',
        address: 'Jalan Pendidikan 2',
        join_date: '2020-07-01',
        employment_status: 'permanent',
        is_active: true,
      })
    ).status,
    200,
  );
  assert.equal((await api(teacherPhoto.url)).status, 200);
  res = await api('/api/modules/teachers?q=Budi');
  const teachers = await res.json();
  assert.equal(teachers.total, 1);
  assert.equal(teachers.rows[0].employee_code, 'GR-001');
  assert.equal(teachers.rows[0].gender_label, 'Laki-laki');
  assert.equal(teachers.rows[0].photo_url, teacherPhoto.url);
  res = await api('/api/modules/teaching-assignments', 'POST', {
    teacher_id: teacher.id,
    subject_id: subject.id,
    class_id: classroom.id,
    semester_id: semester.id,
  });
  assert.equal(res.status, 201);
  const teachingAssignment = await res.json();
  res = await api('/api/modules/homeroom-assignments', 'POST', {
    teacher_id: teacher.id,
    class_id: classroom.id,
  });
  assert.equal(res.status, 201);
  const homeroomAssignment = await res.json();
  res = await api('/api/modules/teaching-assignments?q=Matematika');
  assert.equal((await res.json()).total, 1);
  res = await api('/api/modules/teaching-assignments', 'POST', {
    teacher_id: teacher.id,
    subject_id: subject.id,
    class_id: classroom.id,
    semester_id: 'all',
  });
  assert.equal(res.status, 201);
  const annualTeachingAssignment = await res.json();
  res = await api('/api/modules/teaching-assignments?q=Matematika');
  const teachingAssignments = await res.json();
  assert.equal(teachingAssignments.total, 2);
  assert.ok(
    teachingAssignments.rows.some(
      (row: { semester_name: string }) => row.semester_name === 'Semua Semester',
    ),
  );
  res = await api('/api/modules/semesters', 'POST', {
    academic_year_id: secondAcademicYear.id,
    name: 'Semester Genap',
    period: 2,
    start_date: '2027-01-01',
    end_date: '2027-06-30',
    is_active: false,
  });
  assert.equal(res.status, 201);
  const secondSemester = await res.json();
  res = await api('/api/modules/schedule-time-slots', 'POST', {
    name: 'JP 1',
    start_time: '07:00',
    end_time: '07:40',
    slot_order: 1,
    is_break: false,
    is_active: true,
  });
  assert.equal(res.status, 201);
  const timeSlot = await res.json();
  assert.equal(
    (
      await api('/api/modules/schedule-time-slots', 'POST', {
        name: 'Slot bentrok',
        start_time: '07:30',
        end_time: '08:00',
        slot_order: 2,
        is_break: false,
        is_active: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api('/api/modules/schedules', 'POST', {
        teaching_assignment_id: teachingAssignment.id,
        semester_id: secondSemester.id,
        time_slot_id: timeSlot.id,
        weekday: 1,
      })
    ).status,
    400,
  );
  res = await api('/api/modules/schedules', 'POST', {
    teaching_assignment_id: annualTeachingAssignment.id,
    semester_id: semester.id,
    time_slot_id: timeSlot.id,
    weekday: 1,
  });
  assert.equal(res.status, 201);
  const sourceSchedule = await res.json();
  res = await api(
    `/api/modules/schedules?academic_year_id=${secondAcademicYear.id}&semester_id=${semester.id}&class_id=${classroom.id}`,
  );
  const schedule = await res.json();
  assert.equal(schedule.entries.length, 1);
  assert.equal(schedule.entries[0].subject_name, 'Matematika');
  assert.equal(
    (
      await api('/api/modules/schedules', 'POST', {
        teaching_assignment_id: teachingAssignment.id,
        semester_id: semester.id,
        time_slot_id: timeSlot.id,
        weekday: 1,
      })
    ).status,
    409,
  );
  res = await api('/api/modules/classes', 'POST', {
    academic_year_id: secondAcademicYear.id,
    grade_id: grade.id,
    name: '7C',
    capacity: 32,
    is_active: true,
  });
  assert.equal(res.status, 201);
  const conflictClassroom = await res.json();
  res = await api('/api/modules/teaching-assignments', 'POST', {
    teacher_id: teacher.id,
    subject_id: subject.id,
    class_id: conflictClassroom.id,
    semester_id: 'all',
  });
  assert.equal(res.status, 201);
  const conflictAssignment = await res.json();
  assert.equal(
    (
      await api('/api/modules/schedules', 'POST', {
        teaching_assignment_id: conflictAssignment.id,
        semester_id: semester.id,
        time_slot_id: timeSlot.id,
        weekday: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (await api('/api/modules/teaching-assignments', 'DELETE', { id: conflictAssignment.id }))
      .status,
    200,
  );
  assert.equal(
    (await api('/api/modules/classes', 'DELETE', { id: conflictClassroom.id })).status,
    200,
  );
  res = await api('/api/modules/schedules/copy', 'POST', {
    source_semester_id: semester.id,
    target_semester_id: secondSemester.id,
    class_id: classroom.id,
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).copied, 1);
  res = await api(
    `/api/modules/schedules?academic_year_id=${secondAcademicYear.id}&semester_id=${secondSemester.id}&class_id=${classroom.id}`,
  );
  const copiedSchedule = await res.json();
  assert.equal(copiedSchedule.entries.length, 1);
  assert.equal(
    (await api('/api/modules/teaching-assignments', 'DELETE', { id: annualTeachingAssignment.id }))
      .status,
    409,
  );
  assert.equal(
    (await api('/api/modules/schedules', 'DELETE', { id: sourceSchedule.id })).status,
    200,
  );
  assert.equal(
    (await api('/api/modules/schedules', 'DELETE', { id: copiedSchedule.entries[0].id })).status,
    200,
  );
  assert.equal(
    (await api('/api/modules/schedule-time-slots', 'DELETE', { id: timeSlot.id })).status,
    200,
  );
  res = await api(
    `/api/modules/teaching-assignments?class_id=${classroom.id}&subject_id=${subject.id}`,
  );
  const filteredTeachingAssignments = await res.json();
  assert.equal(filteredTeachingAssignments.total, 2);
  assert.equal(filteredTeachingAssignments.selected.class_id, classroom.id);
  assert.equal(filteredTeachingAssignments.selected.subject_id, subject.id);
  res = await api('/api/modules/homeroom-assignments?q=7A');
  assert.equal((await res.json()).rows[0].teacher_name, 'Budi Santoso');
  assert.equal((await api('/api/modules/teachers', 'DELETE', { id: teacher.id })).status, 409);
  assert.equal(
    (
      await api('/api/modules/teaching-assignments', 'DELETE', {
        id: teachingAssignment.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api('/api/modules/teaching-assignments', 'DELETE', {
        id: annualTeachingAssignment.id,
      })
    ).status,
    200,
  );
  assert.equal((await api('/api/modules/semesters?q=Ganjil')).status, 200);
  assert.equal((await api('/api/modules/semesters', 'DELETE', { id: semester.id })).status, 200);
  assert.equal(
    (await api('/api/modules/academic-years', 'DELETE', { id: secondAcademicYear.id })).status,
    409,
  );
  assert.equal((await api('/api/modules/grades', 'DELETE', { id: grade.id })).status, 409);
  assert.equal(
    (
      await api('/api/modules/homeroom-assignments', 'DELETE', {
        id: homeroomAssignment.id,
      })
    ).status,
    200,
  );
  res = await api('/api/modules/students', 'POST', {
    nis: 's-001',
    nisn: '0098765432',
    name: 'Ayu Cendekia',
    gender: 'female',
    birth_date: '2012-05-20',
    birth_place: 'Makassar',
    address: 'Jalan Pelajar 1',
    phone: '081200000001',
    email: 'ayu@cendekia.test',
    enrollment_date: '2026-07-15',
    is_active: true,
  });
  assert.equal(res.status, 201);
  const student = await res.json();
  res = await api('/api/modules/students?q=Ayu');
  const students = await res.json();
  assert.equal(students.total, 1);
  assert.equal(students.rows[0].nis, 'S-001');
  assert.equal(students.rows[0].gender_label, 'Perempuan');
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  res = await uploadApi(pdf, 'application/pdf', adminCookie, base, 'student.document');
  assert.equal(res.status, 201);
  const studentFile = (await res.json()).upload;
  const completeStudentInput = {
    id: student.id,
    nis: 'S-001',
    nisn: '0098765432',
    name: 'Ayu Cendekia',
    gender: 'female',
    birth_date: '2012-05-20',
    birth_place: 'Makassar',
    address: 'Jalan Pelajar 1',
    phone: '081200000001',
    email: 'ayu@cendekia.test',
    enrollment_date: '2026-07-15',
    is_active: true,
    guardians: [
      {
        name: 'Ibu Ayu',
        relation: 'Ibu',
        phone: '081200000002',
        email: '',
        address: 'Jalan Pelajar 1',
        is_primary: true,
      },
    ],
    documents: [
      {
        type: 'Akta kelahiran',
        file_url: studentFile.url,
        description: 'Salinan terverifikasi',
      },
    ],
    placement: {
      class_id: classroom.id,
      start_date: '2026-07-15',
    },
  };
  res = await api('/api/modules/students', 'PATCH', completeStudentInput);
  assert.equal(res.status, 200);
  res = await fetch(base + studentFile.url, { headers: { cookie: adminCookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition') || '', /^attachment/);
  res = await api('/api/modules/students?q=Ayu');
  const completeStudent = (await res.json()).rows[0];
  assert.equal(completeStudent.guardian_name, 'Ibu Ayu');
  assert.equal(completeStudent.document_count, 1);
  assert.equal(completeStudent.current_class_name, '7A');
  assert.equal(completeStudent.history[0].status_label, 'Aktif');
  res = await api('/api/modules/classes', 'POST', {
    academic_year_id: secondAcademicYear.id,
    grade_id: grade.id,
    name: '7B',
    capacity: 32,
    is_active: true,
  });
  assert.equal(res.status, 201);
  const nextClassroom = await res.json();
  res = await api('/api/modules/students', 'PATCH', {
    ...completeStudentInput,
    placement: { class_id: nextClassroom.id, start_date: '2026-08-01' },
  });
  assert.equal(res.status, 200);
  res = await api('/api/modules/students?q=Ayu');
  const transferredStudent = (await res.json()).rows[0];
  assert.equal(transferredStudent.current_class_name, '7B');
  assert.equal(transferredStudent.history.length, 2);
  assert.equal(transferredStudent.history[0].status_label, 'Aktif');
  assert.equal(transferredStudent.history[1].status_label, 'Pindah');
  assert.equal((await api('/api/modules/students', 'DELETE', { id: student.id })).status, 200);
  res = await api('/api/modules/school');
  assert.equal((await res.json()).school.timezone, 'Asia/Makassar');
  assert.equal(
    (await api('/api/modules/school', 'PATCH', { name: 'Invalid', timezone: 'Mars/Olympus' }))
      .status,
    400,
  );
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
  assert.equal((await api('/api/modules/users', 'GET', undefined, viewerCookie)).status, 403);
  assert.equal((await api('/api/modules/audit', 'GET', undefined, viewerCookie)).status, 403);
  assert.equal((await api('/api/modules/school', 'GET', undefined, viewerCookie)).status, 403);
  assert.equal(
    (await api('/api/modules/academic-years', 'GET', undefined, viewerCookie)).status,
    200,
  );
  for (const moduleKey of ['semesters', 'grades', 'classes', 'subjects'])
    assert.equal(
      (await api(`/api/modules/${moduleKey}`, 'GET', undefined, viewerCookie)).status,
      200,
    );
  assert.equal((await api('/api/modules/schedules', 'GET', undefined, viewerCookie)).status, 200);
  assert.equal(
    (
      await api(
        '/api/modules/schedule-time-slots',
        'POST',
        {
          name: 'Tanpa izin',
          start_time: '08:00',
          end_time: '08:40',
          slot_order: 1,
          is_break: false,
          is_active: true,
        },
        viewerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        '/api/modules/subjects',
        'POST',
        { code: 'NO', name: 'Tanpa izin', is_active: true },
        viewerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        '/api/modules/academic-years',
        'POST',
        {
          name: 'Tanpa izin',
          start_date: '2028-07-01',
          end_date: '2029-06-30',
          is_active: false,
        },
        viewerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        '/api/modules/school',
        'PATCH',
        { name: 'Tanpa akses', timezone: 'Asia/Jakarta' },
        viewerCookie,
      )
    ).status,
    403,
  );
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
  assert.equal(
    (await api('/api/modules/academic-years', 'GET', undefined, viewerCookie)).status,
    401,
  );
  res = await api('/api/modules/audit?q=schools');
  const schoolHistory = await res.json();
  assert.equal(schoolHistory.total, 2);
  assert.deepEqual(
    schoolHistory.rows.map((r: { action: string }) => r.action),
    ['update', 'create'],
  );
  assert.equal(
    (await api('/api/modules/academic-years', 'DELETE', { id: firstAcademicYear.id })).status,
    200,
  );
  res = await api('/api/modules/audit?q=academic_years');
  const academicYearHistory = await res.json();
  assert.equal(academicYearHistory.total, 4);
  assert.deepEqual(
    academicYearHistory.rows.map((r: { action: string }) => r.action),
    ['delete', 'update', 'create', 'create'],
  );
  assert.equal(
    (await api('/api/modules/audit', 'DELETE', { id: schoolHistory.rows[0].id })).status,
    405,
  );
  res = await api('/api/modules/roles', 'POST', {
    name: 'Operator',
    permissions: ['subjects.read', 'roles.read', 'roles.write'],
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
  assert.equal((await api('/api/modules/subjects', 'GET', undefined, operatorCookie)).status, 200);
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
  assert.equal((await api('/api/modules/subjects', 'GET', undefined, operatorCookie)).status, 403);
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

test('academic year context, bulk promotion, and historical reports', async () => {
  let res = await api(
    '/api/auth/login',
    'POST',
    { email: 'admin@test.local', password: 'new-admin-password-123' },
    '',
  );
  assert.equal(res.status, 200);
  adminCookie = res.headers.get('set-cookie')!.split(';')[0];

  const years = await (await api('/api/modules/academic-years')).json();
  const sourceYear = years.rows.find((row: { is_active: number }) => row.is_active === 1);
  const classes = await (await api('/api/modules/classes')).json();
  const sourceClass = classes.rows.find(
    (row: { academic_year_id: string }) => row.academic_year_id === sourceYear.id,
  );
  assert.ok(sourceClass);

  res = await api('/api/modules/students', 'POST', {
    nis: 'S-002',
    nisn: '',
    name: 'Bima Cendekia',
    gender: 'male',
    birth_date: '',
    birth_place: '',
    address: '',
    phone: '',
    email: '',
    enrollment_date: sourceYear.start_date,
    is_active: true,
    guardians: [],
    documents: [],
    placement: { class_id: sourceClass.id, start_date: sourceYear.start_date },
  });
  assert.equal(res.status, 201);
  const student = await res.json();

  res = await api('/api/modules/academic-years', 'POST', {
    name: '2027/2028',
    start_date: '2027-07-01',
    end_date: '2028-06-30',
    is_active: true,
    semesters: [
      {
        name: 'Semester Ganjil',
        period: 1,
        start_date: '2027-07-01',
        end_date: '2027-12-31',
        is_active: true,
      },
      {
        name: 'Semester Genap',
        period: 2,
        start_date: '2028-01-01',
        end_date: '2028-06-30',
        is_active: false,
      },
    ],
    classrooms: [
      {
        grade_id: sourceClass.grade_id,
        name: 'Rombel Tambahan',
        capacity: 30,
        is_active: true,
      },
    ],
  });
  assert.equal(res.status, 201);
  const targetYear = await res.json();
  const aggregateYears = await (await api('/api/modules/academic-years')).json();
  const aggregateTarget = aggregateYears.rows.find(
    (row: { id: string }) => row.id === targetYear.id,
  );
  assert.equal(aggregateTarget.semesters.length, 2);
  assert.equal(aggregateTarget.classrooms[0].name, 'Rombel Tambahan');
  res = await api('/api/modules/promotions/prepare-classes', 'POST', {
    source_academic_year_id: sourceYear.id,
  });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).created > 0);

  res = await api(`/api/modules/promotions?source_academic_year_id=${sourceYear.id}`);
  assert.equal(res.status, 200);
  const preview = await res.json();
  assert.equal(preview.target_academic_year.value, targetYear.id);
  assert.ok(preview.students.some((row: { id: string }) => row.id === student.id));
  const targetClass = preview.target_classes.find((row: { label: string }) =>
    row.label.startsWith(`${sourceClass.name} —`),
  );
  assert.ok(targetClass);

  res = await api('/api/modules/promotions', 'POST', {
    source_academic_year_id: sourceYear.id,
    actions: [{ student_id: student.id, outcome: 'promoted', target_class_id: targetClass.value }],
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).summary.promoted, 1);

  res = await api(`/api/modules/academic-reports?academic_year_id=${sourceYear.id}`);
  assert.equal(res.status, 200);
  const historicalReport = await res.json();
  assert.equal(
    historicalReport.rows.find((row: { nis: string }) => row.nis === 'S-002').status_label,
    'Naik kelas',
  );
  res = await api(`/api/modules/academic-reports?academic_year_id=${targetYear.id}`);
  const currentReport = await res.json();
  assert.equal(
    currentReport.rows.find((row: { nis: string }) => row.nis === 'S-002').class_name,
    sourceClass.name,
  );

  res = await api(`/api/modules/promotions?source_academic_year_id=${sourceYear.id}`);
  const completedProcess = await res.json();
  assert.ok(completedProcess.last_batch?.id);
  res = await api('/api/modules/promotions', 'DELETE', { id: completedProcess.last_batch.id });
  assert.equal(res.status, 200);
  res = await api(`/api/modules/academic-reports?academic_year_id=${sourceYear.id}`);
  const restoredReport = await res.json();
  assert.equal(
    restoredReport.rows.find((row: { nis: string }) => row.nis === 'S-002').status_label,
    'Aktif',
  );
});

test('academic year template copies semesters, classes, teaching assignments, and homeroom', async () => {
  const years = await (await api('/api/modules/academic-years')).json();
  const sourceYear = years.rows.find((row: { is_active: number }) => row.is_active === 1);
  const classes = await (
    await api(`/api/modules/classes?academic_year_id=${sourceYear.id}`)
  ).json();
  const sourceClass = classes.rows[0];
  const teachers = await (await api('/api/modules/teachers')).json();
  const subjects = await (await api('/api/modules/subjects')).json();
  assert.ok(sourceClass && teachers.rows[0] && subjects.rows[0]);

  let res = await api('/api/modules/teaching-assignments', 'POST', {
    academic_year_id: sourceYear.id,
    teacher_id: teachers.rows[0].id,
    subject_id: subjects.rows[0].id,
    class_id: sourceClass.id,
    semester_id: 'all',
  });
  assert.equal(res.status, 201);
  res = await api('/api/modules/homeroom-assignments', 'POST', {
    academic_year_id: sourceYear.id,
    teacher_id: teachers.rows[0].id,
    class_id: sourceClass.id,
  });
  assert.equal(res.status, 201);

  res = await api('/api/modules/academic-years', 'POST', {
    name: '2028/2029',
    start_date: '2028-07-01',
    end_date: '2029-06-30',
    is_active: true,
    copy_from_academic_year_id: sourceYear.id,
    copy_semesters: true,
    copy_classrooms: true,
    copy_teaching_assignments: true,
    copy_homeroom_assignments: true,
  });
  assert.equal(res.status, 201);
  const copiedYear = await res.json();

  const copiedSemesters = await (
    await api(`/api/modules/semesters?academic_year_id=${copiedYear.id}`)
  ).json();
  const copiedClasses = await (
    await api(`/api/modules/classes?academic_year_id=${copiedYear.id}`)
  ).json();
  const copiedTeaching = await (
    await api(`/api/modules/teaching-assignments?academic_year_id=${copiedYear.id}`)
  ).json();
  const copiedHomeroom = await (
    await api(`/api/modules/homeroom-assignments?academic_year_id=${copiedYear.id}`)
  ).json();
  assert.equal(copiedSemesters.total, 2);
  assert.equal(copiedClasses.total, classes.total);
  assert.ok(copiedTeaching.total >= 1);
  assert.ok(copiedHomeroom.total >= 1);
  assert.equal(copiedTeaching.selected.academic_year_id, copiedYear.id);
  assert.equal(copiedHomeroom.selected.academic_year_id, copiedYear.id);
});

test('guided annual transition keeps the source active until finalization and can be undone', async () => {
  let res = await api('/api/modules/promotions?mode=transition');
  assert.equal(res.status, 200);
  const setup = await res.json();
  const sourceYear = setup.active_academic_year;
  assert.equal(setup.target_academic_year, null);

  const sourceClasses = await (
    await api(`/api/modules/classes?academic_year_id=${sourceYear.value}`)
  ).json();
  const sourceClass = sourceClasses.rows[0];
  assert.ok(sourceClass);
  res = await api('/api/modules/students', 'POST', {
    nis: 'WIZARD-001',
    nisn: '',
    name: 'Murid Wizard',
    gender: 'female',
    birth_date: '',
    birth_place: '',
    address: '',
    phone: '',
    email: '',
    enrollment_date: sourceYear.start_date,
    is_active: true,
    guardians: [],
    documents: [],
    placement: { class_id: sourceClass.id, start_date: sourceYear.start_date },
  });
  assert.equal(res.status, 201);
  const student = await res.json();

  res = await api('/api/modules/academic-years', 'POST', {
    name: '2029/2030',
    start_date: '2029-07-01',
    end_date: '2030-06-30',
    is_active: false,
    copy_from_academic_year_id: sourceYear.value,
    copy_semesters: true,
    copy_classrooms: true,
    copy_teaching_assignments: true,
    copy_homeroom_assignments: true,
  });
  assert.equal(res.status, 201);
  const draft = await res.json();

  const beforeFinalization = await (await api('/api/modules/academic-years')).json();
  assert.equal(
    beforeFinalization.rows.find((row: { id: string }) => row.id === sourceYear.value).is_active,
    1,
  );
  assert.equal(
    beforeFinalization.rows.find((row: { id: string }) => row.id === draft.id).is_active,
    0,
  );

  res = await api(`/api/modules/promotions?mode=transition&target_academic_year_id=${draft.id}`);
  assert.equal(res.status, 200);
  const preview = await res.json();
  assert.ok(preview.target_classes.length > 0);
  assert.ok(preview.students.some((row: { id: string }) => row.id === student.id));

  res = await api('/api/modules/promotions', 'POST', {
    source_academic_year_id: sourceYear.value,
    target_academic_year_id: draft.id,
    activate_target: true,
    actions: [{ student_id: student.id, outcome: 'graduated', target_class_id: '' }],
  });
  assert.equal(res.status, 200);
  const completed = await res.json();
  const afterFinalization = await (await api('/api/modules/academic-years')).json();
  assert.equal(
    afterFinalization.rows.find((row: { id: string }) => row.id === draft.id).is_active,
    1,
  );

  res = await api('/api/modules/promotions', 'DELETE', { id: completed.id });
  assert.equal(res.status, 200);
  const afterUndo = await (await api('/api/modules/academic-years')).json();
  assert.equal(
    afterUndo.rows.find((row: { id: string }) => row.id === sourceYear.value).is_active,
    1,
  );
  assert.equal(afterUndo.rows.find((row: { id: string }) => row.id === draft.id).is_active, 0);
});
