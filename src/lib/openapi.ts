import { APP_NAME } from '@/config/branding';

const json = { type: 'object', additionalProperties: true };

const errorResponse = {
  description: 'Respons gagal.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example: { error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid.' } },
    },
  },
};

const successResponse = (
  description = 'Berhasil.',
  example: Record<string, unknown> = { data: { ok: true }, meta: {} },
) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/DataResponse' },
      example,
    },
  },
});

const bearer = [{ bearerAuth: [] }];
const sessionId = {
  name: 'sessionId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const date = (name: string, description: string) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'string', format: 'date' },
});

const examples = {
  ok: { data: { ok: true }, meta: {} },
  password: {
    data: {
      ok: true,
      access_token: 'access-token-baru',
      refresh_token: 'refresh-token-baru',
      token_type: 'Bearer',
      expires_in: 900,
      must_change_password: false,
    },
    meta: {},
  },
  schedule: {
    data: {
      date: '2029-07-02',
      schedules: [
        {
          schedule_id: 'schedule-uuid',
          class_name: 'X IPA 1',
          subject_name: 'Matematika',
          slot_name: 'Jam 1',
          start_time: '07:00',
          end_time: '07:45',
          attendance_session_id: null,
          attendance_status: null,
          student_count: 0,
          present_count: 0,
          type: 'lesson',
          attendance_blocked_reason: null,
        },
      ],
    },
    meta: {},
  },
  checkIns: {
    data: {
      from: '2029-06-03',
      to: '2029-07-02',
      check_ins: [
        {
          id: 'checkin-uuid',
          attendance_date: '2029-07-02',
          checked_in_at: '2029-07-02 06:54:00',
          status: 'present',
          source: 'mobile',
          note: null,
          updated_at: '2029-07-02 06:54:00',
        },
      ],
    },
    meta: {},
  },
  classes: {
    data: {
      academic_year: { id: 'year-uuid', name: '2029/2030' },
      classes: [
        {
          id: 'class-uuid',
          name: 'X IPA 1',
          grade_name: 'Kelas X',
          is_homeroom: true,
          student_count: 32,
          subjects: 'Matematika',
        },
      ],
    },
    meta: {},
  },
  students: {
    data: {
      classroom: { id: 'class-uuid', name: 'X IPA 1', grade_name: 'Kelas X' },
      students: [
        {
          id: 'student-uuid',
          photo_url: null,
          nis: '2029001',
          nisn: '0012345678',
          name: 'Siti Aminah',
          gender: 'female',
        },
      ],
    },
    meta: {},
  },
  lessonSessions: {
    data: {
      date: '2029-07-02',
      sessions: [
        {
          schedule_id: 'schedule-uuid',
          teaching_assignment_id: 'assignment-uuid',
          class_id: 'class-uuid',
          class_name: 'X IPA 1',
          subject_name: 'Matematika',
          slot_name: 'Jam 1',
          start_time: '07:00',
          end_time: '07:45',
          session_id: null,
          session_status: null,
          student_count: 0,
          present_count: 0,
          late_count: 0,
          absent_count: 0,
          blocked_reason: null,
        },
      ],
    },
    meta: {},
  },
  lessonDetail: {
    data: {
      session: {
        id: 'session-uuid',
        class_schedule_id: 'schedule-uuid',
        class_id: 'class-uuid',
        attendance_date: '2029-07-02',
        status: 'open',
        subject_name: 'Matematika',
        class_name: 'X IPA 1',
        teacher_name: 'Nama Guru',
        starts_at: '2029-07-02 07:00:00',
        closed_at: null,
      },
      records: [
        {
          id: 'record-uuid',
          student_id: 'student-uuid',
          student_nis: '2029001',
          student_name: 'Siti Aminah',
          status: 'present',
          note: '',
          source: 'native_app',
          recorded_at: '2029-07-02 07:00:00',
          updated_at: '2029-07-02 07:00:00',
        },
      ],
    },
    meta: {},
  },
  recordsUpdated: { data: { ok: true, id: 'session-uuid', updated: 1 }, meta: {} },
  closed: { data: { ok: true, id: 'session-uuid', status: 'closed' }, meta: {} },
  extracurriculars: {
    data: {
      academic_year: { id: 'year-uuid', name: '2029/2030' },
      extracurriculars: [
        {
          assignment_id: 'assignment-uuid',
          extracurricular_id: 'extracurricular-uuid',
          code: 'PRAMUKA',
          name: 'Pramuka',
          category: 'Wajib',
          description: null,
          is_required: true,
          semester_id: null,
          semester_name: 'Semua Semester',
          location: 'Lapangan',
          map_url: null,
          quota: 40,
          status: 'active',
          participant_count: 30,
          schedules: [],
        },
      ],
    },
    meta: {},
  },
  participants: {
    data: {
      assignment: {
        assignment_id: 'assignment-uuid',
        extracurricular_id: 'extracurricular-uuid',
        code: 'PRAMUKA',
        name: 'Pramuka',
        location: 'Lapangan',
        map_url: null,
      },
      participants: [
        {
          id: 'student-uuid',
          photo_url: null,
          nis: '2029001',
          nisn: '0012345678',
          name: 'Siti Aminah',
          gender: 'female',
          class_id: 'class-uuid',
          class_name: 'X IPA 1',
        },
      ],
    },
    meta: {},
  },
  extracurricularSessions: {
    data: {
      date: '2029-07-02',
      sessions: [
        {
          schedule_id: 'schedule-uuid',
          assignment_id: 'assignment-uuid',
          extracurricular_id: 'extracurricular-uuid',
          extracurricular_code: 'PRAMUKA',
          extracurricular_name: 'Pramuka',
          location: 'Lapangan',
          map_url: null,
          slot_name: 'Sore',
          start_time: '15:00',
          end_time: '16:30',
          session_id: null,
          session_status: null,
          student_count: 0,
          present_count: 0,
          late_count: 0,
          absent_count: 0,
        },
      ],
    },
    meta: {},
  },
  extracurricularDetail: {
    data: {
      session: {
        id: 'session-uuid',
        extracurricular_schedule_id: 'schedule-uuid',
        assignment_id: 'assignment-uuid',
        extracurricular_id: 'extracurricular-uuid',
        attendance_date: '2029-07-02',
        status: 'open',
        extracurricular_name: 'Pramuka',
        teacher_name: 'Nama Guru',
        starts_at: '2029-07-02 15:00:00',
        closed_at: null,
      },
      records: [
        {
          id: 'record-uuid',
          student_id: 'student-uuid',
          student_nis: '2029001',
          student_name: 'Siti Aminah',
          class_name: 'X IPA 1',
          status: 'present',
          note: '',
          source: 'native_app',
          updated_at: '2029-07-02 15:00:00',
        },
      ],
    },
    meta: {},
  },
} as const;

export const openApiDocument = {
  openapi: '3.1.1',
  info: {
    title: `${APP_NAME} Teacher API`,
    version: '1.0.1',
    description:
      'REST API untuk aplikasi guru. Semua respons sukses memakai `{ data, meta }`; respons gagal memakai `{ error }`.',
  },
  servers: [{ url: '/api/v1', description: 'Server saat ini' }],
  tags: [
    { name: 'Authentication', description: 'Sesi dan kredensial aplikasi guru.' },
    { name: 'Profile', description: 'Profil, jadwal, dan data guru.' },
    { name: 'Class', description: 'Rombel dan murid yang dapat diakses guru.' },
    { name: 'Lesson attendance', description: 'Absensi kegiatan belajar.' },
    { name: 'Extracurricular', description: 'Penugasan dan absensi ekstrakurikuler.' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login guru',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': successResponse('Token berhasil dibuat.', {
            data: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              token_type: 'Bearer',
              expires_in: 900,
              must_change_password: false,
              actor: {
                type: 'teacher',
                id: 'teacher-uuid',
                name: 'Nama Guru',
                school_id: 'school-uuid',
                school_name: 'Nama Sekolah',
                timezone: 'Asia/Jakarta',
              },
            },
            meta: {},
          }),
          '401': errorResponse,
          '403': errorResponse,
          '429': errorResponse,
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Perbarui access token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': successResponse('Token berhasil diperbarui.', {
            data: {
              access_token: 'access-token-baru',
              refresh_token: 'refresh-token-baru',
              token_type: 'Bearer',
              expires_in: 900,
            },
            meta: {},
          }),
          '401': errorResponse,
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout perangkat aktif',
        security: bearer,
        responses: {
          '200': successResponse('Sesi perangkat aktif dicabut.', examples.ok),
          '401': errorResponse,
        },
      },
    },
    '/auth/password': {
      post: {
        tags: ['Authentication'],
        summary: 'Ganti kata sandi',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } },
          },
        },
        responses: {
          '200': successResponse('Password dan token berhasil diperbarui.', examples.password),
          '400': errorResponse,
          '401': errorResponse,
        },
      },
    },
    '/me': {
      get: {
        tags: ['Profile'],
        summary: 'Profil akun, guru, dan sekolah',
        security: bearer,
        responses: {
          '200': successResponse('Profil guru aktif.', {
            data: {
              user: { id: 'user-uuid', email: 'guru@sekolah.test', must_change_password: false },
              actor: {
                type: 'teacher',
                id: 'teacher-uuid',
                name: 'Nama Guru',
                nip: '198001012010011001',
              },
              school: { id: 'school-uuid', name: 'Nama Sekolah', timezone: 'Asia/Jakarta' },
            },
            meta: {},
          }),
          '401': errorResponse,
        },
      },
    },
    '/me/schedule': {
      get: {
        tags: ['Profile'],
        summary: 'Jadwal mengajar dan ekstrakurikuler',
        security: bearer,
        parameters: [date('date', 'Default: tanggal lokal sekolah.')],
        responses: {
          '200': successResponse('Jadwal pada tanggal yang diminta.', examples.schedule),
          '400': errorResponse,
          '401': errorResponse,
        },
      },
    },
    '/me/check-ins': {
      get: {
        tags: ['Profile'],
        summary: 'Riwayat check-in',
        security: bearer,
        parameters: [date('from', 'Default: 30 hari terakhir.'), date('to', 'Default: hari ini.')],
        responses: {
          '200': successResponse('Riwayat check-in.', examples.checkIns),
          '400': errorResponse,
          '401': errorResponse,
        },
      },
    },
    '/attendances': {
      get: {
        tags: ['Lesson attendance'],
        summary: 'Penugasan mata pelajaran aktif',
        security: bearer,
        responses: {
          '200': successResponse('Penugasan mata pelajaran pada tahun ajaran aktif.', {
            data: {
              academic_year: {
                id: 'year-uuid',
                name: '2029/2030',
                start_date: '2029-07-01',
                end_date: '2030-06-30',
              },
              subjects: [
                {
                  assignment_id: 'assignment-uuid',
                  subject_id: 'subject-uuid',
                  code: 'MAT',
                  name: 'Matematika',
                  category: '',
                  description: '',
                  class_id: 'class-uuid',
                  class_name: '7A',
                  grade_name: 'Kelas 7',
                  semester_id: null,
                  semester_name: 'Semua Semester',
                  student_count: 30,
                  schedules: [
                    {
                      schedule_id: 'schedule-uuid',
                      semester_id: 'semester-uuid',
                      semester_name: 'Semester 1',
                      weekday: 1,
                      time_slot_id: 'slot-uuid',
                      slot_name: 'Jam 1',
                      start_time: '07:00',
                      end_time: '08:00',
                    },
                  ],
                },
              ],
            },
            meta: {},
          }),
          '401': errorResponse,
          '403': errorResponse,
          '409': errorResponse,
        },
      },
    },
    '/classes': {
      get: {
        tags: ['Class'],
        summary: 'Rombel yang diajar atau diwalikan',
        security: bearer,
        responses: {
          '200': successResponse('Rombel aktif yang dapat diakses.', examples.classes),
          '401': errorResponse,
        },
      },
    },
    '/classes/{classId}/students': {
      get: {
        tags: ['Class'],
        summary: 'Daftar murid rombel',
        security: bearer,
        parameters: [
          {
            name: 'classId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': successResponse('Murid aktif pada rombel.', examples.students),
          '404': errorResponse,
        },
      },
    },
    '/attendance-sessions': {
      get: {
        tags: ['Lesson attendance'],
        summary: 'Sesi absensi pelajaran pada suatu tanggal',
        security: bearer,
        parameters: [date('date', 'Default: tanggal lokal sekolah.')],
        responses: {
          '200': successResponse('Jadwal dan status absensi pelajaran.', examples.lessonSessions),
          '400': errorResponse,
          '401': errorResponse,
        },
      },
      post: {
        tags: ['Lesson attendance'],
        summary: 'Buka sesi absensi pelajaran',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/OpenSessionRequest' } },
          },
        },
        responses: {
          '201': successResponse('Sesi baru dibuat.', {
            data: { id: 'session-uuid', created: true },
            meta: {},
          }),
          '200': successResponse('Sesi yang telah ada dikembalikan.', {
            data: { id: 'session-uuid', created: false },
            meta: {},
          }),
          '400': errorResponse,
          '403': errorResponse,
        },
      },
    },
    '/attendance-sessions/{sessionId}': {
      get: {
        tags: ['Lesson attendance'],
        summary: 'Detail sesi absensi pelajaran',
        security: bearer,
        parameters: [sessionId],
        responses: {
          '200': successResponse('Sesi dan catatan absensi.', examples.lessonDetail),
          '404': errorResponse,
        },
      },
    },
    '/attendance-sessions/{sessionId}/records': {
      put: {
        tags: ['Lesson attendance'],
        summary: 'Perbarui catatan absensi pelajaran',
        security: bearer,
        parameters: [sessionId],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateRecordsRequest' } },
          },
        },
        responses: {
          '200': successResponse('Catatan absensi diperbarui.', examples.recordsUpdated),
          '400': errorResponse,
          '409': errorResponse,
        },
      },
    },
    '/attendance-sessions/{sessionId}/close': {
      post: {
        tags: ['Lesson attendance'],
        summary: 'Tutup sesi absensi pelajaran',
        security: bearer,
        parameters: [sessionId],
        responses: {
          '200': successResponse('Sesi absensi ditutup.', examples.closed),
          '404': errorResponse,
        },
      },
    },
    '/extracurriculars': {
      get: {
        tags: ['Extracurricular'],
        summary: 'Penugasan ekstrakurikuler aktif',
        security: bearer,
        responses: {
          '200': successResponse('Penugasan ekstrakurikuler aktif.', examples.extracurriculars),
          '403': errorResponse,
        },
      },
    },
    '/extracurriculars/{assignmentId}/participants': {
      get: {
        tags: ['Extracurricular'],
        summary: 'Peserta ekstrakurikuler',
        security: bearer,
        parameters: [
          {
            name: 'assignmentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': successResponse('Peserta aktif pada penugasan.', examples.participants),
          '404': errorResponse,
        },
      },
    },
    '/extracurricular-attendance-sessions': {
      get: {
        tags: ['Extracurricular'],
        summary: 'Sesi absensi ekstrakurikuler pada suatu tanggal',
        security: bearer,
        parameters: [date('date', 'Default: tanggal lokal sekolah.')],
        responses: {
          '200': successResponse(
            'Jadwal dan status absensi ekstrakurikuler.',
            examples.extracurricularSessions,
          ),
          '400': errorResponse,
        },
      },
      post: {
        tags: ['Extracurricular'],
        summary: 'Buka sesi absensi ekstrakurikuler',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/OpenSessionRequest' } },
          },
        },
        responses: {
          '201': successResponse('Sesi baru dibuat.', {
            data: { id: 'session-uuid', created: true },
            meta: {},
          }),
          '200': successResponse('Sesi yang telah ada dikembalikan.', {
            data: { id: 'session-uuid', created: false },
            meta: {},
          }),
          '400': errorResponse,
        },
      },
    },
    '/extracurricular-attendance-sessions/{sessionId}': {
      get: {
        tags: ['Extracurricular'],
        summary: 'Detail sesi absensi ekstrakurikuler',
        security: bearer,
        parameters: [sessionId],
        responses: {
          '200': successResponse(
            'Sesi dan catatan absensi ekstrakurikuler.',
            examples.extracurricularDetail,
          ),
          '404': errorResponse,
        },
      },
    },
    '/extracurricular-attendance-sessions/{sessionId}/records': {
      put: {
        tags: ['Extracurricular'],
        summary: 'Perbarui catatan absensi ekstrakurikuler',
        security: bearer,
        parameters: [sessionId],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateRecordsRequest' } },
          },
        },
        responses: {
          '200': successResponse('Catatan absensi diperbarui.', examples.recordsUpdated),
          '400': errorResponse,
          '409': errorResponse,
        },
      },
    },
    '/extracurricular-attendance-sessions/{sessionId}/close': {
      post: {
        tags: ['Extracurricular'],
        summary: 'Tutup sesi absensi ekstrakurikuler',
        security: bearer,
        parameters: [sessionId],
        responses: {
          '200': successResponse('Sesi absensi ditutup.', examples.closed),
          '404': errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque access token' },
    },
    schemas: {
      DataResponse: {
        type: 'object',
        required: ['data', 'meta'],
        properties: { data: json, meta: { type: 'object', additionalProperties: true } },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Data tidak valid.' },
              fields: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'guru@sekolah.test' },
          password: { type: 'string', format: 'password', example: 'kata-sandi' },
          device_id: { type: 'string', example: 'installation-id' },
          device_name: { type: 'string', example: 'Samsung A55' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string', example: 'refresh-token-yang-disimpan-aman' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string', format: 'password' },
          new_password: { type: 'string', format: 'password', minLength: 12 },
        },
      },
      OpenSessionRequest: {
        type: 'object',
        required: ['schedule_id', 'attendance_date'],
        properties: {
          schedule_id: { type: 'string', format: 'uuid' },
          attendance_date: { type: 'string', format: 'date', example: '2029-07-02' },
        },
      },
      UpdateRecordsRequest: {
        type: 'object',
        required: ['records'],
        properties: {
          records: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'status'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                status: { type: 'string', enum: ['present', 'late', 'sick', 'excused', 'absent'] },
                note: { type: 'string', maxLength: 500, example: 'Surat dokter' },
              },
            },
          },
        },
      },
    },
  },
} as const;
