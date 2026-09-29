const id = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date' };
const note = { type: 'string', minLength: 1, maxLength: 2000 };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});
const input = (properties: Record<string, unknown>, required: string[] = []) => ({
  ...object(properties, required),
  additionalProperties: false,
});
const page = (name: string) =>
  object(
    {
      rows: { type: 'array', items: ref(name) },
      total: { type: 'integer' },
      page: { type: 'integer' },
      page_size: { type: 'integer' },
    },
    ['rows', 'total', 'page', 'page_size'],
  );
const query = (name: string, schema: object, required = false) => ({
  in: 'query',
  name,
  required,
  schema,
});
const param = (name: string) => ({ in: 'path', name, required: true, schema: id });
const pages = [
  query('page', { type: 'integer', minimum: 1, maximum: 100000, default: 1 }),
  query('page_size', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
];
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 500].map((code) => [
    code,
    {
      description: 'Lihat error.code dan error.message.',
      content: { 'application/json': { schema: ref('ErrorResponse') } },
    },
  ]),
);
function operation(
  summary: string,
  response: string,
  parameters: object[] = [],
  request?: string,
  created = false,
) {
  const success = {
    description: 'Respons berhasil.',
    content: {
      'application/json': {
        schema: object(
          {
            data: ref(response),
            meta: { type: 'object', properties: { replayed: { type: 'boolean' } } },
          },
          ['data', 'meta'],
        ),
      },
    },
  };
  return {
    tags: ['Points'],
    summary,
    security: [{ bearerAuth: [] }],
    parameters,
    ...(request
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(request) } },
          },
        }
      : {}),
    responses: { '200': success, ...(created ? { '201': success } : {}), ...errors },
  };
}
export const pointSchemas = {
  PointOptions: object({
    capabilities: object({
      can_write: { type: 'boolean' },
      can_manage: { type: 'boolean' },
      homeroom_class_id: { type: ['string', 'null'], format: 'uuid' },
    }),
    semesters: {
      type: 'array',
      items: object({
        id,
        name: { type: 'string' },
        academic_year_name: { type: 'string' },
        is_active: { type: 'integer' },
        year_active: { type: 'integer' },
      }),
    },
    classes: { type: 'array', items: object({ id, name: { type: 'string' } }) },
  }),
  PointStudent: object({
    id,
    name: { type: 'string' },
    nis: { type: 'string' },
    photo_url: { type: 'string' },
    class_id: { type: ['string', 'null'] },
    class_name: { type: ['string', 'null'] },
  }),
  PointRule: object({
    id,
    school_id: id,
    name: { type: 'string' },
    kind: { type: 'string', enum: ['appreciation', 'violation'] },
    points: { type: 'integer' },
    category: { type: 'string' },
    is_active: { type: 'integer', enum: [0, 1] },
  }),
  PointRuleInput: input(
    {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      kind: { type: 'string', enum: ['appreciation', 'violation'] },
      points: { type: 'integer', minimum: 1, maximum: 1000 },
      category: { type: 'string', maxLength: 100, default: '' },
      is_active: { type: 'boolean', default: true },
    },
    ['name', 'kind', 'points'],
  ),
  PointPolicy: object({
    id,
    school_id: id,
    name: { type: 'string' },
    threshold: { type: 'integer' },
    is_active: { type: 'integer', enum: [0, 1] },
  }),
  PointPolicyInput: input(
    {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      threshold: { type: 'integer', minimum: 1, maximum: 10000 },
      is_active: { type: 'boolean', default: true },
    },
    ['name', 'threshold'],
  ),
  PointEntryInput: input(
    {
      student_id: id,
      rule_id: id,
      semester_id: id,
      occurred_on: date,
      note,
      client_request_id: id,
    },
    ['student_id', 'rule_id', 'semester_id', 'occurred_on', 'note', 'client_request_id'],
  ),
  PointReviewInput: input({
    reason: {
      type: 'string',
      maxLength: 2000,
      description: 'Wajib tidak kosong untuk reject/void; opsional untuk approve.',
    },
  }),
  PointAttachment: object({
    id,
    original_name: { type: 'string' },
    mime_type: { type: 'string' },
    size: { type: 'integer' },
    created_at: { type: 'string' },
  }),
  PointEntry: object({
    id,
    school_id: id,
    student_id: id,
    student_name: { type: 'string' },
    class_id: id,
    class_name: { type: 'string' },
    semester_id: id,
    rule_id: id,
    rule_name: { type: 'string' },
    kind: { type: 'string', enum: ['appreciation', 'violation'] },
    points: { type: 'integer' },
    occurred_on: date,
    note: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'voided'] },
    created_by: id,
    created_by_name: { type: 'string' },
    created_at: { type: 'string' },
    reviewed_by: { type: ['string', 'null'] },
    reviewed_at: { type: ['string', 'null'] },
    review_reason: { type: 'string' },
    voided_by: { type: ['string', 'null'] },
    voided_at: { type: ['string', 'null'] },
    void_reason: { type: 'string' },
    client_request_id: id,
    request_hash: { type: 'string' },
    can_review: {
      type: 'integer',
      enum: [0, 1],
      description: 'Disertakan pada detail/create/review.',
    },
    can_attach: {
      type: 'integer',
      enum: [0, 1],
      description: 'Disertakan pada detail/create/review.',
    },
    attachments: {
      type: 'array',
      items: ref('PointAttachment'),
      description: 'Disertakan pada detail/create/review.',
    },
  }),
  PointSummary: object({
    id,
    name: { type: 'string' },
    nis: { type: 'string' },
    appreciation: { type: 'integer' },
    violation: { type: 'integer' },
    open_cases: { type: 'integer' },
  }),
  PointCaseInput: input(
    {
      student_id: id,
      semester_id: id,
      title: { type: 'string', minLength: 1, maxLength: 120 },
      note,
      due_date: { type: ['string', 'null'], format: 'date' },
    },
    ['student_id', 'semester_id', 'title', 'note'],
  ),
  PointCaseUpdate: {
    ...input({
      status: { type: 'string', enum: ['open', 'in_progress', 'resolved'] },
      due_date: { type: ['string', 'null'], format: 'date' },
      resolution: {
        type: 'string',
        maxLength: 2000,
        description: 'Wajib tidak kosong bila status resolved.',
      },
      assign_to_me: { type: 'boolean', const: true },
    }),
    minProperties: 1,
  },
  PointActivityInput: input({ note }, ['note']),
  PointCase: object({
    id,
    school_id: id,
    student_id: id,
    student_name: { type: 'string' },
    semester_id: id,
    policy_id: { type: ['string', 'null'] },
    title: { type: 'string' },
    note: { type: 'string' },
    status: { type: 'string', enum: ['open', 'in_progress', 'resolved'] },
    responsible_user_id: { type: ['string', 'null'] },
    responsible_name: { type: ['string', 'null'] },
    due_date: { type: ['string', 'null'], format: 'date' },
    resolution: { type: 'string' },
    created_by: id,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    activities: {
      type: 'array',
      items: object({
        id,
        note: { type: 'string' },
        created_by_name: { type: 'string' },
        created_at: { type: 'string' },
      }),
      description: 'Disertakan pada detail dan hasil mutasi.',
    },
  }),
  PointStudentsPage: page('PointStudent'),
  PointRulesPage: page('PointRule'),
  PointPoliciesPage: page('PointPolicy'),
  PointEntriesPage: page('PointEntry'),
  PointSummaryPage: page('PointSummary'),
  PointCasesPage: page('PointCase'),
};
export const pointPaths = {
  '/points/options': {
    get: operation('Kapabilitas poin, semester, dan kelas aktif', 'PointOptions'),
  },
  '/points/students': {
    get: operation('Cari identitas dasar murid aktif satu sekolah', 'PointStudentsPage', [
      ...pages,
      query('search', { type: 'string', maxLength: 100 }),
      query('class_id', id),
    ]),
  },
  '/points/rules': {
    get: operation('Aturan poin; guru hanya melihat aturan aktif', 'PointRulesPage', pages),
    post: operation(
      'Buat aturan (points.manage + points.write)',
      'PointRule',
      [],
      'PointRuleInput',
      true,
    ),
  },
  '/points/rules/{id}': {
    patch: operation(
      'Ganti seluruh pengaturan aturan; histori tetap memakai snapshot',
      'PointRule',
      [param('id')],
      'PointRuleInput',
    ),
  },
  '/points/policies': {
    get: operation('Ambang pembinaan', 'PointPoliciesPage', pages),
    post: operation(
      'Buat ambang (points.manage + points.write)',
      'PointPolicy',
      [],
      'PointPolicyInput',
      true,
    ),
  },
  '/points/policies/{id}': {
    patch: operation(
      'Ganti seluruh pengaturan ambang',
      'PointPolicy',
      [param('id')],
      'PointPolicyInput',
    ),
  },
  '/points/entries': {
    get: operation(
      'Catatan sendiri dan murid kelas wali; admin seluruh sekolah',
      'PointEntriesPage',
      [
        ...pages,
        query('scope', {
          type: 'string',
          enum: ['accessible', 'mine', 'homeroom'],
          default: 'accessible',
        }),
        query('student_id', id),
        query('semester_id', id),
        query('class_id', id),
        query('kind', { type: 'string', enum: ['appreciation', 'violation'] }),
        query('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'voided'] }),
        query('from', date),
        query('to', date),
      ],
    ),
    post: operation(
      'Ajukan poin; wali kelas sendiri/admin langsung disahkan. Retry identik 200, baru 201.',
      'PointEntry',
      [],
      'PointEntryInput',
      true,
    ),
  },
  '/points/entries/{id}': {
    get: operation('Detail catatan beserta lampiran dan kapabilitas tindakan', 'PointEntry', [
      param('id'),
    ]),
  },
  '/points/entries/{id}/approve': {
    post: operation(
      'Wali kelas/admin mengesahkan pending',
      'PointEntry',
      [param('id')],
      'PointReviewInput',
    ),
  },
  '/points/entries/{id}/reject': {
    post: operation(
      'Wali kelas/admin menolak pending, alasan wajib',
      'PointEntry',
      [param('id')],
      'PointReviewInput',
    ),
  },
  '/points/entries/{id}/void': {
    post: operation(
      'Wali kelas/admin membatalkan approved, alasan wajib',
      'PointEntry',
      [param('id')],
      'PointReviewInput',
    ),
  },
  '/points/entries/{id}/attachments': {
    post: {
      ...operation(
        'Unggah bukti privat; maks. 3 file, masing-masing 5 MB',
        'PointAttachment',
        [param('id')],
        undefined,
        true,
      ),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: object(
              {
                file: {
                  type: 'string',
                  format: 'binary',
                  description:
                    'PNG, JPEG, WebP atau PDF. Hanya pencatat; pending atau approved yang disahkan sendiri.',
                },
              },
              ['file'],
            ),
          },
        },
      },
    },
  },
  '/points/entries/{id}/attachments/{attachmentId}': {
    get: {
      ...operation('Unduh bukti dengan Bearer token dan akses catatan', 'PointAttachment', [
        param('id'),
        param('attachmentId'),
      ]),
      responses: {
        ...errors,
        '200': {
          description: 'Berkas privat (Content-Disposition: attachment).',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'image/png': { schema: { type: 'string', format: 'binary' } },
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/webp': { schema: { type: 'string', format: 'binary' } },
          },
        },
      },
    },
  },
  '/points/summary': {
    get: operation('Rekap semester murid/kelas (wali kelas atau admin)', 'PointSummaryPage', [
      ...pages,
      query('semester_id', id, true),
      query('student_id', id),
      query('class_id', id),
    ]),
  },
  '/points/cases': {
    get: operation('Daftar pembinaan sesuai akses kelas', 'PointCasesPage', [
      ...pages,
      query('semester_id', id),
      query('student_id', id),
      query('status', { type: 'string', enum: ['open', 'in_progress', 'resolved'] }),
    ]),
    post: operation(
      'Buka pembinaan manual tanpa menunggu ambang',
      'PointCase',
      [],
      'PointCaseInput',
      true,
    ),
  },
  '/points/cases/{id}': {
    get: operation('Detail pembinaan dan riwayat aktivitas', 'PointCase', [param('id')]),
    patch: operation(
      'Perbarui status, tenggat, hasil, atau ambil tanggung jawab',
      'PointCase',
      [param('id')],
      'PointCaseUpdate',
    ),
  },
  '/points/cases/{id}/activities': {
    post: operation(
      'Tambah aktivitas pembinaan',
      'PointCase',
      [param('id')],
      'PointActivityInput',
      true,
    ),
  },
};
