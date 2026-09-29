import type Database from 'better-sqlite3';

export function migratePoints(connection: Database.Database) {
  connection.transaction(() => {
    connection.exec(`
      CREATE TABLE point_rules (
        id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
        name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('appreciation','violation')),
        points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 1000), category TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
      );
      CREATE TABLE student_point_entries (
        id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
        student_id TEXT NOT NULL REFERENCES students(id), semester_id TEXT NOT NULL REFERENCES semesters(id),
        class_id TEXT NOT NULL REFERENCES classes(id), rule_id TEXT NOT NULL REFERENCES point_rules(id),
        rule_name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('appreciation','violation')),
        points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 1000), occurred_on TEXT NOT NULL, note TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','voided')),
        created_by TEXT NOT NULL REFERENCES users(id), reviewed_by TEXT REFERENCES users(id),
        reviewed_at TEXT, review_reason TEXT NOT NULL DEFAULT '',
        voided_by TEXT REFERENCES users(id), voided_at TEXT, void_reason TEXT NOT NULL DEFAULT '',
        client_request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(created_by,client_request_id)
      );
      CREATE INDEX point_entries_student_semester ON student_point_entries(school_id,student_id,semester_id,status);
      CREATE INDEX point_entries_creator ON student_point_entries(created_by,created_at);
      CREATE TABLE point_entry_attachments (
        id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES student_point_entries(id),
        original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880),
        content BLOB NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX point_attachments_entry ON point_entry_attachments(entry_id);
      CREATE TABLE coaching_policies (
        id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
        name TEXT NOT NULL, threshold INTEGER NOT NULL CHECK(threshold BETWEEN 1 AND 10000),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
      );
      CREATE TABLE student_coaching_cases (
        id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
        student_id TEXT NOT NULL REFERENCES students(id), semester_id TEXT NOT NULL REFERENCES semesters(id),
        policy_id TEXT REFERENCES coaching_policies(id), title TEXT NOT NULL, note TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
        responsible_user_id TEXT REFERENCES users(id), due_date TEXT, resolution TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(student_id,semester_id,policy_id)
      );
      CREATE TABLE coaching_activities (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES student_coaching_cases(id),
        note TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const roles = connection
      .prepare('SELECT id,permissions FROM roles WHERE id IN (?,?)')
      .all('admin', 'teacher') as { id: string; permissions: string }[];
    for (const role of roles) {
      const grants = new Set<string>(JSON.parse(role.permissions));
      grants.add('points.read');
      grants.add('points.write');
      if (role.id === 'admin') grants.add('points.manage');
      connection
        .prepare('UPDATE roles SET permissions=? WHERE id=?')
        .run(JSON.stringify([...grants]), role.id);
    }
    connection.pragma('user_version = 55');
  })();
}
