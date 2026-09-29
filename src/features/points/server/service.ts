import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { can } from '@/config/modules';
import { audit, db } from '@/lib/db';
import { MobileApiError } from '@/lib/mobile-api';
import { queuePushNotification } from '@/lib/notifications/push';
import { isoDateSchema } from '@/lib/validation';
import { schoolLocalDate } from '@/lib/server/academic-context';

export type PointActor = {
  user_id: string;
  email: string;
  school_id: string;
  teacher_id?: string;
  permissions: string[];
};
type Row = Record<string, string | number | null>;
export const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const optionalId = uuid.optional();
export const ruleSchema = z
  .object({
    name: text.max(120),
    kind: z.enum(['appreciation', 'violation']),
    points: z.number().int().min(1).max(1000),
    category: z.string().trim().max(100).default(''),
    is_active: z.boolean().default(true),
  })
  .strict();
export const policySchema = z
  .object({
    name: text.max(120),
    threshold: z.number().int().min(1).max(10000),
    is_active: z.boolean().default(true),
  })
  .strict();
const entrySchema = z
  .object({
    student_id: uuid,
    rule_id: uuid,
    semester_id: uuid,
    occurred_on: isoDateSchema(),
    note: text,
    client_request_id: uuid,
  })
  .strict();
const caseSchema = z
  .object({
    student_id: uuid,
    semester_id: uuid,
    title: text.max(120),
    note: text,
    due_date: isoDateSchema().nullable().optional(),
  })
  .strict();
export function fail(status: number, code: string, message: string): never {
  throw new MobileApiError(status, code, message);
}
export function manager(a: PointActor) {
  return can(a.permissions, 'points.manage');
}
export function requireWrite(a: PointActor) {
  if (!can(a.permissions, 'points.write'))
    fail(403, 'FORBIDDEN', 'Anda tidak memiliki izin mencatat poin.');
}
export function requireManager(a: PointActor) {
  if (!manager(a)) fail(403, 'FORBIDDEN', 'Pengaturan hanya untuk pengelola poin.');
}
export function homeroomClass(a: PointActor): string | null {
  if (!a.teacher_id) return null;
  const row = db()
    .prepare(
      `SELECT ha.class_id FROM homeroom_assignments ha JOIN academic_years y ON y.id=ha.academic_year_id JOIN classes c ON c.id=ha.class_id WHERE ha.teacher_id=? AND y.school_id=? AND y.is_active=1 AND c.is_active=1`,
    )
    .get(a.teacher_id, a.school_id) as Row | undefined;
  return row ? String(row.class_id) : null;
}
export function student(a: PointActor, id: string, active = false) {
  const row = db()
    .prepare(
      `SELECT id,name FROM students WHERE id=? AND school_id=? ${active ? 'AND is_active=1' : ''}`,
    )
    .get(uuid.parse(id), a.school_id) as Row | undefined;
  if (!row) fail(404, 'STUDENT_NOT_FOUND', 'Murid tidak ditemukan.');
  return row;
}
export function mayManageStudent(a: PointActor, id: string) {
  if (manager(a)) return true;
  const classId = homeroomClass(a);
  return (
    !!classId &&
    !!db()
      .prepare(
        `SELECT 1 FROM class_memberships cm JOIN students s ON s.id=cm.student_id WHERE cm.class_id=? AND cm.student_id=? AND cm.status='active' AND s.school_id=? AND s.is_active=1`,
      )
      .get(classId, id, a.school_id)
  );
}
export function requireStudentManager(a: PointActor, id: string) {
  student(a, id);
  if (!mayManageStudent(a, id))
    fail(403, 'STUDENT_SCOPE_FORBIDDEN', 'Hanya wali kelas murid atau admin yang dapat mengakses.');
}
function semester(a: PointActor, id: string) {
  const row = db()
    .prepare(
      `SELECT s.*,y.is_active AS year_active FROM semesters s JOIN academic_years y ON y.id=s.academic_year_id WHERE s.id=? AND y.school_id=?`,
    )
    .get(uuid.parse(id), a.school_id) as Row | undefined;
  if (!row) fail(404, 'SEMESTER_NOT_FOUND', 'Semester tidak ditemukan.');
  return row;
}
function membership(a: PointActor, id: string, yearId: string) {
  const row = db()
    .prepare(
      `SELECT cm.class_id FROM class_memberships cm JOIN classes c ON c.id=cm.class_id WHERE cm.student_id=? AND cm.academic_year_id=? AND cm.status='active' AND c.school_id=? AND c.is_active=1`,
    )
    .get(id, yearId, a.school_id) as Row | undefined;
  if (!row)
    fail(409, 'STUDENT_CLASS_REQUIRED', 'Murid belum memiliki kelas aktif pada tahun ajaran ini.');
  return String(row.class_id);
}
function pagination(q: URLSearchParams) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(q.get('page') || 1);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(q.get('page_size') || 20);
  return { page, page_size: pageSize, offset: (page - 1) * pageSize };
}
function list(sql: string, params: (string | number | null)[], q: URLSearchParams) {
  const p = pagination(q);
  const total = (
    db()
      .prepare(`SELECT count(*) AS n FROM (${sql})`)
      .get(...params) as { n: number }
  ).n;
  return {
    rows: db()
      .prepare(`${sql} LIMIT ? OFFSET ?`)
      .all(...params, p.page_size, p.offset),
    total,
    page: p.page,
    page_size: p.page_size,
  };
}
export function options(a: PointActor) {
  return {
    capabilities: {
      can_write: can(a.permissions, 'points.write'),
      can_manage: manager(a),
      homeroom_class_id: homeroomClass(a),
    },
    semesters: db()
      .prepare(
        `SELECT s.id,s.name,y.name AS academic_year_name,s.is_active,y.is_active AS year_active FROM semesters s JOIN academic_years y ON y.id=s.academic_year_id WHERE y.school_id=? ORDER BY y.start_date DESC,s.period DESC`,
      )
      .all(a.school_id),
    classes: db()
      .prepare(
        `SELECT c.id,c.name FROM classes c JOIN academic_years y ON y.id=c.academic_year_id WHERE c.school_id=? AND y.is_active=1 AND c.is_active=1 ORDER BY c.name`,
      )
      .all(a.school_id),
  };
}
export function listStudents(a: PointActor, q: URLSearchParams) {
  const search = z
    .string()
    .max(100)
    .parse(q.get('search') || '');
  const classId = optionalId.parse(q.get('class_id') || undefined);
  return list(
    `SELECT s.id,s.name,s.nis,s.photo_url,c.id AS class_id,c.name AS class_name FROM students s LEFT JOIN class_memberships cm ON cm.student_id=s.id AND cm.status='active' AND cm.academic_year_id IN (SELECT id FROM academic_years WHERE school_id=s.school_id AND is_active=1) LEFT JOIN classes c ON c.id=cm.class_id WHERE s.school_id=? AND s.is_active=1 AND (s.name LIKE ? OR s.nis LIKE ?) AND (? IS NULL OR c.id=?) ORDER BY s.name,s.id`,
    [a.school_id, `%${search}%`, `%${search}%`, classId || null, classId || null],
    q,
  );
}
export function listMaster(a: PointActor, type: 'rules' | 'policies', q: URLSearchParams) {
  const table = type === 'rules' ? 'point_rules' : 'coaching_policies';
  return list(
    `SELECT * FROM ${table} WHERE school_id=? ${manager(a) ? '' : 'AND is_active=1'} ORDER BY ${type === 'rules' ? 'name' : 'threshold'},id`,
    [a.school_id],
    q,
  );
}
export function saveMaster(a: PointActor, type: 'rules' | 'policies', input: unknown, id?: string) {
  requireManager(a);
  requireWrite(a);
  const table = type === 'rules' ? 'point_rules' : 'coaching_policies';
  const data = type === 'rules' ? ruleSchema.parse(input) : policySchema.parse(input);
  return db().transaction(() => {
    if (
      id &&
      !db()
        .prepare(`SELECT id FROM ${table} WHERE id=? AND school_id=?`)
        .get(uuid.parse(id), a.school_id)
    )
      fail(404, 'NOT_FOUND', 'Aturan tidak ditemukan.');
    const recordId = id || randomUUID();
    const values = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'boolean' ? Number(v) : v]),
    );
    if (id)
      db()
        .prepare(
          `UPDATE ${table} SET ${Object.keys(values)
            .map((k) => `${k}=@${k}`)
            .join(',')} WHERE id=@id`,
        )
        .run({ ...values, id });
    else
      db()
        .prepare(
          `INSERT INTO ${table}(id,school_id,${Object.keys(values).join(',')}) VALUES (@id,@school_id,${Object.keys(
            values,
          )
            .map((k) => `@${k}`)
            .join(',')})`,
        )
        .run({ ...values, id: recordId, school_id: a.school_id });
    audit(a.email, id ? 'update' : 'create', table, recordId, data);
    return db().prepare(`SELECT * FROM ${table} WHERE id=?`).get(recordId);
  })();
}
export function getEntry(a: PointActor, id: string) {
  const row = db()
    .prepare(
      `SELECT e.*,s.name AS student_name,c.name AS class_name,u.name AS created_by_name FROM student_point_entries e JOIN students s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=e.created_by WHERE e.id=? AND e.school_id=?`,
    )
    .get(uuid.parse(id), a.school_id) as Row | undefined;
  if (!row || (row.created_by !== a.user_id && !mayManageStudent(a, String(row.student_id))))
    fail(404, 'ENTRY_NOT_FOUND', 'Catatan tidak ditemukan.');
  return row;
}
export function entryDetail(a: PointActor, id: string) {
  const row = getEntry(a, id);
  return {
    ...row,
    id: String(row.id),
    status: String(row.status),
    can_review: Number(
      can(a.permissions, 'points.write') && mayManageStudent(a, String(row.student_id)),
    ),
    can_attach: Number(
      can(a.permissions, 'points.write') &&
        row.created_by === a.user_id &&
        (row.status === 'pending' || (row.status === 'approved' && row.reviewed_by === a.user_id)),
    ),
    attachments: db()
      .prepare(
        'SELECT id,original_name,mime_type,size,created_at FROM point_entry_attachments WHERE entry_id=? ORDER BY created_at,id',
      )
      .all(id),
  };
}
export function listEntries(a: PointActor, q: URLSearchParams) {
  const scope = z.enum(['accessible', 'mine', 'homeroom']).parse(q.get('scope') || 'accessible');
  const status = z
    .enum(['pending', 'approved', 'rejected', 'voided'])
    .optional()
    .parse(q.get('status') || undefined);
  const kind = z
    .enum(['appreciation', 'violation'])
    .optional()
    .parse(q.get('kind') || undefined);
  const studentId = optionalId.parse(q.get('student_id') || undefined);
  const semesterId = optionalId.parse(q.get('semester_id') || undefined);
  const classId = optionalId.parse(q.get('class_id') || undefined);
  const from = isoDateSchema()
    .optional()
    .parse(q.get('from') || undefined);
  const to = isoDateSchema()
    .optional()
    .parse(q.get('to') || undefined);
  const home = homeroomClass(a);
  const homeSql = `EXISTS(SELECT 1 FROM class_memberships cm JOIN students hs ON hs.id=cm.student_id WHERE cm.student_id=e.student_id AND cm.class_id=? AND cm.status='active' AND hs.is_active=1)`;
  let where = 'e.school_id=?';
  const args: (string | number | null)[] = [a.school_id];
  if (scope === 'mine') {
    where += ' AND e.created_by=?';
    args.push(a.user_id);
  } else if (scope === 'homeroom') {
    where += ` AND ${homeSql}`;
    args.push(home);
  } else if (!manager(a)) {
    where += ` AND (e.created_by=? OR ${homeSql})`;
    args.push(a.user_id, home);
  }
  for (const [column, value] of [
    ['e.status', status],
    ['e.kind', kind],
    ['e.student_id', studentId],
    ['e.semester_id', semesterId],
    ['e.class_id', classId],
  ])
    if (value) {
      where += ` AND ${column}=?`;
      args.push(value);
    }
  if (from) {
    where += ' AND e.occurred_on>=?';
    args.push(from);
  }
  if (to) {
    where += ' AND e.occurred_on<=?';
    args.push(to);
  }
  return list(
    `SELECT e.*,s.name AS student_name,c.name AS class_name,u.name AS created_by_name FROM student_point_entries e JOIN students s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=e.created_by WHERE ${where} ORDER BY e.created_at DESC,e.id`,
    args,
    q,
  );
}
function makeThresholdCases(a: PointActor, studentId: string, semesterId: string) {
  const total = (
    db()
      .prepare(
        `SELECT COALESCE(SUM(points),0) AS n FROM student_point_entries WHERE school_id=? AND student_id=? AND semester_id=? AND kind='violation' AND status='approved'`,
      )
      .get(a.school_id, studentId, semesterId) as { n: number }
  ).n;
  const policies = db()
    .prepare('SELECT * FROM coaching_policies WHERE school_id=? AND is_active=1 AND threshold<=?')
    .all(a.school_id, total) as Row[];
  const studentName = String(student(a, studentId).name);
  for (const policy of policies) {
    const id = randomUUID();
    const responsible = responsibleUser(a, studentId);
    const result = db()
      .prepare(
        `INSERT OR IGNORE INTO student_coaching_cases(id,school_id,student_id,semester_id,policy_id,title,note,responsible_user_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        a.school_id,
        studentId,
        semesterId,
        policy.id,
        policy.name,
        `Ambang ${policy.threshold} poin tercapai (total ${total}).`,
        responsible,
        a.user_id,
      );
    if (result.changes) {
      audit(a.email, 'create', 'student_coaching_cases', id, {
        policy_id: policy.id,
        student_id: studentId,
        total,
      });
      queuePushNotification({
        recipientUserId: responsible,
        excludeUserId: a.user_id,
        eventKey: `coaching-case-created:${id}`,
        type: 'coaching_case',
        title: 'Pembinaan baru',
        body: `${studentName} mencapai ambang pembinaan yang perlu ditindaklanjuti.`,
        data: { case_id: id },
      });
    }
  }
}
function responsibleUser(a: PointActor, studentId: string): string | null {
  const row = db()
    .prepare(
      `SELECT t.user_id FROM class_memberships cm JOIN academic_years y ON y.id=cm.academic_year_id JOIN homeroom_assignments h ON h.class_id=cm.class_id AND h.academic_year_id=y.id JOIN teachers t ON t.id=h.teacher_id JOIN users u ON u.id=t.user_id WHERE cm.student_id=? AND cm.status='active' AND y.is_active=1 AND y.school_id=? AND t.is_active=1 AND u.active=1`,
    )
    .get(studentId, a.school_id) as Row | undefined;
  return row?.user_id ? String(row.user_id) : null;
}
export function createEntry(a: PointActor, input: unknown) {
  requireWrite(a);
  const data = entrySchema.parse(input);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return db().transaction(() => {
    const previous = db()
      .prepare(
        'SELECT id,request_hash FROM student_point_entries WHERE created_by=? AND client_request_id=? AND school_id=?',
      )
      .get(a.user_id, data.client_request_id, a.school_id) as Row | undefined;
    if (previous) {
      if (previous.request_hash !== hash)
        fail(409, 'IDEMPOTENCY_CONFLICT', 'ID pengiriman sudah digunakan dengan isi berbeda.');
      return { entry: entryDetail(a, String(previous.id)), replayed: true };
    }
    const targetStudent = student(a, data.student_id, true);
    const term = semester(a, data.semester_id);
    if (!term.year_active)
      fail(409, 'ACADEMIC_YEAR_INACTIVE', 'Pencatatan hanya untuk tahun ajaran aktif.');
    if (
      data.occurred_on < String(term.start_date) ||
      data.occurred_on > String(term.end_date) ||
      data.occurred_on > schoolLocalDate(a.school_id)
    )
      fail(
        400,
        'INVALID_EVENT_DATE',
        'Tanggal harus berada dalam semester dan tidak boleh di masa depan.',
      );
    const classId = membership(a, data.student_id, String(term.academic_year_id));
    const rule = db()
      .prepare('SELECT * FROM point_rules WHERE id=? AND school_id=? AND is_active=1')
      .get(data.rule_id, a.school_id) as Row | undefined;
    if (!rule) fail(404, 'RULE_NOT_FOUND', 'Aturan aktif tidak ditemukan.');
    const id = randomUUID();
    const approved = mayManageStudent(a, data.student_id);
    db()
      .prepare(
        `INSERT INTO student_point_entries(id,school_id,student_id,semester_id,class_id,rule_id,rule_name,kind,points,occurred_on,note,status,created_by,reviewed_by,reviewed_at,client_request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? THEN datetime('now') ELSE NULL END,?,?)`,
      )
      .run(
        id,
        a.school_id,
        data.student_id,
        data.semester_id,
        classId,
        rule.id,
        rule.name,
        rule.kind,
        rule.points,
        data.occurred_on,
        data.note,
        approved ? 'approved' : 'pending',
        a.user_id,
        approved ? a.user_id : null,
        Number(approved),
        data.client_request_id,
        hash,
      );
    audit(a.email, 'create', 'student_point_entries', id, {
      ...data,
      status: approved ? 'approved' : 'pending',
      points: rule.points,
    });
    if (!approved)
      queuePushNotification({
        recipientUserId: responsibleUser(a, data.student_id),
        excludeUserId: a.user_id,
        eventKey: `point-entry-pending:${id}`,
        type: 'point_entry',
        title: 'Pengajuan poin baru',
        body: `${String(targetStudent.name)} memiliki pengajuan ${String(rule.name)} yang menunggu verifikasi.`,
        data: { entry_id: id },
      });
    if (approved) makeThresholdCases(a, data.student_id, data.semester_id);
    return { entry: entryDetail(a, id), replayed: false };
  })();
}
export function reviewEntry(
  a: PointActor,
  id: string,
  action: 'approve' | 'reject' | 'void',
  input: unknown,
) {
  requireWrite(a);
  const data = z
    .object({ reason: z.string().trim().max(2000).default('') })
    .strict()
    .parse(input);
  if (action !== 'approve' && !data.reason) fail(400, 'REASON_REQUIRED', 'Alasan wajib diisi.');
  return db().transaction(() => {
    const row = getEntry(a, id);
    requireStudentManager(a, String(row.student_id));
    const expected = action === 'void' ? 'approved' : 'pending';
    if (row.status !== expected)
      fail(409, 'INVALID_STATUS', 'Status catatan sudah berubah. Muat ulang data.');
    if (action === 'void')
      db()
        .prepare(
          `UPDATE student_point_entries SET status='voided',voided_by=?,voided_at=datetime('now'),void_reason=? WHERE id=?`,
        )
        .run(a.user_id, data.reason, id);
    else
      db()
        .prepare(
          `UPDATE student_point_entries SET status=?,reviewed_by=?,reviewed_at=datetime('now'),review_reason=? WHERE id=?`,
        )
        .run(action === 'approve' ? 'approved' : 'rejected', a.user_id, data.reason, id);
    audit(a.email, action, 'student_point_entries', id, data);
    queuePushNotification({
      recipientUserId: String(row.created_by),
      excludeUserId: a.user_id,
      eventKey: `point-entry-${action}:${id}`,
      type: 'point_entry',
      title:
        action === 'approve'
          ? 'Pengajuan poin disetujui'
          : action === 'reject'
            ? 'Pengajuan poin ditolak'
            : 'Catatan poin dibatalkan',
      body: `Status catatan ${String(row.rule_name)} untuk ${String(row.student_name)} telah diperbarui.`,
      data: { entry_id: id },
    });
    if (action === 'approve')
      makeThresholdCases(a, String(row.student_id), String(row.semester_id));
    return entryDetail(a, id);
  })();
}
export function summary(a: PointActor, q: URLSearchParams) {
  const term = semester(a, uuid.parse(q.get('semester_id')));
  const studentId = optionalId.parse(q.get('student_id') || undefined);
  const classId = optionalId.parse(q.get('class_id') || undefined);
  if (studentId) requireStudentManager(a, studentId);
  if (!manager(a) && (!homeroomClass(a) || (classId && classId !== homeroomClass(a))))
    fail(403, 'STUDENT_SCOPE_FORBIDDEN', 'Rekap hanya tersedia untuk kelas wali.');
  const targetClass = manager(a) ? classId : homeroomClass(a);
  // Aggregate entries independently of membership to avoid multiplying point totals.
  return list(
    `SELECT s.id,s.name,s.nis,
    COALESCE((SELECT SUM(e.points) FROM student_point_entries e WHERE e.student_id=s.id AND e.semester_id=? AND e.status='approved' AND e.kind='appreciation'),0) AS appreciation,
    COALESCE((SELECT SUM(e.points) FROM student_point_entries e WHERE e.student_id=s.id AND e.semester_id=? AND e.status='approved' AND e.kind='violation'),0) AS violation,
    (SELECT count(*) FROM student_coaching_cases cc WHERE cc.student_id=s.id AND cc.semester_id=? AND cc.status<>'resolved') AS open_cases
    FROM students s WHERE s.school_id=? AND (? IS NULL OR s.id=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM class_memberships cm WHERE cm.student_id=s.id AND cm.class_id=? AND cm.academic_year_id=? ${manager(a) ? '' : "AND cm.status='active' AND s.is_active=1"})) ORDER BY s.name,s.id`,
    [
      String(term.id),
      String(term.id),
      String(term.id),
      a.school_id,
      studentId || null,
      studentId || null,
      targetClass || null,
      targetClass || null,
      manager(a)
        ? String(term.academic_year_id)
        : String(
            (
              db()
                .prepare('SELECT academic_year_id FROM classes WHERE id=?')
                .get(targetClass) as Row
            ).academic_year_id,
          ),
    ],
    q,
  );
}
export function getCase(a: PointActor, id: string) {
  const row = db()
    .prepare(
      `SELECT cc.*,s.name AS student_name,u.name AS responsible_name FROM student_coaching_cases cc JOIN students s ON s.id=cc.student_id LEFT JOIN users u ON u.id=cc.responsible_user_id WHERE cc.id=? AND cc.school_id=?`,
    )
    .get(uuid.parse(id), a.school_id) as Row | undefined;
  if (!row) fail(404, 'CASE_NOT_FOUND', 'Pembinaan tidak ditemukan.');
  requireStudentManager(a, String(row.student_id));
  return row;
}
export function caseDetail(a: PointActor, id: string) {
  return {
    ...getCase(a, id),
    id,
    activities: db()
      .prepare(
        'SELECT ca.id,ca.note,ca.created_at,u.name AS created_by_name FROM coaching_activities ca JOIN users u ON u.id=ca.created_by WHERE ca.case_id=? ORDER BY ca.created_at,ca.id',
      )
      .all(id),
  };
}
export function listCases(a: PointActor, q: URLSearchParams) {
  const status = z
    .enum(['open', 'in_progress', 'resolved'])
    .optional()
    .parse(q.get('status') || undefined);
  const studentId = optionalId.parse(q.get('student_id') || undefined);
  const termId = optionalId.parse(q.get('semester_id') || undefined);
  return list(
    `SELECT cc.*,s.name AS student_name,u.name AS responsible_name FROM student_coaching_cases cc JOIN students s ON s.id=cc.student_id LEFT JOIN users u ON u.id=cc.responsible_user_id WHERE cc.school_id=? AND (?=1 OR EXISTS(SELECT 1 FROM class_memberships cm WHERE cm.student_id=cc.student_id AND cm.class_id=? AND cm.status='active' AND s.is_active=1)) AND (? IS NULL OR cc.status=?) AND (? IS NULL OR cc.student_id=?) AND (? IS NULL OR cc.semester_id=?) ORDER BY cc.created_at DESC,cc.id`,
    [
      a.school_id,
      Number(manager(a)),
      homeroomClass(a),
      status || null,
      status || null,
      studentId || null,
      studentId || null,
      termId || null,
      termId || null,
    ],
    q,
  );
}
export function createCase(a: PointActor, input: unknown) {
  requireWrite(a);
  const data = caseSchema.parse(input);
  requireStudentManager(a, data.student_id);
  semester(a, data.semester_id);
  return db().transaction(() => {
    const id = randomUUID();
    const responsible = responsibleUser(a, data.student_id);
    db()
      .prepare(
        `INSERT INTO student_coaching_cases(id,school_id,student_id,semester_id,title,note,due_date,responsible_user_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        a.school_id,
        data.student_id,
        data.semester_id,
        data.title,
        data.note,
        data.due_date || null,
        responsible,
        a.user_id,
      );
    audit(a.email, 'create', 'student_coaching_cases', id, data);
    queuePushNotification({
      recipientUserId: responsible,
      excludeUserId: a.user_id,
      eventKey: `coaching-case-created:${id}`,
      type: 'coaching_case',
      title: 'Pembinaan baru',
      body: `${String(student(a, data.student_id).name)} memiliki pembinaan baru.`,
      data: { case_id: id },
    });
    return caseDetail(a, id);
  })();
}
export function updateCase(a: PointActor, id: string, input: unknown) {
  requireWrite(a);
  const data = z
    .object({
      status: z.enum(['open', 'in_progress', 'resolved']).optional(),
      due_date: isoDateSchema().nullable().optional(),
      resolution: z.string().trim().max(2000).optional(),
      assign_to_me: z.literal(true).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, 'Isi perubahan.')
    .parse(input);
  return db().transaction(() => {
    const row = getCase(a, id);
    const status = data.status || row.status;
    const resolution = data.resolution ?? row.resolution;
    if (status === 'resolved' && !resolution)
      fail(400, 'RESOLUTION_REQUIRED', 'Hasil pembinaan wajib diisi sebelum diselesaikan.');
    db()
      .prepare(
        `UPDATE student_coaching_cases SET status=?,due_date=?,resolution=?,responsible_user_id=?,updated_at=datetime('now') WHERE id=?`,
      )
      .run(
        status,
        data.due_date === undefined ? row.due_date : data.due_date,
        resolution,
        data.assign_to_me ? a.user_id : row.responsible_user_id,
        id,
      );
    audit(a.email, 'update', 'student_coaching_cases', id, { before: row, changes: data });
    queuePushNotification({
      recipientUserId: data.assign_to_me ? a.user_id : String(row.responsible_user_id || ''),
      excludeUserId: a.user_id,
      eventKey: `coaching-case-updated:${id}:${randomUUID()}`,
      type: 'coaching_case',
      title: 'Pembinaan diperbarui',
      body: `Pembinaan ${String(row.student_name)} telah diperbarui.`,
      data: { case_id: id },
    });
    return caseDetail(a, id);
  })();
}
export function addActivity(a: PointActor, id: string, input: unknown) {
  requireWrite(a);
  const data = z.object({ note: text }).strict().parse(input);
  return db().transaction(() => {
    const coachingCase = getCase(a, id);
    const activityId = randomUUID();
    db()
      .prepare('INSERT INTO coaching_activities(id,case_id,note,created_by) VALUES (?,?,?,?)')
      .run(activityId, id, data.note, a.user_id);
    audit(a.email, 'create', 'coaching_activities', activityId, { case_id: id });
    queuePushNotification({
      recipientUserId: String(coachingCase.responsible_user_id || ''),
      excludeUserId: a.user_id,
      eventKey: `coaching-activity-created:${activityId}`,
      type: 'coaching_case',
      title: 'Aktivitas pembinaan baru',
      body: `Tindak lanjut untuk ${String(coachingCase.student_name)} telah ditambahkan.`,
      data: { case_id: id },
    });
    return caseDetail(a, id);
  })();
}
