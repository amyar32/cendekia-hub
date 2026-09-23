import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { examConflicts } from '../src/lib/exam-schedules';

type Row = Record<string, string>;
type Context = {
  database: Database.Database;
  ids: { school: string; yearCurrent: string; semCurrent1: string; admin: string };
  adminEmail: string;
  insert: (table: string, row: Record<string, unknown>) => void;
  upload: (scope: string, name: string, createdBy: string) => string;
};

/** Operational scenarios share the academic records created by the simulation seed. */
export function seedOperations({ database, ids, adminEmail, insert, upload }: Context) {
  const id = randomUUID;
  const rows = (sql: string, ...args: string[]) => database.prepare(sql).all(...args) as Row[];
  const students = rows('SELECT * FROM students WHERE is_active=1 ORDER BY nis');
  const teachers = rows('SELECT * FROM teachers ORDER BY employee_code');
  const classes = rows(
    'SELECT * FROM classes WHERE academic_year_id=? ORDER BY name',
    ids.yearCurrent,
  );
  const subjects = rows('SELECT * FROM subjects ORDER BY code');
  const statuses = ['present', 'late', 'sick', 'excused', 'absent'];

  for (let day = 7; day <= 30; day++) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const [table, people, column] of [
      ['student_checkins', students, 'student_id'],
      ['teacher_checkins', teachers, 'teacher_id'],
    ] as const) {
      for (const [index, person] of people.entries()) {
        const status =
          (index + day) % 17 === 0 ? 'absent' : (index + day) % 9 === 0 ? 'late' : 'present';
        insert(table, {
          id: id(),
          school_id: ids.school,
          [column]: person.id,
          attendance_date: date,
          checked_in_at: `${date}T${status === 'absent' ? '09:00' : status === 'late' ? '07:25' : '06:50'}:00+07:00`,
          status,
          source: ['staff', 'qr', 'card', 'native_app'][index % 4],
          note: status === 'absent' ? 'Tidak hadir — data simulasi' : '',
          recorded_by: ids.admin,
        });
      }
    }
    for (const schedule of rows(
      `SELECT es.*,ea.extracurricular_id,ea.teacher_id,e.name AS extra_name,t.name AS teacher_name
      FROM extracurricular_schedules es JOIN extracurricular_assignments ea ON ea.id=es.assignment_id
      JOIN extracurriculars e ON e.id=ea.extracurricular_id JOIN teachers t ON t.id=ea.teacher_id
      WHERE es.weekday=?`,
      String(weekday),
    )) {
      const sessionId = id();
      insert('extracurricular_attendance_sessions', {
        id: sessionId,
        school_id: ids.school,
        extracurricular_schedule_id: schedule.id,
        assignment_id: schedule.assignment_id,
        extracurricular_id: schedule.extracurricular_id,
        teacher_id: schedule.teacher_id,
        attendance_date: date,
        status: day >= 28 ? 'open' : 'closed',
        extracurricular_name: schedule.extra_name,
        teacher_name: schedule.teacher_name,
        starts_at: `${date}T14:00:00+07:00`,
        closed_at: day >= 28 ? null : `${date}T15:30:00+07:00`,
        created_by: ids.admin,
      });
      for (const [index, student] of rows(
        `SELECT s.* FROM extracurricular_participants p
        JOIN students s ON s.id=p.student_id WHERE p.assignment_id=?`,
        schedule.assignment_id,
      ).entries()) {
        insert('extracurricular_attendance_records', {
          id: id(),
          session_id: sessionId,
          student_id: student.id,
          student_nis: student.nis,
          student_name: student.name,
          status: statuses[index % 5],
          source: 'teacher',
          note: 'Catatan kegiatan simulasi',
          updated_by: ids.admin,
        });
      }
    }
  }

  const periodId = id();
  const grade = rows('SELECT id FROM grades ORDER BY level_order LIMIT 1')[0];
  insert('admission_periods', {
    id: periodId,
    school_id: ids.school,
    academic_year_id: ids.yearCurrent,
    name: 'SPMB 2026/2027 Gelombang 1',
    start_date: '2026-03-02',
    end_date: '2026-07-10',
    quota: 120,
    status: 'closed',
    registration_prefix: 'DEMO-SPMB',
  });
  const flow = [
    'draft',
    'submitted',
    'needs_revision',
    'verified',
    'selection',
    'accepted',
    'waitlisted',
    'rejected',
    'reregistered',
    'converted',
  ];
  const paths: Record<string, string[]> = {
    draft: ['draft'],
    submitted: ['submitted'],
    needs_revision: ['submitted', 'needs_revision'],
    verified: ['submitted', 'verified'],
    selection: ['submitted', 'verified', 'selection'],
    accepted: ['submitted', 'verified', 'selection', 'accepted'],
    waitlisted: ['submitted', 'verified', 'selection', 'waitlisted'],
    rejected: ['submitted', 'verified', 'selection', 'rejected'],
    reregistered: ['submitted', 'verified', 'selection', 'accepted', 'reregistered'],
    converted: ['submitted', 'verified', 'selection', 'accepted', 'reregistered', 'converted'],
  };
  for (let index = 0; index < 40; index++) {
    const status = flow[index % flow.length];
    const applicationId = id();
    const converted =
      status === 'converted'
        ? rows(
            `SELECT s.* FROM students s JOIN class_memberships cm ON cm.student_id=s.id
      JOIN classes c ON c.id=cm.class_id WHERE c.grade_id=? AND cm.status='active' ORDER BY s.nis`,
            grade.id,
          )[Math.floor(index / 10)]
        : undefined;
    const name = converted?.name || `Calon Siswa ${String(index + 1).padStart(2, '0')} Cendekia`;
    const verified = paths[status].includes('verified');
    insert('student_applications', {
      id: applicationId,
      school_id: ids.school,
      admission_period_id: periodId,
      registration_number: `DEMO-SPMB-2026-${String(index + 1).padStart(4, '0')}`,
      tracking_token: id(),
      nik: converted?.nik || `000002${String(index + 1).padStart(10, '0')}`,
      nisn: converted?.nisn || `0000${String(index + 1).padStart(6, '0')}`,
      name,
      gender: converted?.gender || (index % 2 ? 'male' : 'female'),
      birth_date: converted?.birth_date || students[0].birth_date,
      birth_place: 'Bandung',
      address: converted?.address || `Jl. Pendidikan No. ${index + 1}, Bandung`,
      phone: `08000000${String(index).padStart(4, '0')}`,
      email: `pendaftar${index + 1}@example.com`,
      previous_school_name: students[0].previous_school_name,
      previous_school_graduation_year: '2026',
      target_grade_id: grade.id,
      admission_path: ['Reguler', 'Prestasi', 'Afirmasi'][index % 3],
      status,
      photo_url: upload('admission.photo', `calon-${index + 1}.png`, ids.admin),
      family_card_number:
        converted?.family_card_number || `000003${String(index).padStart(10, '0')}`,
      religion: 'Islam',
      citizenship: 'Indonesia',
      child_order: 1,
      sibling_count: 1,
      verified_by: verified ? adminEmail : null,
      verified_at: verified ? '2026-05-20T08:00:00+07:00' : null,
      submitted_at: status === 'draft' ? null : '2026-05-18T08:00:00+07:00',
      assessment_test: paths[status].includes('selection') ? 80 + (index % 15) : null,
      assessment_interview: paths[status].includes('selection') ? 85 : null,
      assessment_final: paths[status].includes('selection') ? (165 + (index % 15)) / 2 : null,
      ranking: paths[status].includes('selection') ? index + 1 : null,
      verification_notes: status === 'needs_revision' ? 'Mohon lengkapi dokumen keluarga.' : '',
      decision_notes: ['accepted', 'reregistered', 'converted'].includes(status)
        ? 'Lulus seleksi simulasi'
        : '',
      converted_student_id: converted?.id || null,
      created_by: adminEmail,
    });
    insert('application_guardians', {
      id: id(),
      application_id: applicationId,
      name: `Wali ${name}`,
      relation: 'Orang tua',
      phone: `08000100${String(index).padStart(4, '0')}`,
      address: 'Bandung, Jawa Barat',
      is_primary: 1,
    });
    for (const type of ['Kartu Keluarga', 'Akta Kelahiran', 'Ijazah'])
      insert('application_documents', {
        id: id(),
        application_id: applicationId,
        type,
        file_url: upload('admission.document', `${type}-${index + 1}.png`, ids.admin),
        description: 'Dokumen fiktif untuk demo',
        verified: verified ? 1 : 0,
      });
    for (const [step, state] of paths[status].entries())
      insert('application_status_history', {
        id: id(),
        application_id: applicationId,
        from_status: paths[status][step - 1] || null,
        to_status: state,
        notes: 'Alur penerimaan simulasi',
        actor: adminEmail,
        created_at: `2026-05-${String(18 + step).padStart(2, '0')}T08:00:00+07:00`,
      });
  }

  const rooms = classes.map((classroom, index) => {
    const room = { id: id(), name: `Ruang ${classroom.name}` };
    insert('rooms', {
      ...room,
      school_id: ids.school,
      code: `R${index + 1}`,
      capacity: 36,
      room_type: 'classroom',
      location: `Gedung A Lantai ${1 + Math.floor(index / 3)}`,
      facilities: JSON.stringify(['Papan tulis', 'Proyektor']),
    });
    return room;
  });
  for (const [periodIndex, status] of ['completed', 'published', 'draft'].entries()) {
    const examId = id();
    const date = ['2026-08-24', '2026-10-05', '2026-12-07'][periodIndex];
    insert('exam_periods', {
      id: examId,
      school_id: ids.school,
      academic_year_id: ids.yearCurrent,
      semester_id: ids.semCurrent1,
      name: ['Latihan Ujian Agustus', 'Asesmen Tengah Semester', 'Asesmen Akhir Semester'][
        periodIndex
      ],
      exam_type: ['practice', 'midterm', 'final'][periodIndex],
      start_date: date,
      end_date: date,
      status,
      version: status === 'draft' ? 0 : 1,
      published_at: status === 'draft' ? null : `${date}T00:00:00Z`,
      published_by: status === 'draft' ? null : ids.admin,
    });
    for (let sessionIndex = 0; sessionIndex < 2; sessionIndex++) {
      const sessionId = id();
      insert('exam_sessions', {
        id: sessionId,
        exam_period_id: examId,
        exam_date: date,
        name: `Sesi ${sessionIndex + 1}`,
        start_time: sessionIndex ? '10:00' : '08:00',
        end_time: sessionIndex ? '11:30' : '09:30',
        session_order: sessionIndex + 1,
      });
      for (const [index, classroom] of classes.entries()) {
        const entryId = id();
        const members = rows(
          `SELECT s.* FROM students s JOIN class_memberships cm ON cm.student_id=s.id
          WHERE cm.class_id=? AND cm.status='active' ORDER BY s.nis`,
          classroom.id,
        );
        insert('exam_schedule_entries', {
          id: entryId,
          exam_period_id: examId,
          exam_session_id: sessionId,
          subject_id: subjects[sessionIndex].id,
          room_id: rooms[index].id,
          duration_minutes: 90,
          subject_name: subjects[sessionIndex].name,
          room_name: rooms[index].name,
          participant_mode: periodIndex === 0 ? 'student' : 'class',
          notes: 'Jadwal simulasi',
        });
        insert('exam_schedule_classes', {
          id: id(),
          exam_schedule_entry_id: entryId,
          class_id: classroom.id,
          class_name: classroom.name,
          participant_count: members.length,
        });
        if (periodIndex === 0)
          for (const student of members)
            insert('exam_schedule_students', {
              id: id(),
              exam_schedule_entry_id: entryId,
              student_id: student.id,
              student_name: student.name,
              class_id: classroom.id,
              class_name: classroom.name,
            });
        for (let supervisor = 0; supervisor < 2; supervisor++) {
          const teacher = teachers[2 + index * 2 + supervisor];
          insert('exam_supervisors', {
            id: id(),
            exam_schedule_entry_id: entryId,
            teacher_id: teacher.id,
            teacher_name: teacher.name,
            role: supervisor === 0 ? 'lead' : 'assistant',
          });
        }
      }
    }
    insert('exam_unavailabilities', {
      id: id(),
      exam_period_id: examId,
      resource_type: 'teacher',
      teacher_id: teachers[14].id,
      exam_date: date,
      reason: 'Pelatihan guru',
    });
    const conflicts = examConflicts(examId);
    if (conflicts.length)
      throw new Error(`Jadwal ujian seed konflik: ${JSON.stringify(conflicts)}`);
    if (status !== 'draft')
      insert('exam_schedule_versions', {
        id: id(),
        exam_period_id: examId,
        version: 1,
        published_by: ids.admin,
        notes: 'Publikasi simulasi',
        snapshot: JSON.stringify({
          period: rows('SELECT * FROM exam_periods WHERE id=?', examId)[0],
          sessions: rows('SELECT * FROM exam_sessions WHERE exam_period_id=?', examId),
          entries: rows(
            `SELECT e.*,se.exam_date,se.name AS session_name,se.start_time,se.end_time,
            GROUP_CONCAT(DISTINCT ec.class_name) AS class_names,
            GROUP_CONCAT(DISTINCT est.student_id) AS student_ids,
            GROUP_CONCAT(DISTINCT est.student_name) AS student_names,
            GROUP_CONCAT(DISTINCT es.teacher_name) AS supervisor_names
            FROM exam_schedule_entries e JOIN exam_sessions se ON se.id=e.exam_session_id
            LEFT JOIN exam_schedule_classes ec ON ec.exam_schedule_entry_id=e.id
            LEFT JOIN exam_schedule_students est ON est.exam_schedule_entry_id=e.id
            LEFT JOIN exam_supervisors es ON es.exam_schedule_entry_id=e.id
            WHERE e.exam_period_id=? GROUP BY e.id ORDER BY se.exam_date,se.start_time,e.room_name`,
            examId,
          ),
          generated_at: new Date().toISOString(),
        }),
      });
    insert('audit', {
      actor: adminEmail,
      action: status === 'draft' ? 'create' : 'publish',
      entity: 'exam_periods',
      entity_id: examId,
      details: JSON.stringify({ status, simulation: true }),
    });
  }
}
