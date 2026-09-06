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
    CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
    CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at);
    CREATE INDEX IF NOT EXISTS academic_years_school_dates ON academic_years(school_id, start_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school ON academic_years(school_id) WHERE is_active = 1;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
  `);

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
