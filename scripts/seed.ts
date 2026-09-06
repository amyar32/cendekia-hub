import { randomUUID } from 'node:crypto';
import { db, audit } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { permissions } from '../src/config/modules';
const email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set SEED_ADMIN_PASSWORD minimal 12 karakter sebelum seeding.');
db().transaction(() => {
  db()
    .prepare(
      'INSERT OR IGNORE INTO roles(id,name,description,permissions,system) VALUES (?,?,?,?,1)',
    )
    .run('admin', 'Administrator', 'Akses penuh ke seluruh workspace', JSON.stringify(permissions));
  db()
    .prepare('INSERT OR IGNORE INTO roles(id,name,description,permissions) VALUES (?,?,?,?)')
    .run(
      'editor',
      'Editor',
      'Mengelola master data',
      JSON.stringify([
        'dashboard.read',
        'academic-years.read',
        'academic-years.write',
        'semesters.read',
        'semesters.write',
        'grades.read',
        'grades.write',
        'classes.read',
        'classes.write',
        'subjects.read',
        'subjects.write',
        'teachers.read',
        'teachers.write',
        'teacher-subjects.read',
        'teacher-subjects.write',
        'teaching-assignments.read',
        'teaching-assignments.write',
        'homeroom-assignments.read',
        'homeroom-assignments.write',
      ]),
    );
  db()
    .prepare('INSERT OR IGNORE INTO roles(id,name,description,permissions) VALUES (?,?,?,?)')
    .run(
      'viewer',
      'Viewer',
      'Akses baca untuk master data',
      JSON.stringify([
        'dashboard.read',
        'academic-years.read',
        'semesters.read',
        'grades.read',
        'classes.read',
        'subjects.read',
        'teachers.read',
        'teacher-subjects.read',
        'teaching-assignments.read',
        'homeroom-assignments.read',
      ]),
    );
  if (!db().prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    const id = randomUUID();
    db()
      .prepare('INSERT INTO users(id,name,email,password,role_id) VALUES (?,?,?,?,?)')
      .run(id, 'Administrator', email, hashPassword(password), 'admin');
    audit('system', 'create', 'users', id, { email });
  }
})();
console.log(
  `Database siap. Login menggunakan ${email}. Password akun yang sudah ada tidak diubah.`,
);
