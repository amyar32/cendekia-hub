import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const globalDb = globalThis as unknown as { cmsDb?: Database.Database };
export function db() {
  if (globalDb.cmsDb) return globalDb.cmsDb;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH || './data/cms.sqlite',
  );
  mkdirSync(dirname(path), { recursive: true });
  const connection = new Database(path);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  const schemaVersion = connection.pragma('user_version', { simple: true }) as number;
  connection.exec(`
    CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', permissions TEXT NOT NULL, system INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', npsn TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', logo_url TEXT NOT NULL DEFAULT '', principal_name TEXT NOT NULL DEFAULT '', principal_nip TEXT NOT NULL DEFAULT '', principal_signature_url TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta', checkin_late_after TEXT NOT NULL DEFAULT '07:15', checkin_absent_after TEXT NOT NULL DEFAULT '', schedule_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5]', schedule_bell_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_bell_enabled IN (0, 1)), schedule_bell_sound_url TEXT NOT NULL DEFAULT '', education_level TEXT NOT NULL DEFAULT '', onboarding_completed_at TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, scope TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS academic_years (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date < end_date), UNIQUE (school_id, name));
    CREATE TABLE IF NOT EXISTS semesters (id TEXT PRIMARY KEY, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, name TEXT NOT NULL, period INTEGER NOT NULL CHECK (period IN (1, 2)), start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date < end_date), UNIQUE (academic_year_id, period), UNIQUE (academic_year_id, name));
    CREATE TABLE IF NOT EXISTS grades (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, level_order INTEGER NOT NULL CHECK (level_order > 0), description TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, name), UNIQUE (school_id, level_order));
    CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT, name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, academic_year_id, name));
    CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, code TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, code), UNIQUE (school_id, name));
    CREATE TABLE IF NOT EXISTS extracurriculars (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, code TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, code), UNIQUE (school_id, name));
    CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, photo_url TEXT NOT NULL DEFAULT '', employee_code TEXT NOT NULL, nip TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('male', 'female')), birth_date TEXT, blood_type TEXT NOT NULL DEFAULT '' CHECK (blood_type IN ('', 'A', 'B', 'AB', 'O')), phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', join_date TEXT, employment_status TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), qr_token TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, employee_code));
    CREATE TABLE IF NOT EXISTS teaching_assignments (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, semester_id TEXT REFERENCES semesters(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teacher_id, subject_id, class_id, academic_year_id, semester_id));
    CREATE TABLE IF NOT EXISTS homeroom_assignments (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (class_id, academic_year_id), UNIQUE (teacher_id, academic_year_id));
    CREATE TABLE IF NOT EXISTS schedule_time_slots (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, slot_order INTEGER NOT NULL CHECK (slot_order > 0), is_break INTEGER NOT NULL DEFAULT 0 CHECK (is_break IN (0, 1)), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_time < end_time), UNIQUE (school_id, slot_order), UNIQUE (school_id, name));
    CREATE TABLE IF NOT EXISTS class_schedules (id TEXT PRIMARY KEY, teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE RESTRICT, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teaching_assignment_id, semester_id, time_slot_id, weekday));
    CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, photo_url TEXT NOT NULL DEFAULT '', nik TEXT NOT NULL DEFAULT '', nis TEXT NOT NULL, nisn TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('male', 'female')), birth_date TEXT, birth_place TEXT NOT NULL DEFAULT '', family_card_number TEXT NOT NULL DEFAULT '', religion TEXT NOT NULL DEFAULT '', citizenship TEXT NOT NULL DEFAULT 'Indonesia', child_order INTEGER NOT NULL DEFAULT 0, sibling_count INTEGER NOT NULL DEFAULT 0, birth_certificate_number TEXT NOT NULL DEFAULT '', has_special_needs INTEGER NOT NULL DEFAULT 0 CHECK (has_special_needs IN (0,1)), special_needs_type TEXT NOT NULL DEFAULT '', blood_type TEXT NOT NULL DEFAULT '' CHECK (blood_type IN ('', 'A', 'B', 'AB', 'O')), address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', enrollment_date TEXT, previous_school_name TEXT NOT NULL DEFAULT '', previous_school_npsn TEXT NOT NULL DEFAULT '', previous_school_address TEXT NOT NULL DEFAULT '', previous_school_last_grade TEXT NOT NULL DEFAULT '', previous_school_graduation_year TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), qr_token TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, nis));
    CREATE TABLE IF NOT EXISTS guardians (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, name TEXT NOT NULL, nik TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS student_documents (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, type TEXT NOT NULL, file_url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS admission_periods (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')), registration_prefix TEXT NOT NULL DEFAULT 'PMB', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date <= end_date), UNIQUE (school_id,name));
    CREATE TABLE IF NOT EXISTS student_applications (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, admission_period_id TEXT NOT NULL REFERENCES admission_periods(id) ON DELETE RESTRICT, registration_number TEXT NOT NULL, tracking_token TEXT NOT NULL UNIQUE, photo_url TEXT NOT NULL DEFAULT '', nik TEXT NOT NULL DEFAULT '', nisn TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('male','female')), birth_date TEXT, birth_place TEXT NOT NULL DEFAULT '', family_card_number TEXT NOT NULL DEFAULT '', religion TEXT NOT NULL DEFAULT '', citizenship TEXT NOT NULL DEFAULT 'Indonesia', child_order INTEGER NOT NULL DEFAULT 0, sibling_count INTEGER NOT NULL DEFAULT 0, birth_certificate_number TEXT NOT NULL DEFAULT '', has_special_needs INTEGER NOT NULL DEFAULT 0 CHECK (has_special_needs IN (0,1)), special_needs_type TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', previous_school_name TEXT NOT NULL DEFAULT '', previous_school_npsn TEXT NOT NULL DEFAULT '', previous_school_address TEXT NOT NULL DEFAULT '', previous_school_last_grade TEXT NOT NULL DEFAULT '', previous_school_graduation_year TEXT NOT NULL DEFAULT '', target_grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT, admission_path TEXT NOT NULL DEFAULT 'Reguler', status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','needs_revision','verified','selection','accepted','waitlisted','rejected','reregistered','converted')), verification_notes TEXT NOT NULL DEFAULT '', assessment_test REAL, assessment_interview REAL, assessment_final REAL, ranking INTEGER, decision_notes TEXT NOT NULL DEFAULT '', verified_by TEXT, verified_at TEXT, submitted_at TEXT, converted_student_id TEXT REFERENCES students(id) ON DELETE RESTRICT, created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id,registration_number));
    CREATE TABLE IF NOT EXISTS application_guardians (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, name TEXT NOT NULL, nik TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS application_documents (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, type TEXT NOT NULL, file_url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)), verification_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS application_status_history (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS promotion_batches (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, source_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, target_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, actions TEXT NOT NULL, activates_target INTEGER NOT NULL DEFAULT 0 CHECK (activates_target IN (0, 1)), status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'undone')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), undone_at TEXT);
    CREATE TABLE IF NOT EXISTS class_memberships (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, start_date TEXT NOT NULL, end_date TEXT, status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'transferred', 'withdrawn')), completion_reason TEXT NOT NULL DEFAULT '', promotion_batch_id TEXT REFERENCES promotion_batches(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (end_date IS NULL OR start_date <= end_date), UNIQUE (student_id, class_id, academic_year_id, start_date));
    CREATE TABLE IF NOT EXISTS extracurricular_assignments (id TEXT PRIMARY KEY, extracurricular_id TEXT NOT NULL REFERENCES extracurriculars(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, semester_id TEXT REFERENCES semesters(id) ON DELETE RESTRICT, location TEXT NOT NULL DEFAULT '', map_url TEXT NOT NULL DEFAULT '', quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS extracurricular_schedules (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE CASCADE, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (assignment_id, semester_id, time_slot_id, weekday));
    CREATE TABLE IF NOT EXISTS extracurricular_participants (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (assignment_id, student_id));
    CREATE TABLE IF NOT EXISTS student_attendance_sessions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, class_schedule_id TEXT NOT NULL REFERENCES class_schedules(id) ON DELETE RESTRICT, teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')), subject_name TEXT NOT NULL, class_name TEXT NOT NULL, teacher_name TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (class_schedule_id, attendance_date));
    CREATE TABLE IF NOT EXISTS student_attendance_records (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES student_attendance_sessions(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, student_nis TEXT NOT NULL, student_name TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('present', 'late', 'sick', 'excused', 'absent')), note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'admin', 'qr', 'native_app')), recorded_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (session_id, student_id));
    CREATE TABLE IF NOT EXISTS student_checkins (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (student_id, attendance_date));
    CREATE TABLE IF NOT EXISTS teacher_checkins (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teacher_id, attendance_date));
    CREATE TABLE IF NOT EXISTS extracurricular_attendance_sessions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, extracurricular_schedule_id TEXT NOT NULL REFERENCES extracurricular_schedules(id) ON DELETE RESTRICT, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE RESTRICT, extracurricular_id TEXT NOT NULL REFERENCES extracurriculars(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')), extracurricular_name TEXT NOT NULL, teacher_name TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (extracurricular_schedule_id, attendance_date));
    CREATE TABLE IF NOT EXISTS extracurricular_attendance_records (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES extracurricular_attendance_sessions(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, student_nis TEXT NOT NULL, student_name TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('present', 'late', 'sick', 'excused', 'absent')), note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'admin', 'qr', 'native_app')), updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (session_id, student_id));
    CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
    CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at);
    CREATE INDEX IF NOT EXISTS academic_years_school_dates ON academic_years(school_id, start_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school ON academic_years(school_id) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS semesters_academic_year_period ON semesters(academic_year_id, period);
    CREATE INDEX IF NOT EXISTS grades_school_order ON grades(school_id, level_order);
    CREATE INDEX IF NOT EXISTS classes_school_year_grade ON classes(school_id, academic_year_id, grade_id);
    CREATE INDEX IF NOT EXISTS subjects_school_name ON subjects(school_id, name);
    CREATE INDEX IF NOT EXISTS teachers_school_name ON teachers(school_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_nip ON teachers(school_id, nip) WHERE nip <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS teachers_one_user ON teachers(user_id) WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS teaching_assignments_year_class ON teaching_assignments(academic_year_id, class_id);
    CREATE UNIQUE INDEX IF NOT EXISTS teaching_assignments_unique ON teaching_assignments(teacher_id, subject_id, class_id, academic_year_id, COALESCE(semester_id, ''));
    CREATE INDEX IF NOT EXISTS homeroom_assignments_year_class ON homeroom_assignments(academic_year_id, class_id);
    CREATE INDEX IF NOT EXISTS schedule_time_slots_school_order ON schedule_time_slots(school_id, slot_order);
    CREATE INDEX IF NOT EXISTS class_schedules_semester_day_slot ON class_schedules(semester_id, weekday, time_slot_id);
    CREATE INDEX IF NOT EXISTS students_school_name ON students(school_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS students_school_nisn ON students(school_id, nisn) WHERE nisn <> '';
    CREATE INDEX IF NOT EXISTS guardians_student ON guardians(student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS guardians_one_primary ON guardians(student_id) WHERE is_primary = 1;
    CREATE INDEX IF NOT EXISTS student_documents_student ON student_documents(student_id);
    CREATE INDEX IF NOT EXISTS admission_periods_school_dates ON admission_periods(school_id,start_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS applications_period_nik ON student_applications(admission_period_id,nik) WHERE nik<>'';
    CREATE UNIQUE INDEX IF NOT EXISTS applications_period_nisn ON student_applications(admission_period_id,nisn) WHERE nisn<>'';
    CREATE INDEX IF NOT EXISTS applications_school_status ON student_applications(school_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS applications_period_status ON student_applications(admission_period_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS application_guardians_application ON application_guardians(application_id);
    CREATE INDEX IF NOT EXISTS application_documents_application ON application_documents(application_id);
    CREATE INDEX IF NOT EXISTS application_history_application ON application_status_history(application_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS class_memberships_year_class ON class_memberships(academic_year_id, class_id);
    CREATE UNIQUE INDEX IF NOT EXISTS class_memberships_one_active ON class_memberships(student_id, academic_year_id) WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS extracurricular_assignments_unique ON extracurricular_assignments(extracurricular_id, academic_year_id, COALESCE(semester_id, ''));
    CREATE INDEX IF NOT EXISTS extracurricular_assignments_year ON extracurricular_assignments(academic_year_id, extracurricular_id);
    CREATE INDEX IF NOT EXISTS extracurricular_schedules_period ON extracurricular_schedules(semester_id, weekday, time_slot_id);
    CREATE INDEX IF NOT EXISTS extracurricular_participants_student ON extracurricular_participants(student_id, assignment_id);
    CREATE INDEX IF NOT EXISTS student_attendance_sessions_school_date ON student_attendance_sessions(school_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS student_attendance_sessions_teacher_date ON student_attendance_sessions(teacher_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS student_attendance_records_student ON student_attendance_records(student_id, session_id);
    CREATE INDEX IF NOT EXISTS student_checkins_school_date ON student_checkins(school_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS student_checkins_student_date ON student_checkins(student_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS teacher_checkins_school_date ON teacher_checkins(school_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS teacher_checkins_teacher_date ON teacher_checkins(teacher_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS extracurricular_attendance_sessions_date ON extracurricular_attendance_sessions(school_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS extracurricular_attendance_records_student ON extracurricular_attendance_records(student_id, session_id);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
  `);
  connection.exec('DROP INDEX IF EXISTS semesters_one_active_per_school');

  if (schemaVersion < 2) {
    connection.transaction(() => {
      const systemRoles = connection
        .prepare('SELECT id, permissions FROM roles WHERE system = 1')
        .all() as { id: string; permissions: string }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of systemRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        grants.add('school.read');
        grants.add('school.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 2');
    })();
  }
  if (schemaVersion < 3) connection.pragma('user_version = 3');
  if (schemaVersion < 4) {
    connection.transaction(() => {
      const systemRoles = connection
        .prepare('SELECT id, permissions FROM roles WHERE system = 1')
        .all() as { id: string; permissions: string }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of systemRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        grants.add('academic-years.read');
        grants.add('academic-years.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 4');
    })();
  }
  if (schemaVersion < 5) {
    connection.transaction(() => {
      const systemRoles = connection
        .prepare('SELECT id, permissions FROM roles WHERE system = 1')
        .all() as { id: string; permissions: string }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of systemRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        for (const moduleKey of ['semesters', 'grades', 'classes', 'subjects']) {
          grants.add(`${moduleKey}.read`);
          grants.add(`${moduleKey}.write`);
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 5');
    })();
  }
  if (schemaVersion < 6) {
    connection.transaction(() => {
      const systemRoles = connection
        .prepare('SELECT id, permissions FROM roles WHERE system = 1')
        .all() as { id: string; permissions: string }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of systemRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        for (const moduleKey of ['teachers', 'teaching-assignments', 'homeroom-assignments']) {
          grants.add(`${moduleKey}.read`);
          grants.add(`${moduleKey}.write`);
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 6');
    })();
  }
  if (schemaVersion < 7) {
    connection.transaction(() => {
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = (JSON.parse(role.permissions) as string[]).filter(
          (permission) => permission !== 'categories.read' && permission !== 'categories.write',
        );
        updateRole.run(JSON.stringify(grants), role.id);
      }
      connection.pragma('user_version = 7');
    })();
  }
  if (schemaVersion < 8) {
    const teacherColumns = connection.pragma('table_info(teachers)') as { name: string }[];
    if (!teacherColumns.some((column) => column.name === 'photo_url'))
      connection.exec("ALTER TABLE teachers ADD COLUMN photo_url TEXT NOT NULL DEFAULT ''");
    connection.pragma('user_version = 8');
  }
  if (schemaVersion < 9) {
    connection.transaction(() => {
      const systemRoles = connection
        .prepare('SELECT id, permissions FROM roles WHERE system = 1')
        .all() as { id: string; permissions: string }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of systemRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        for (const moduleKey of ['students']) {
          grants.add(`${moduleKey}.read`);
          grants.add(`${moduleKey}.write`);
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 9');
    })();
  }
  if (schemaVersion < 10) {
    connection.transaction(() => {
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        const hadRead = grants.delete('teacher-subjects.read');
        const hadWrite = grants.delete('teacher-subjects.write');
        if (hadRead) grants.add('teaching-assignments.read');
        if (hadWrite) grants.add('teaching-assignments.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.exec('DROP TABLE IF EXISTS teacher_subjects');
      connection.pragma('user_version = 10');
    })();
  }
  if (schemaVersion < 11) {
    connection.transaction(() => {
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        const hadRead = ['guardians.read', 'student-documents.read', 'class-memberships.read']
          .map((permission) => grants.delete(permission))
          .some(Boolean);
        const hadWrite = ['guardians.write', 'student-documents.write', 'class-memberships.write']
          .map((permission) => grants.delete(permission))
          .some(Boolean);
        if (hadRead || hadWrite) grants.add('students.read');
        if (hadWrite) grants.add('students.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 11');
    })();
  }
  if (schemaVersion < 12) {
    connection.transaction(() => {
      const membershipColumns = connection.pragma('table_info(class_memberships)') as {
        name: string;
      }[];
      if (!membershipColumns.some((column) => column.name === 'completion_reason'))
        connection.exec(
          "ALTER TABLE class_memberships ADD COLUMN completion_reason TEXT NOT NULL DEFAULT ''",
        );
      connection.exec(
        `CREATE TABLE IF NOT EXISTS promotion_batches (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, source_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, target_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, actions TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'undone')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), undone_at TEXT)`,
      );
      if (!membershipColumns.some((column) => column.name === 'promotion_batch_id'))
        connection.exec(
          'ALTER TABLE class_memberships ADD COLUMN promotion_batch_id TEXT REFERENCES promotion_batches(id) ON DELETE RESTRICT',
        );
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (grants.has('students.read')) {
          grants.add('promotions.read');
          grants.add('academic-reports.read');
        }
        if (grants.has('students.write')) grants.add('promotions.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 12');
    })();
  }
  if (schemaVersion < 13) {
    connection.transaction(() => {
      connection.exec(
        `CREATE TABLE IF NOT EXISTS promotion_batches (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, source_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, target_academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, actions TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'undone')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), undone_at TEXT)`,
      );
      const membershipColumns = connection.pragma('table_info(class_memberships)') as {
        name: string;
      }[];
      if (!membershipColumns.some((column) => column.name === 'promotion_batch_id'))
        connection.exec(
          'ALTER TABLE class_memberships ADD COLUMN promotion_batch_id TEXT REFERENCES promotion_batches(id) ON DELETE RESTRICT',
        );
      connection.pragma('user_version = 13');
    })();
  }
  if (schemaVersion < 14) {
    const promotionColumns = connection.pragma('table_info(promotion_batches)') as {
      name: string;
    }[];
    if (!promotionColumns.some((column) => column.name === 'activates_target'))
      connection.exec(
        'ALTER TABLE promotion_batches ADD COLUMN activates_target INTEGER NOT NULL DEFAULT 0 CHECK (activates_target IN (0, 1))',
      );
    connection.pragma('user_version = 14');
  }
  if (schemaVersion < 15) {
    connection.transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS schedule_time_slots (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, slot_order INTEGER NOT NULL CHECK (slot_order > 0), is_break INTEGER NOT NULL DEFAULT 0 CHECK (is_break IN (0, 1)), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_time < end_time), UNIQUE (school_id, slot_order), UNIQUE (school_id, name));
        CREATE TABLE IF NOT EXISTS class_schedules (id TEXT PRIMARY KEY, teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE RESTRICT, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teaching_assignment_id, semester_id, time_slot_id, weekday));
        CREATE INDEX IF NOT EXISTS schedule_time_slots_school_order ON schedule_time_slots(school_id, slot_order);
        CREATE INDEX IF NOT EXISTS class_schedules_semester_day_slot ON class_schedules(semester_id, weekday, time_slot_id);
      `);
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (grants.has('teaching-assignments.read')) grants.add('schedules.read');
        if (grants.has('teaching-assignments.write')) grants.add('schedules.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 15');
    })();
  }
  if (schemaVersion < 16) {
    connection.transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS extracurriculars (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, code TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, code), UNIQUE (school_id, name));
        CREATE TABLE IF NOT EXISTS extracurricular_assignments (id TEXT PRIMARY KEY, extracurricular_id TEXT NOT NULL REFERENCES extracurriculars(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, semester_id TEXT REFERENCES semesters(id) ON DELETE RESTRICT, location TEXT NOT NULL DEFAULT '', quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS extracurricular_schedules (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE CASCADE, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (assignment_id, semester_id, time_slot_id, weekday));
        CREATE TABLE IF NOT EXISTS extracurricular_participants (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (assignment_id, student_id));
        CREATE UNIQUE INDEX IF NOT EXISTS extracurricular_assignments_unique ON extracurricular_assignments(extracurricular_id, academic_year_id, COALESCE(semester_id, ''));
        CREATE INDEX IF NOT EXISTS extracurricular_assignments_year ON extracurricular_assignments(academic_year_id, extracurricular_id);
        CREATE INDEX IF NOT EXISTS extracurricular_schedules_period ON extracurricular_schedules(semester_id, weekday,time_slot_id);
        CREATE INDEX IF NOT EXISTS extracurricular_participants_student ON extracurricular_participants(student_id, assignment_id);
      `);
      const storedRoles = connection.prepare('SELECT id, permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (grants.has('subjects.read')) grants.add('extracurriculars.read');
        if (grants.has('subjects.write')) grants.add('extracurriculars.write');
        if (grants.has('teaching-assignments.read')) grants.add('extracurricular-assignments.read');
        if (grants.has('teaching-assignments.write'))
          grants.add('extracurricular-assignments.write');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 16');
    })();
  }
  if (schemaVersion < 17) {
    const columns = connection.pragma('table_info(extracurricular_assignments)') as {
      name: string;
    }[];
    if (!columns.some((column) => column.name === 'map_url'))
      connection.exec(
        "ALTER TABLE extracurricular_assignments ADD COLUMN map_url TEXT NOT NULL DEFAULT ''",
      );
    connection.pragma('user_version = 17');
  }
  if (schemaVersion < 18) {
    const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
    if (!studentColumns.some((column) => column.name === 'photo_url'))
      connection.exec("ALTER TABLE students ADD COLUMN photo_url TEXT NOT NULL DEFAULT ''");
    connection.pragma('user_version = 18');
  }
  if (schemaVersion < 19) {
    connection.transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS student_attendance_sessions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, class_schedule_id TEXT NOT NULL REFERENCES class_schedules(id) ON DELETE RESTRICT, teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')), subject_name TEXT NOT NULL, class_name TEXT NOT NULL, teacher_name TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (class_schedule_id, attendance_date));
        CREATE TABLE IF NOT EXISTS student_attendance_records (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES student_attendance_sessions(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, student_nis TEXT NOT NULL, student_name TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('present', 'late', 'sick', 'excused', 'absent')), note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'admin', 'qr', 'native_app')), recorded_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (session_id, student_id));
        CREATE INDEX IF NOT EXISTS student_attendance_sessions_school_date ON student_attendance_sessions(school_id, attendance_date DESC);
        CREATE INDEX IF NOT EXISTS student_attendance_sessions_teacher_date ON student_attendance_sessions(teacher_id, attendance_date DESC);
        CREATE INDEX IF NOT EXISTS student_attendance_records_student ON student_attendance_records(student_id, session_id);
      `);
      const storedRoles = connection.prepare('SELECT id, name, permissions FROM roles').all() as {
        id: string;
        name: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (role.name === 'Administrator') {
          grants.add('student-attendance.read');
          grants.add('student-attendance.write');
          grants.add('student-attendance.approve');
          grants.add('student-attendance.report');
        } else if (grants.has('schedules.write')) {
          grants.add('student-attendance.read');
          grants.add('student-attendance.write');
          grants.add('student-attendance.approve');
          grants.add('student-attendance.report');
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 19');
    })();
  }
  if (schemaVersion < 20) {
    connection
      .prepare('INSERT OR IGNORE INTO roles(id,name,description,permissions) VALUES (?,?,?,?)')
      .run(
        'teacher',
        'Guru',
        'Mengisi absensi untuk jadwal mengajar sendiri.',
        JSON.stringify(['dashboard.read', 'student-attendance.read', 'student-attendance.write']),
      );
    connection.pragma('user_version = 20');
  }
  if (schemaVersion < 22) {
    connection.transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS student_checkins (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (student_id, attendance_date));
        CREATE INDEX IF NOT EXISTS student_checkins_school_date ON student_checkins(school_id, attendance_date DESC);
        CREATE INDEX IF NOT EXISTS student_checkins_student_date ON student_checkins(student_id, attendance_date DESC);
      `);
      const storedRoles = connection.prepare('SELECT id, name, permissions FROM roles').all() as {
        id: string;
        name: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (role.name === 'Administrator' || grants.has('students.write')) {
          grants.add('student-checkins.read');
          grants.add('student-checkins.write');
          grants.add('student-checkins.report');
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 22');
    })();
  }
  if (schemaVersion < 23) {
    connection.transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS extracurricular_attendance_sessions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, extracurricular_schedule_id TEXT NOT NULL REFERENCES extracurricular_schedules(id) ON DELETE RESTRICT, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE RESTRICT, extracurricular_id TEXT NOT NULL REFERENCES extracurriculars(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')), extracurricular_name TEXT NOT NULL, teacher_name TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (extracurricular_schedule_id, attendance_date));
        CREATE TABLE IF NOT EXISTS extracurricular_attendance_records (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES extracurricular_attendance_sessions(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, student_nis TEXT NOT NULL, student_name TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('present', 'late', 'sick', 'excused', 'absent')), note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'admin', 'qr', 'native_app')), updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (session_id, student_id));
        CREATE INDEX IF NOT EXISTS extracurricular_attendance_sessions_date ON extracurricular_attendance_sessions(school_id, attendance_date DESC);
        CREATE INDEX IF NOT EXISTS extracurricular_attendance_records_student ON extracurricular_attendance_records(student_id, session_id);
      `);
      const storedRoles = connection.prepare('SELECT id, name, permissions FROM roles').all() as {
        id: string;
        name: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (role.name === 'Administrator' || grants.has('extracurricular-assignments.write')) {
          grants.add('extracurricular-attendance.read');
          grants.add('extracurricular-attendance.write');
          grants.add('extracurricular-attendance.approve');
        }
        if (role.name === 'Guru') {
          grants.add('extracurricular-attendance.read');
          grants.add('extracurricular-attendance.write');
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 23');
    })();
  }
  if (schemaVersion < 24) {
    const columns = connection.pragma('table_info(extracurricular_attendance_records)') as {
      name: string;
    }[];
    if (!columns.some((column) => column.name === 'class_name'))
      connection.exec(
        "ALTER TABLE extracurricular_attendance_records ADD COLUMN class_name TEXT NOT NULL DEFAULT ''",
      );
    connection.pragma('user_version = 24');
  }
  if (schemaVersion < 25) {
    connection.exec(`
      UPDATE extracurricular_attendance_records AS ar
      SET class_name=COALESCE((
        SELECT c.name FROM extracurricular_attendance_sessions AS ats
        JOIN extracurricular_assignments AS ea ON ea.id=ats.assignment_id
        JOIN class_memberships AS cm ON cm.student_id=ar.student_id
          AND cm.academic_year_id=ea.academic_year_id AND cm.status='active'
        JOIN classes AS c ON c.id=cm.class_id
        WHERE ats.id=ar.session_id LIMIT 1
      ), '—')
      WHERE ar.class_name=''
    `);
    connection.pragma('user_version = 25');
  }
  if (schemaVersion < 26) {
    const columns = connection.pragma('table_info(users)') as { name: string }[];
    if (!columns.some((column) => column.name === 'must_change_password'))
      connection.exec(
        'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))',
      );
    connection.pragma('user_version = 26');
  }
  if (schemaVersion < 27) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(students)') as { name: string }[];
      if (!columns.some((column) => column.name === 'qr_token'))
        connection.exec("ALTER TABLE students ADD COLUMN qr_token TEXT NOT NULL DEFAULT ''");
      connection.exec(`
        UPDATE students SET qr_token=lower(hex(randomblob(24))) WHERE qr_token='';
        CREATE UNIQUE INDEX IF NOT EXISTS students_qr_token ON students(qr_token) WHERE qr_token<>'';
      `);
      connection
        .prepare('INSERT OR IGNORE INTO roles(id,name,description,permissions) VALUES (?,?,?,?)')
        .run(
          'scanner',
          'Scanner',
          'Akun khusus perangkat scanner cek-in di pintu masuk.',
          JSON.stringify(['student-checkins.read', 'student-checkins.write']),
        );
      connection.pragma('user_version = 27');
    })();
  }
  if (schemaVersion < 28) {
    const columns = connection.pragma('table_info(schools)') as { name: string }[];
    if (!columns.some((column) => column.name === 'checkin_late_after'))
      connection.exec(
        "ALTER TABLE schools ADD COLUMN checkin_late_after TEXT NOT NULL DEFAULT '07:15'",
      );
    connection.pragma('user_version = 28');
  }
  if (schemaVersion < 29) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(teachers)') as { name: string }[];
      if (!columns.some((column) => column.name === 'qr_token'))
        connection.exec("ALTER TABLE teachers ADD COLUMN qr_token TEXT NOT NULL DEFAULT ''");
      connection.exec(`
        UPDATE teachers SET qr_token=lower(hex(randomblob(24))) WHERE qr_token='';
        CREATE UNIQUE INDEX IF NOT EXISTS teachers_qr_token ON teachers(qr_token) WHERE qr_token<>'';
        CREATE TABLE IF NOT EXISTS teacher_checkins (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teacher_id, attendance_date));
        CREATE INDEX IF NOT EXISTS teacher_checkins_school_date ON teacher_checkins(school_id, attendance_date DESC);
        CREATE INDEX IF NOT EXISTS teacher_checkins_teacher_date ON teacher_checkins(teacher_id, attendance_date DESC);
      `);
      const storedRoles = connection.prepare('SELECT id,name,permissions FROM roles').all() as {
        id: string;
        name: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions=? WHERE id=?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (role.name === 'Administrator' || grants.has('teachers.write')) {
          grants.add('teacher-checkins.read');
          grants.add('teacher-checkins.write');
          grants.add('teacher-checkins.report');
        }
        if (role.id === 'scanner') {
          grants.add('teacher-checkins.read');
          grants.add('teacher-checkins.write');
        }
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 29');
    })();
  }
  if (schemaVersion < 30) {
    connection.transaction(() => {
      const storedRoles = connection.prepare('SELECT id,permissions FROM roles').all() as {
        id: string;
        permissions: string;
      }[];
      const updateRole = connection.prepare('UPDATE roles SET permissions=? WHERE id=?');
      for (const role of storedRoles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        const hadRead =
          grants.delete('student-checkins.read') || grants.delete('teacher-checkins.read');
        const hadWrite =
          grants.delete('student-checkins.write') || grants.delete('teacher-checkins.write');
        const hadReport =
          grants.delete('student-checkins.report') || grants.delete('teacher-checkins.report');
        // Delete the counterpart even when short-circuiting above found the first permission.
        grants.delete('student-checkins.read');
        grants.delete('teacher-checkins.read');
        grants.delete('student-checkins.write');
        grants.delete('teacher-checkins.write');
        grants.delete('student-checkins.report');
        grants.delete('teacher-checkins.report');
        if (hadRead) grants.add('checkins.read');
        if (hadWrite) grants.add('checkins.write');
        if (hadReport) grants.add('checkins.report');
        updateRole.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 30');
    })();
  }
  if (schemaVersion < 31) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'schedule_weekdays'))
        connection.exec(
          "ALTER TABLE schools ADD COLUMN schedule_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5]'",
        );
      connection.pragma('user_version = 31');
    })();
  }
  if (schemaVersion < 32) {
    const classScheduleSql = connection
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='class_schedules'")
      .get() as { sql: string } | undefined;
    if (classScheduleSql?.sql.includes('BETWEEN 1 AND 6')) {
      connection.pragma('foreign_keys = OFF');
      try {
        connection.transaction(() => {
          connection.exec(`
            CREATE TABLE class_schedules_new (id TEXT PRIMARY KEY, teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE RESTRICT, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teaching_assignment_id, semester_id, time_slot_id, weekday));
            INSERT INTO class_schedules_new SELECT * FROM class_schedules;
            DROP TABLE class_schedules;
            ALTER TABLE class_schedules_new RENAME TO class_schedules;
            CREATE INDEX class_schedules_semester_day_slot ON class_schedules(semester_id, weekday, time_slot_id);

            CREATE TABLE extracurricular_schedules_new (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES extracurricular_assignments(id) ON DELETE CASCADE, semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT, time_slot_id TEXT NOT NULL REFERENCES schedule_time_slots(id) ON DELETE RESTRICT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (assignment_id, semester_id, time_slot_id, weekday));
            INSERT INTO extracurricular_schedules_new SELECT * FROM extracurricular_schedules;
            DROP TABLE extracurricular_schedules;
            ALTER TABLE extracurricular_schedules_new RENAME TO extracurricular_schedules;
            CREATE INDEX extracurricular_schedules_period ON extracurricular_schedules(semester_id, weekday, time_slot_id);
          `);
          connection.pragma('user_version = 32');
        })();
      } finally {
        connection.pragma('foreign_keys = ON');
      }
    } else {
      connection.pragma('user_version = 32');
    }
  }
  if (schemaVersion < 33) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'education_level'))
        connection.exec("ALTER TABLE schools ADD COLUMN education_level TEXT NOT NULL DEFAULT ''");
      if (!columns.some((column) => column.name === 'onboarding_completed_at'))
        connection.exec('ALTER TABLE schools ADD COLUMN onboarding_completed_at TEXT');
      connection.pragma('user_version = 33');
    })();
  }
  if (schemaVersion < 34) {
    connection.pragma('user_version = 34');
  }
  if (schemaVersion < 35) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'principal_name'))
        connection.exec("ALTER TABLE schools ADD COLUMN principal_name TEXT NOT NULL DEFAULT ''");
      if (!columns.some((column) => column.name === 'principal_nip'))
        connection.exec("ALTER TABLE schools ADD COLUMN principal_nip TEXT NOT NULL DEFAULT ''");
      if (!columns.some((column) => column.name === 'principal_signature_url'))
        connection.exec(
          "ALTER TABLE schools ADD COLUMN principal_signature_url TEXT NOT NULL DEFAULT ''",
        );
      connection.pragma('user_version = 35');
    })();
  }
  if (schemaVersion < 36) {
    connection.transaction(() => {
      const teacherColumns = connection.pragma('table_info(teachers)') as { name: string }[];
      if (!teacherColumns.some((column) => column.name === 'blood_type'))
        connection.exec(
          "ALTER TABLE teachers ADD COLUMN blood_type TEXT NOT NULL DEFAULT '' CHECK (blood_type IN ('', 'A', 'B', 'AB', 'O'))",
        );
      const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
      if (!studentColumns.some((column) => column.name === 'blood_type'))
        connection.exec(
          "ALTER TABLE students ADD COLUMN blood_type TEXT NOT NULL DEFAULT '' CHECK (blood_type IN ('', 'A', 'B', 'AB', 'O'))",
        );
      connection.pragma('user_version = 36');
    })();
  }
  if (schemaVersion < 37) {
    connection.transaction(() => {
      const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
      const studentFields = [
        'previous_school_name',
        'previous_school_npsn',
        'previous_school_address',
        'previous_school_last_grade',
        'previous_school_graduation_year',
      ];
      for (const field of studentFields)
        if (!studentColumns.some((column) => column.name === field))
          connection.exec(`ALTER TABLE students ADD COLUMN ${field} TEXT NOT NULL DEFAULT ''`);
      const guardianColumns = connection.pragma('table_info(guardians)') as { name: string }[];
      if (!guardianColumns.some((column) => column.name === 'nik'))
        connection.exec("ALTER TABLE guardians ADD COLUMN nik TEXT NOT NULL DEFAULT ''");
      connection.pragma('user_version = 37');
    })();
  }
  if (schemaVersion < 38) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(classes)') as { name: string }[];
      if (columns.some((column) => column.name === 'capacity'))
        connection.exec('ALTER TABLE classes DROP COLUMN capacity');
      connection.pragma('user_version = 38');
    })();
  }
  if (schemaVersion < 39) {
    connection.pragma('foreign_keys = OFF');
    try {
      connection.transaction(() => {
        connection.exec(`
          CREATE TABLE student_checkins_new (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (student_id, attendance_date));
          INSERT INTO student_checkins_new SELECT * FROM student_checkins;
          DROP TABLE student_checkins;
          ALTER TABLE student_checkins_new RENAME TO student_checkins;
          CREATE INDEX student_checkins_school_date ON student_checkins(school_id, attendance_date DESC);
          CREATE INDEX student_checkins_student_date ON student_checkins(student_id, attendance_date DESC);

          CREATE TABLE teacher_checkins_new (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT, attendance_date TEXT NOT NULL, checked_in_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')), source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'qr', 'native_app', 'card')), note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (teacher_id, attendance_date));
          INSERT INTO teacher_checkins_new SELECT * FROM teacher_checkins;
          DROP TABLE teacher_checkins;
          ALTER TABLE teacher_checkins_new RENAME TO teacher_checkins;
          CREATE INDEX teacher_checkins_school_date ON teacher_checkins(school_id, attendance_date DESC);
          CREATE INDEX teacher_checkins_teacher_date ON teacher_checkins(teacher_id, attendance_date DESC);
        `);
        connection.pragma('user_version = 39');
      })();
    } finally {
      connection.pragma('foreign_keys = ON');
    }
  }
  if (schemaVersion < 40) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'checkin_absent_after'))
        connection.exec(
          "ALTER TABLE schools ADD COLUMN checkin_absent_after TEXT NOT NULL DEFAULT ''",
        );
      connection.pragma('user_version = 40');
    })();
  }
  if (schemaVersion < 41) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'schedule_bell_enabled'))
        connection.exec(
          'ALTER TABLE schools ADD COLUMN schedule_bell_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_bell_enabled IN (0, 1))',
        );
      connection.pragma('user_version = 41');
    })();
  }
  if (schemaVersion < 42) {
    connection.transaction(() => {
      const columns = connection.pragma('table_info(schools)') as { name: string }[];
      if (!columns.some((column) => column.name === 'schedule_bell_sound_url'))
        connection.exec(
          "ALTER TABLE schools ADD COLUMN schedule_bell_sound_url TEXT NOT NULL DEFAULT ''",
        );
      connection.pragma('user_version = 42');
    })();
  }
  if (schemaVersion < 43) {
    connection.transaction(() => {
      const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
      if (!studentColumns.some((column) => column.name === 'nik'))
        connection.exec("ALTER TABLE students ADD COLUMN nik TEXT NOT NULL DEFAULT ''");
      connection.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS students_school_nik ON students(school_id,nik) WHERE nik<>'';
        CREATE TABLE IF NOT EXISTS admission_periods (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')), registration_prefix TEXT NOT NULL DEFAULT 'PMB', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date <= end_date), UNIQUE (school_id,name));
        CREATE TABLE IF NOT EXISTS student_applications (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, admission_period_id TEXT NOT NULL REFERENCES admission_periods(id) ON DELETE RESTRICT, registration_number TEXT NOT NULL, tracking_token TEXT NOT NULL UNIQUE, nik TEXT NOT NULL DEFAULT '', nisn TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('male','female')), birth_date TEXT, birth_place TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', previous_school_name TEXT NOT NULL DEFAULT '', previous_school_npsn TEXT NOT NULL DEFAULT '', previous_school_address TEXT NOT NULL DEFAULT '', previous_school_last_grade TEXT NOT NULL DEFAULT '', previous_school_graduation_year TEXT NOT NULL DEFAULT '', target_grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT, admission_path TEXT NOT NULL DEFAULT 'Reguler', status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','needs_revision','verified','selection','accepted','waitlisted','rejected','reregistered','converted')), verification_notes TEXT NOT NULL DEFAULT '', assessment_test REAL, assessment_interview REAL, assessment_final REAL, ranking INTEGER, decision_notes TEXT NOT NULL DEFAULT '', verified_by TEXT, verified_at TEXT, submitted_at TEXT, converted_student_id TEXT REFERENCES students(id) ON DELETE RESTRICT, created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id,registration_number));
        CREATE TABLE IF NOT EXISTS application_guardians (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, name TEXT NOT NULL, nik TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS application_documents (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, type TEXT NOT NULL, file_url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)), verification_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS application_status_history (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE INDEX IF NOT EXISTS admission_periods_school_dates ON admission_periods(school_id,start_date DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS applications_period_nik ON student_applications(admission_period_id,nik) WHERE nik<>'';
        CREATE UNIQUE INDEX IF NOT EXISTS applications_period_nisn ON student_applications(admission_period_id,nisn) WHERE nisn<>'';
        CREATE INDEX IF NOT EXISTS applications_school_status ON student_applications(school_id,status,created_at DESC);
        CREATE INDEX IF NOT EXISTS applications_period_status ON student_applications(admission_period_id,status,created_at DESC);
        CREATE INDEX IF NOT EXISTS application_guardians_application ON application_guardians(application_id);
        CREATE INDEX IF NOT EXISTS application_documents_application ON application_documents(application_id);
        CREATE INDEX IF NOT EXISTS application_history_application ON application_status_history(application_id,created_at DESC);
      `);
      connection.pragma('user_version = 43');
    })();
  }
  if (schemaVersion < 44) {
    connection.transaction(() => {
      const roles = connection.prepare('SELECT id,name,permissions FROM roles').all() as Array<{
        id: string;
        name: string;
        permissions: string;
      }>;
      const update = connection.prepare('UPDATE roles SET permissions=? WHERE id=?');
      for (const role of roles) {
        const grants = new Set<string>(JSON.parse(role.permissions));
        if (role.name === 'Administrator' || role.name === 'Editor') {
          grants.add('admissions.read');
          grants.add('admissions.write');
        } else if (role.name === 'Viewer') {
          grants.add('admissions.read');
        }
        update.run(JSON.stringify([...grants]), role.id);
      }
      connection.pragma('user_version = 44');
    })();
  }
  if (schemaVersion < 45) {
    connection.transaction(() => {
      const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
      const applicationColumns = connection.pragma('table_info(student_applications)') as {
        name: string;
      }[];
      const fields = [
        ['family_card_number', "TEXT NOT NULL DEFAULT ''"],
        ['religion', "TEXT NOT NULL DEFAULT ''"],
        ['citizenship', "TEXT NOT NULL DEFAULT 'Indonesia'"],
        ['child_order', 'INTEGER NOT NULL DEFAULT 0'],
        ['sibling_count', 'INTEGER NOT NULL DEFAULT 0'],
        ['birth_certificate_number', "TEXT NOT NULL DEFAULT ''"],
        ['has_special_needs', 'INTEGER NOT NULL DEFAULT 0 CHECK (has_special_needs IN (0,1))'],
        ['special_needs_type', "TEXT NOT NULL DEFAULT ''"],
      ] as const;
      for (const [name, definition] of fields) {
        if (!studentColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE students ADD COLUMN ${name} ${definition}`);
        if (!applicationColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE student_applications ADD COLUMN ${name} ${definition}`);
      }
      if (!applicationColumns.some((column) => column.name === 'photo_url'))
        connection.exec(
          "ALTER TABLE student_applications ADD COLUMN photo_url TEXT NOT NULL DEFAULT ''",
        );
      connection.pragma('user_version = 45');
    })();
  }
  if (schemaVersion < 46) {
    connection.transaction(() => {
      const studentColumns = connection.pragma('table_info(students)') as { name: string }[];
      const applicationColumns = connection.pragma('table_info(student_applications)') as {
        name: string;
      }[];
      const fields = [
        ['province_code', "TEXT NOT NULL DEFAULT ''"],
        ['province_name', "TEXT NOT NULL DEFAULT ''"],
        ['regency_code', "TEXT NOT NULL DEFAULT ''"],
        ['regency_name', "TEXT NOT NULL DEFAULT ''"],
        ['district_code', "TEXT NOT NULL DEFAULT ''"],
        ['district_name', "TEXT NOT NULL DEFAULT ''"],
        ['village_code', "TEXT NOT NULL DEFAULT ''"],
        ['village_name', "TEXT NOT NULL DEFAULT ''"],
        ['rt', "TEXT NOT NULL DEFAULT ''"],
        ['rw', "TEXT NOT NULL DEFAULT ''"],
        ['postal_code', "TEXT NOT NULL DEFAULT ''"],
        [
          'domicile_matches_family_card',
          'INTEGER NOT NULL DEFAULT 0 CHECK (domicile_matches_family_card IN (0,1))',
        ],
        ['family_card_issued_date', 'TEXT'],
        ['latitude', 'REAL'],
        ['longitude', 'REAL'],
        ['home_distance_km', 'REAL'],
      ] as const;
      for (const [name, definition] of fields) {
        if (!studentColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE students ADD COLUMN ${name} ${definition}`);
        if (!applicationColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE student_applications ADD COLUMN ${name} ${definition}`);
      }
      connection.exec(`
        CREATE TABLE IF NOT EXISTS administrative_regions (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL DEFAULT '',
          level TEXT NOT NULL CHECK (level IN ('province','regency','district','village')),
          name TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS administrative_regions_parent ON administrative_regions(level,parent_id,name);
      `);
      connection.pragma('user_version = 46');
    })();
  }
  if (schemaVersion < 47) {
    connection.transaction(() => {
      const guardianColumns = connection.pragma('table_info(guardians)') as { name: string }[];
      const applicationGuardianColumns = connection.pragma('table_info(application_guardians)') as {
        name: string;
      }[];
      const fields = [
        ['life_status', "TEXT NOT NULL DEFAULT ''"],
        ['birth_place', "TEXT NOT NULL DEFAULT ''"],
        ['birth_date', 'TEXT'],
        ['last_education', "TEXT NOT NULL DEFAULT ''"],
        ['occupation', "TEXT NOT NULL DEFAULT ''"],
        ['monthly_income', 'INTEGER NOT NULL DEFAULT 0'],
        [
          'address_matches_student',
          'INTEGER NOT NULL DEFAULT 0 CHECK (address_matches_student IN (0,1))',
        ],
      ] as const;
      for (const [name, definition] of fields) {
        if (!guardianColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE guardians ADD COLUMN ${name} ${definition}`);
        if (!applicationGuardianColumns.some((column) => column.name === name))
          connection.exec(`ALTER TABLE application_guardians ADD COLUMN ${name} ${definition}`);
      }
      connection.pragma('user_version = 47');
    })();
  }
  globalDb.cmsDb = connection;
  return connection;
}
export function audit(
  actor: string,
  action: string,
  entity: string,
  entityId?: string,
  details: unknown = {},
) {
  db()
    .prepare('INSERT INTO audit(actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(actor, action, entity, entityId ?? null, JSON.stringify(details));
}
