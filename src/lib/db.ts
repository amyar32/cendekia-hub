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
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', npsn TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', logo_url TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, scope TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS academic_years (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date < end_date), UNIQUE (school_id, name));
    CREATE TABLE IF NOT EXISTS semesters (id TEXT PRIMARY KEY, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, name TEXT NOT NULL, period INTEGER NOT NULL CHECK (period IN (1, 2)), start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (start_date < end_date), UNIQUE (academic_year_id, period), UNIQUE (academic_year_id, name));
    CREATE TABLE IF NOT EXISTS grades (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, name TEXT NOT NULL, level_order INTEGER NOT NULL CHECK (level_order > 0), description TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, name), UNIQUE (school_id, level_order));
    CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, academic_year_id, name));
    CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT, code TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (school_id, code), UNIQUE (school_id, name));
    CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
    CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at);
    CREATE INDEX IF NOT EXISTS academic_years_school_dates ON academic_years(school_id, start_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school ON academic_years(school_id) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS semesters_academic_year_period ON semesters(academic_year_id, period);
    CREATE INDEX IF NOT EXISTS grades_school_order ON grades(school_id, level_order);
    CREATE INDEX IF NOT EXISTS classes_school_year_grade ON classes(school_id, academic_year_id, grade_id);
    CREATE INDEX IF NOT EXISTS subjects_school_name ON subjects(school_id, name);
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
