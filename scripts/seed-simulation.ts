import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { permissions } from '../src/config/modules';

/** Populates an empty database with a realistic end-to-end school scenario. */
const database = db();
const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword || adminPassword.length < 12)
  throw new Error('Set SEED_ADMIN_PASSWORD minimal 12 karakter sebelum menjalankan seed simulasi.');

const id = () => randomUUID();
const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const ids = {
  school: id(),
  yearPrevious: id(),
  yearCurrent: id(),
  semPrevious1: id(),
  semPrevious2: id(),
  semCurrent1: id(),
  semCurrent2: id(),
  admin: id(),
  editor: id(),
  viewer: id(),
  teacherUser: id(),
};

function insert(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  database
    .prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .run(...columns.map((column) => row[column]));
}

function upload(scope: string, name: string, createdBy: string) {
  const uploadId = id();
  const key = `simulation/${uploadId}.png`;
  const root = resolve(process.env.UPLOAD_STORAGE_PATH || './data/uploads');
  const path = resolve(root, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, imagePng);
  insert('uploads', {
    id: uploadId,
    storage_key: key,
    original_name: name,
    mime_type: 'image/png',
    size: imagePng.length,
    scope,
    created_by: createdBy,
  });
  return `/api/uploads/${uploadId}`;
}

database.transaction(() => {
  insert('roles', {
    id: 'admin', name: 'Administrator', description: 'Akses penuh ke seluruh workspace',
    permissions: JSON.stringify(permissions), system: 1,
  });
  insert('roles', {
    id: 'editor', name: 'Operator Akademik', description: 'Mengelola data akademik dan operasional',
    permissions: JSON.stringify(permissions.filter((item) => !item.startsWith('users.') && !item.startsWith('roles.'))), system: 0,
  });
  // Migrasi database membuat role `teacher` secara otomatis pada database baru.
  database
    .prepare('UPDATE roles SET description=?,permissions=? WHERE id=?')
    .run(
      'Mengisi absensi untuk jadwal mengajar sendiri.',
      JSON.stringify(['dashboard.read', 'student-attendance.read', 'student-attendance.write']),
      'teacher',
    );
  insert('roles', {
    id: 'viewer', name: 'Pimpinan', description: 'Melihat ringkasan dan laporan akademik',
    permissions: JSON.stringify(['dashboard.read', 'academic-years.read', 'grades.read', 'classes.read', 'subjects.read', 'teachers.read', 'students.read', 'academic-reports.read', 'student-attendance.read', 'student-attendance.report']), system: 0,
  });
  insert('users', { id: ids.admin, name: 'Administrator Simulasi', email: adminEmail, password: hashPassword(adminPassword), role_id: 'admin' });
  insert('users', { id: ids.editor, name: 'Siti Rahmawati', email: 'operator@smkn1nusantara.sch.id', password: hashPassword('Simulasi2026!'), role_id: 'editor' });
  insert('users', { id: ids.viewer, name: 'Budi Santoso', email: 'kepsek@smkn1nusantara.sch.id', password: hashPassword('Simulasi2026!'), role_id: 'viewer' });
  insert('users', { id: ids.teacherUser, name: 'Rizky Pratama, S.Kom.', email: 'rizky.pratama@smkn1nusantara.sch.id', password: hashPassword('Simulasi2026!'), role_id: 'teacher' });
  const schoolLogo = upload('school.logo', 'logo-smkn-1-nusantara.png', ids.admin);
  insert('schools', {
    id: ids.school, name: 'SMK Negeri 1 Nusantara', code: 'SMKN1N', npsn: '69876543',
    address: 'Jl. Pendidikan No. 17, Bandung, Jawa Barat', email: 'info@smkn1nusantara.sch.id',
    phone: '022-7654321', logo_url: schoolLogo, timezone: 'Asia/Jakarta', is_active: 1,
  });
  insert('academic_years', { id: ids.yearPrevious, school_id: ids.school, name: '2025/2026', start_date: '2025-07-14', end_date: '2026-06-20', is_active: 0 });
  insert('academic_years', { id: ids.yearCurrent, school_id: ids.school, name: '2026/2027', start_date: '2026-07-13', end_date: '2027-06-18', is_active: 1 });
  for (const semester of [
    [ids.semPrevious1, ids.yearPrevious, 'Semester Ganjil', 1, '2025-07-14', '2025-12-19', 0],
    [ids.semPrevious2, ids.yearPrevious, 'Semester Genap', 2, '2026-01-05', '2026-06-20', 0],
    [ids.semCurrent1, ids.yearCurrent, 'Semester Ganjil', 1, '2026-07-13', '2026-12-18', 1],
    [ids.semCurrent2, ids.yearCurrent, 'Semester Genap', 2, '2027-01-04', '2027-06-18', 0],
  ] as const) insert('semesters', { id: semester[0], academic_year_id: semester[1], name: semester[2], period: semester[3], start_date: semester[4], end_date: semester[5], is_active: semester[6] });

  const grades = ['X', 'XI', 'XII'].map((name, index) => ({ id: id(), name, level: index + 1 }));
  for (const grade of grades) insert('grades', { id: grade.id, school_id: ids.school, name: `Kelas ${grade.name}`, level_order: grade.level, description: `Tingkat ${grade.name} SMK`, is_active: 1 });
  const classes = ['X RPL 1', 'X RPL 2', 'XI RPL 1', 'XI RPL 2', 'XII RPL 1', 'XII RPL 2'].map((name, index) => ({ id: id(), name, grade: grades[Math.floor(index / 2)] }));
  for (const classroom of classes) insert('classes', { id: classroom.id, school_id: ids.school, academic_year_id: ids.yearCurrent, grade_id: classroom.grade.id, name: classroom.name, capacity: 36, is_active: 1 });
  const previousClasses = ['X RPL 1', 'X RPL 2', 'XI RPL 1', 'XI RPL 2'].map((name, index) => ({ id: id(), name, grade: grades[Math.floor(index / 2)] }));
  for (const classroom of previousClasses) insert('classes', { id: classroom.id, school_id: ids.school, academic_year_id: ids.yearPrevious, grade_id: classroom.grade.id, name: classroom.name, capacity: 36, is_active: 0 });
  const subjects = [
    ['MP001', 'Matematika', 'Umum'], ['MP002', 'Bahasa Indonesia', 'Umum'], ['MP003', 'Bahasa Inggris', 'Umum'],
    ['MP004', 'Pendidikan Agama', 'Umum'], ['RPL001', 'Pemrograman Web', 'Kejuruan'], ['RPL002', 'Basis Data', 'Kejuruan'],
    ['RPL003', 'Pemrograman Mobile', 'Kejuruan'], ['RPL004', 'UI/UX Design', 'Kejuruan'], ['PKN001', 'Pendidikan Pancasila', 'Umum'],
  ];
  const subjectRows = subjects.map(([code, name, category]) => ({ id: id(), code, name, category }));
  for (const subject of subjectRows) insert('subjects', { school_id: ids.school, ...subject, description: `Mata pelajaran ${subject.name}`, is_active: 1 });
  const teachers = [
    ['G001', '198501012010011001', 'Ahmad Fauzi, S.Pd.', 'male', 'permanent'], ['G002', '198703122011012002', 'Dewi Lestari, S.Pd.', 'female', 'permanent'],
    ['G003', '199001052015031003', 'Rizky Pratama, S.Kom.', 'male', 'contract'], ['G004', '198811202012012004', 'Nadia Putri, S.Pd.', 'female', 'permanent'],
    ['G005', '199205142018021005', 'Fajar Hidayat, S.Kom.', 'male', 'contract'], ['G006', '199410102020121006', 'Intan Permata, S.Pd.', 'female', 'honorary'],
  ].map(([employee_code, nip, name, gender, employment_status]) => ({ id: id(), employee_code, nip, name, gender, employment_status }));
  for (const [index, teacher] of teachers.entries()) insert('teachers', { ...teacher, school_id: ids.school, user_id: index === 2 ? ids.teacherUser : null, photo_url: upload('teacher.photo', `foto-${teacher.employee_code}.png`, ids.admin), birth_date: `198${index}-05-12`, phone: `0812345678${index}`, email: index === 2 ? 'rizky.pratama@smkn1nusantara.sch.id' : `guru${index + 1}@smkn1nusantara.sch.id`, address: 'Bandung, Jawa Barat', join_date: `201${index}-07-01`, is_active: 1 });
  database.exec("UPDATE teachers SET qr_token=lower(hex(randomblob(24))) WHERE qr_token=''");
  const slots = [['Jam ke-1', '07:00', '07:45', 1, 0], ['Jam ke-2', '07:45', '08:30', 2, 0], ['Istirahat', '08:30', '08:45', 3, 1], ['Jam ke-3', '08:45', '09:30', 4, 0], ['Jam ke-4', '09:30', '10:15', 5, 0], ['Jam ke-5', '10:15', '11:00', 6, 0]] as const;
  const slotRows = slots.map(([name, start_time, end_time, slot_order, is_break]) => ({ id: id(), name, start_time, end_time, slot_order, is_break }));
  for (const slot of slotRows) insert('schedule_time_slots', { ...slot, school_id: ids.school, is_active: 1 });
  const assignments: { id: string; teacher: typeof teachers[number]; subject: typeof subjectRows[number]; classroom: typeof classes[number] }[] = [];
  for (const [index, classroom] of classes.entries()) for (const offset of [0, 4, 5]) {
    const assignment = { id: id(), teacher: teachers[(index + offset) % teachers.length], subject: subjectRows[(index + offset) % subjectRows.length], classroom };
    assignments.push(assignment);
    insert('teaching_assignments', { id: assignment.id, teacher_id: assignment.teacher.id, subject_id: assignment.subject.id, class_id: classroom.id, academic_year_id: ids.yearCurrent, semester_id: ids.semCurrent1 });
  }
  for (const [index, classroom] of classes.entries()) insert('homeroom_assignments', { id: id(), teacher_id: teachers[index].id, class_id: classroom.id, academic_year_id: ids.yearCurrent });
  for (const [index, assignment] of assignments.entries()) insert('class_schedules', { id: id(), teaching_assignment_id: assignment.id, semester_id: ids.semCurrent1, time_slot_id: slotRows[index % 2 === 0 ? index % slotRows.length : (index + 3) % slotRows.length].id, weekday: (index % 5) + 1 });

  const students = ['Alya Safitri', 'Bagas Pramudya', 'Citra Maharani', 'Dimas Saputra', 'Eka Wulandari', 'Farhan Akbar', 'Gina Oktaviani', 'Hendra Kurniawan', 'Indah Permata', 'Joko Susilo', 'Kania Aulia', 'Lukman Hakim', 'Maya Sari', 'Nanda Pratama', 'Oki Ramadhan', 'Putri Ayuningtyas', 'Qori Rahman', 'Rani Puspitasari', 'Satria Nugraha', 'Tia Anggraini', 'Umar Faruq', 'Vina Melati', 'Wahyu Setiawan', 'Xenia Larasati'].map((name, index) => ({ id: id(), name, index }));
  const promotionBatchId = id();
  const promotionActions: Record<string, string>[] = [];
  insert('promotion_batches', { id: promotionBatchId, school_id: ids.school, source_academic_year_id: ids.yearPrevious, target_academic_year_id: ids.yearCurrent, actions: '[]', activates_target: 1, status: 'completed', created_by: adminEmail });
  for (const student of students) {
    const classroom = classes[student.index % classes.length];
    insert('students', { id: student.id, school_id: ids.school, photo_url: upload('student.photo', `foto-${student.index + 1}.png`, ids.admin), nis: `2026${String(student.index + 1).padStart(4, '0')}`, nisn: `0098${String(100000 + student.index)}`, name: student.name, gender: student.index % 2 ? 'male' : 'female', birth_date: `200${8 + (student.index % 3)}-${String((student.index % 9) + 1).padStart(2, '0')}-15`, birth_place: 'Bandung', address: `Jl. Melati No. ${student.index + 1}, Bandung`, phone: `08129876${String(student.index).padStart(3, '0')}`, email: `siswa${student.index + 1}@contoh.sch.id`, enrollment_date: '2026-07-13', is_active: student.index === 23 ? 0 : 1 });
    insert('guardians', { id: id(), student_id: student.id, name: `Bapak/Ibu ${student.name.split(' ')[0]}`, relation: 'Orang tua', phone: `08137765${String(student.index).padStart(3, '0')}`, email: `wali${student.index + 1}@contoh.sch.id`, address: `Jl. Melati No. ${student.index + 1}, Bandung`, is_primary: 1 });
    if (student.index % 4 === 0) insert('student_documents', { id: id(), student_id: student.id, type: 'Kartu Keluarga', file_url: upload('student.document', `kk-${student.index + 1}.png`, ids.admin), description: 'Dokumen simulasi' });
    const classIndex = student.index % classes.length;
    const wasPromoted = classIndex >= 2 && student.index !== 23;
    if (wasPromoted) {
      const sourceMembershipId = id();
      const previousClass = previousClasses[classIndex - 2];
      insert('class_memberships', { id: sourceMembershipId, student_id: student.id, class_id: previousClass.id, academic_year_id: ids.yearPrevious, start_date: '2025-07-14', end_date: '2026-06-20', status: 'completed', completion_reason: 'promoted', promotion_batch_id: null });
      promotionActions.push({ student_id: student.id, outcome: 'promoted', target_class_id: classroom.id, source_membership_id: sourceMembershipId });
    }
    insert('class_memberships', { id: id(), student_id: student.id, class_id: classroom.id, academic_year_id: ids.yearCurrent, start_date: '2026-07-13', end_date: null, status: student.index === 23 ? 'withdrawn' : 'active', completion_reason: student.index === 23 ? 'withdrawn' : '', promotion_batch_id: wasPromoted ? promotionBatchId : null });
  }
  database.prepare('UPDATE promotion_batches SET actions=? WHERE id=?').run(JSON.stringify(promotionActions), promotionBatchId);
  const extracurriculars = [['EK001', 'Pramuka', 'Wajib', 1], ['EK002', 'Futsal', 'Olahraga', 0], ['EK003', 'Klub Coding', 'Teknologi', 0], ['EK004', 'Paskibra', 'Kepemimpinan', 0]] as const;
  const extraRows = extracurriculars.map(([code, name, category, required]) => ({ id: id(), code, name, category, required }));
  for (const extra of extraRows) insert('extracurriculars', { id: extra.id, school_id: ids.school, code: extra.code, name: extra.name, category: extra.category, description: `Kegiatan ${extra.name}`, is_required: extra.required, is_active: 1 });
  for (const [index, extra] of extraRows.entries()) {
    const assignmentId = id();
    insert('extracurricular_assignments', { id: assignmentId, extracurricular_id: extra.id, teacher_id: teachers[(index + 1) % teachers.length].id, academic_year_id: ids.yearCurrent, semester_id: ids.semCurrent1, location: index === 1 ? 'Lapangan Utama' : 'Aula Sekolah', map_url: '', quota: 30, status: 'active' });
    insert('extracurricular_schedules', { id: id(), assignment_id: assignmentId, semester_id: ids.semCurrent1, time_slot_id: slotRows[5].id, weekday: index + 1 });
    for (const student of students.filter((_, studentIndex) => studentIndex % extraRows.length === index).slice(0, 6)) insert('extracurricular_participants', { id: id(), assignment_id: assignmentId, student_id: student.id });
  }
  const schedules = database.prepare('SELECT cs.id,ta.id AS teaching_assignment_id,ta.class_id,ta.teacher_id,c.name AS class_name,s.name AS subject_name,t.name AS teacher_name FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id JOIN classes c ON c.id=ta.class_id JOIN subjects s ON s.id=ta.subject_id JOIN teachers t ON t.id=ta.teacher_id LIMIT 3').all() as Record<string, string>[];
  for (const [index, schedule] of schedules.entries()) {
    const sessionId = id(); const date = `2026-09-0${index + 1}`;
    insert('student_attendance_sessions', { id: sessionId, school_id: ids.school, class_schedule_id: schedule.id, teaching_assignment_id: schedule.teaching_assignment_id, class_id: schedule.class_id, teacher_id: schedule.teacher_id, attendance_date: date, status: index === 2 ? 'open' : 'closed', subject_name: schedule.subject_name, class_name: schedule.class_name, teacher_name: schedule.teacher_name, starts_at: `${date}T07:00:00.000Z`, closed_at: index === 2 ? null : `${date}T07:45:00.000Z`, created_by: ids.admin });
    const enrolled = students.filter((student) => student.index % classes.length === classes.findIndex((item) => item.id === schedule.class_id));
    for (const [recordIndex, student] of enrolled.entries()) insert('student_attendance_records', { id: id(), session_id: sessionId, student_id: student.id, student_nis: `2026${String(student.index + 1).padStart(4, '0')}`, student_name: student.name, status: recordIndex === 1 ? 'late' : recordIndex === 2 ? 'sick' : 'present', note: recordIndex === 1 ? 'Datang terlambat 10 menit' : recordIndex === 2 ? 'Izin sakit' : '', source: 'teacher', recorded_at: `${date}T07:40:00.000Z`, updated_by: ids.admin });
  }
  insert('audit', { actor: 'system', action: 'seed', entity: 'simulation', entity_id: ids.school, details: JSON.stringify({ message: 'Database simulasi lengkap dibuat', students: students.length, teachers: teachers.length }) });
})();

const counts = ['schools', 'academic_years', 'classes', 'teachers', 'students', 'class_schedules', 'student_attendance_sessions']
  .map((table) => `${table}=${(database.prepare(`SELECT count(*) AS total FROM ${table}`).get() as { total: number }).total}`)
  .join(', ');
console.log(`Seed simulasi selesai: ${counts}`);
