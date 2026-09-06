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
  connection.exec(`
    CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', permissions TEXT NOT NULL, system INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
    PRAGMA user_version = 1;
  `);
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
