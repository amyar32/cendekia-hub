import { createHash, randomUUID } from 'node:crypto';
import { audit, db } from '../src/lib/db';

type Rule = {
  id: string;
  name: string;
  kind: 'appreciation' | 'violation';
  points: number;
  category: string;
};

const DEMO = '[DEMO POIN]';

const result = db().transaction(() => {
  const school = db()
    .prepare('SELECT id,name FROM schools WHERE is_active=1 ORDER BY created_at LIMIT 1')
    .get() as { id: string; name: string } | undefined;
  if (!school) throw new Error('Tidak ada sekolah aktif.');
  const semester = db()
    .prepare(
      `SELECT s.id,s.start_date,s.end_date,y.id AS academic_year_id
       FROM semesters s JOIN academic_years y ON y.id=s.academic_year_id
       WHERE y.school_id=? AND y.is_active=1 AND s.is_active=1`,
    )
    .get(school.id) as
    { id: string; start_date: string; end_date: string; academic_year_id: string } | undefined;
  if (!semester) throw new Error('Tidak ada semester aktif pada tahun ajaran aktif.');
  const admin = db()
    .prepare(
      `SELECT u.id,u.email FROM users u JOIN roles r ON r.id=u.role_id
       WHERE u.active=1 AND r.permissions LIKE '%points.manage%' ORDER BY u.created_at LIMIT 1`,
    )
    .get() as { id: string; email: string } | undefined;
  if (!admin) throw new Error('Tidak ada pengguna aktif dengan permission points.manage.');
  const alreadySeeded = db()
    .prepare(
      `SELECT 1 FROM point_rules WHERE school_id=? AND name LIKE ?
       UNION ALL SELECT 1 FROM student_point_entries WHERE school_id=? AND note LIKE ? LIMIT 1`,
    )
    .get(school.id, `${DEMO}%`, school.id, `${DEMO}%`);
  if (alreadySeeded) throw new Error('Data contoh poin sudah pernah diisi.');

  const students = db()
    .prepare(
      `SELECT s.id,s.name,cm.class_id
       FROM students s JOIN class_memberships cm ON cm.student_id=s.id
       WHERE s.school_id=? AND s.is_active=1 AND cm.academic_year_id=? AND cm.status='active'
       ORDER BY cm.class_id,s.name LIMIT 4`,
    )
    .all(school.id, semester.academic_year_id) as { id: string; name: string; class_id: string }[];
  if (students.length < 4)
    throw new Error('Data contoh membutuhkan minimal empat murid aktif pada semester ini.');

  const ruleDefinitions: Omit<Rule, 'id'>[] = [
    {
      name: `${DEMO} Membantu teman belajar`,
      kind: 'appreciation',
      points: 5,
      category: 'Karakter',
    },
    {
      name: `${DEMO} Menyelesaikan tugas tepat waktu`,
      kind: 'appreciation',
      points: 3,
      category: 'Akademik',
    },
    {
      name: `${DEMO} Prestasi kegiatan kelas`,
      kind: 'appreciation',
      points: 10,
      category: 'Prestasi',
    },
    { name: `${DEMO} Terlambat`, kind: 'violation', points: 2, category: 'Kedisiplinan' },
    {
      name: `${DEMO} Seragam tidak sesuai ketentuan`,
      kind: 'violation',
      points: 3,
      category: 'Kedisiplinan',
    },
    { name: `${DEMO} Tidak membawa tugas`, kind: 'violation', points: 5, category: 'Akademik' },
    { name: `${DEMO} Mengganggu pembelajaran`, kind: 'violation', points: 4, category: 'Sikap' },
    {
      name: `${DEMO} Tidak mengikuti kegiatan tanpa keterangan`,
      kind: 'violation',
      points: 10,
      category: 'Kehadiran',
    },
  ];
  const rules = ruleDefinitions.map((rule) => ({ ...rule, id: randomUUID() }));
  const byName = Object.fromEntries(rules.map((rule) => [rule.name, rule]));
  for (const rule of rules) {
    db()
      .prepare(
        'INSERT INTO point_rules(id,school_id,name,kind,points,category,is_active) VALUES (?,?,?,?,?,?,1)',
      )
      .run(rule.id, school.id, rule.name, rule.kind, rule.points, rule.category);
    audit(admin.email, 'create', 'point_rules', rule.id, { demo: true, ...rule });
  }

  const policies = [
    { id: randomUUID(), name: `${DEMO} Pembinaan awal`, threshold: 5 },
    { id: randomUUID(), name: `${DEMO} Evaluasi kedisiplinan`, threshold: 10 },
    { id: randomUUID(), name: `${DEMO} Komunikasi orang tua`, threshold: 15 },
  ];
  for (const policy of policies) {
    db()
      .prepare(
        'INSERT INTO coaching_policies(id,school_id,name,threshold,is_active) VALUES (?,?,?,?,1)',
      )
      .run(policy.id, school.id, policy.name, policy.threshold);
    audit(admin.email, 'create', 'coaching_policies', policy.id, { demo: true, ...policy });
  }

  const addEntry = (
    student: { id: string; name: string; class_id: string },
    rule: Rule,
    occurredOn: string,
    status: 'pending' | 'approved' | 'rejected' | 'voided',
    suffix: string,
    reviewReason = '',
  ) => {
    const id = randomUUID();
    const clientRequestId = randomUUID();
    const note = `${DEMO} ${suffix}`;
    db()
      .prepare(
        `INSERT INTO student_point_entries
         (id,school_id,student_id,semester_id,class_id,rule_id,rule_name,kind,points,occurred_on,note,status,
          created_by,reviewed_by,reviewed_at,review_reason,voided_by,voided_at,void_reason,client_request_id,request_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,CASE WHEN ? IN ('approved','rejected') THEN datetime('now') END,?,
                 CASE WHEN ?='voided' THEN ? END,CASE WHEN ?='voided' THEN datetime('now') END,?, ?,?)`,
      )
      .run(
        id,
        school.id,
        student.id,
        semester.id,
        student.class_id,
        rule.id,
        rule.name,
        rule.kind,
        rule.points,
        occurredOn,
        note,
        status,
        admin.id,
        ['approved', 'rejected'].includes(status) ? admin.id : null,
        status,
        reviewReason,
        status,
        admin.id,
        status,
        status === 'voided' ? reviewReason : '',
        clientRequestId,
        createHash('sha256').update(`${id}:${clientRequestId}`).digest('hex'),
      );
    audit(admin.email, 'create', 'student_point_entries', id, {
      demo: true,
      student_name: student.name,
      rule: rule.name,
      status,
    });
    return { id, student, rule, status };
  };

  const help = byName[`${DEMO} Membantu teman belajar`];
  const task = byName[`${DEMO} Menyelesaikan tugas tepat waktu`];
  const achievement = byName[`${DEMO} Prestasi kegiatan kelas`];
  const late = byName[`${DEMO} Terlambat`];
  const uniform = byName[`${DEMO} Seragam tidak sesuai ketentuan`];
  const taskMissing = byName[`${DEMO} Tidak membawa tugas`];
  const disrupt = byName[`${DEMO} Mengganggu pembelajaran`];
  const absent = byName[`${DEMO} Tidak mengikuti kegiatan tanpa keterangan`];

  addEntry(
    students[0],
    help,
    '2026-08-04',
    'approved',
    'Membantu teman memahami materi pada kerja kelompok.',
  );
  addEntry(
    students[0],
    late,
    '2026-08-06',
    'approved',
    'Terlambat masuk kelas, sudah dikonfirmasi wali kelas.',
  );
  addEntry(
    students[0],
    uniform,
    '2026-08-11',
    'approved',
    'Seragam tidak sesuai ketentuan pada hari Senin.',
  );
  addEntry(
    students[1],
    achievement,
    '2026-08-13',
    'approved',
    'Berpartisipasi aktif dan membawa nama baik kelas pada kegiatan sekolah.',
  );
  addEntry(
    students[1],
    disrupt,
    '2026-08-14',
    'pending',
    'Laporan guru: mengganggu pembelajaran, menunggu verifikasi wali kelas.',
  );
  addEntry(
    students[2],
    taskMissing,
    '2026-08-18',
    'rejected',
    'Laporan tidak membawa tugas.',
    'Tugas sudah dikumpulkan melalui kanal kelas.',
  );
  addEntry(
    students[2],
    absent,
    '2026-08-20',
    'approved',
    'Tidak mengikuti kegiatan tanpa keterangan yang dapat diverifikasi.',
  );
  addEntry(students[2], task, '2026-08-21', 'approved', 'Menyelesaikan tugas proyek tepat waktu.');
  addEntry(
    students[3],
    late,
    '2026-08-24',
    'voided',
    'Catatan terlambat ganda.',
    'Duplikat catatan; gunakan catatan sebelumnya sebagai rujukan.',
  );
  addEntry(
    students[3],
    help,
    '2026-08-26',
    'approved',
    'Mendampingi teman saat kegiatan literasi.',
  );
  addEntry(
    students[3],
    uniform,
    '2026-08-27',
    'pending',
    'Laporan seragam tidak sesuai ketentuan, menunggu verifikasi.',
  );
  addEntry(
    students[3],
    task,
    '2026-08-28',
    'approved',
    'Menyelesaikan tugas tepat waktu selama dua pekan berturut-turut.',
  );

  const approvedViolations = db()
    .prepare(
      `SELECT student_id,SUM(points) AS total FROM student_point_entries
       WHERE school_id=? AND semester_id=? AND kind='violation' AND status='approved'
       GROUP BY student_id`,
    )
    .all(school.id, semester.id) as { student_id: string; total: number }[];
  for (const total of approvedViolations) {
    const student = students.find((item) => item.id === total.student_id)!;
    const homeroom = db()
      .prepare(
        `SELECT t.user_id FROM homeroom_assignments h JOIN teachers t ON t.id=h.teacher_id
         WHERE h.class_id=? AND h.academic_year_id=?`,
      )
      .get(student.class_id, semester.academic_year_id) as { user_id: string } | undefined;
    for (const policy of policies.filter((item) => item.threshold <= total.total)) {
      const caseId = randomUUID();
      db()
        .prepare(
          `INSERT INTO student_coaching_cases
           (id,school_id,student_id,semester_id,policy_id,title,note,status,responsible_user_id,due_date,created_by)
           VALUES (?,?,?,?,?,?,?,'open',?,?,?)`,
        )
        .run(
          caseId,
          school.id,
          student.id,
          semester.id,
          policy.id,
          policy.name,
          `${DEMO} Total pelanggaran ${total.total} poin telah mencapai ambang ${policy.threshold} poin.`,
          homeroom?.user_id || null,
          '2026-09-05',
          admin.id,
        );
      audit(admin.email, 'create', 'student_coaching_cases', caseId, {
        demo: true,
        student_name: student.name,
        policy: policy.name,
      });
      if (policy.threshold === 5) {
        const activityId = randomUUID();
        db()
          .prepare('INSERT INTO coaching_activities(id,case_id,note,created_by) VALUES (?,?,?,?)')
          .run(
            activityId,
            caseId,
            `${DEMO} Jadwal pembinaan awal sudah dicatat untuk ditindaklanjuti wali kelas.`,
            admin.id,
          );
        audit(admin.email, 'create', 'coaching_activities', activityId, {
          demo: true,
          case_id: caseId,
        });
      }
    }
  }
  return { schoolName: school.name, ruleCount: rules.length, policyCount: policies.length };
})();

console.log(
  `Data contoh poin dibuat untuk ${result.schoolName}: ${result.ruleCount} aturan, ${result.policyCount} ambang, dan 12 catatan.`,
);
