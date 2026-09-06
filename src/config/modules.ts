export const permissions = [
  'dashboard.read',
  'users.read',
  'users.write',
  'roles.read',
  'roles.write',
  'audit.read',
  'school.read',
  'school.write',
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
] as const;
export type Permission = (typeof permissions)[number];
export type ModuleKey =
  | 'users'
  | 'roles'
  | 'audit'
  | 'school'
  | 'academic-years'
  | 'semesters'
  | 'grades'
  | 'classes'
  | 'subjects'
  | 'teachers'
  | 'teacher-subjects'
  | 'teaching-assignments'
  | 'homeroom-assignments';
export type CmsModule = {
  key: ModuleKey;
  label: string;
  description: string;
  path: string;
  permission: Permission;
  group: string;
};

export const modules: CmsModule[] = [
  {
    key: 'academic-years',
    label: 'Tahun Ajaran',
    description: 'Kelola periode tahun ajaran dan tentukan periode yang sedang aktif.',
    path: '/academic/academic-years',
    permission: 'academic-years.read',
    group: 'Akademik',
  },
  {
    key: 'semesters',
    label: 'Semester',
    description: 'Kelola semester dan periode dalam setiap tahun ajaran.',
    path: '/academic/semesters',
    permission: 'semesters.read',
    group: 'Akademik',
  },
  {
    key: 'grades',
    label: 'Tingkat / Kelas',
    description: 'Kelola jenjang tingkat kelas yang berlaku di sekolah.',
    path: '/academic/grades',
    permission: 'grades.read',
    group: 'Akademik',
  },
  {
    key: 'classes',
    label: 'Rombel',
    description: 'Kelola rombongan belajar per tahun ajaran dan tingkat.',
    path: '/academic/classes',
    permission: 'classes.read',
    group: 'Akademik',
  },
  {
    key: 'subjects',
    label: 'Mata Pelajaran',
    description: 'Kelola kode, kategori, dan identitas mata pelajaran.',
    path: '/academic/subjects',
    permission: 'subjects.read',
    group: 'Akademik',
  },
  {
    key: 'teachers',
    label: 'Data Guru',
    description: 'Kelola identitas dan status kepegawaian guru.',
    path: '/teachers',
    permission: 'teachers.read',
    group: 'Guru',
  },
  {
    key: 'teacher-subjects',
    label: 'Mapel Diampu',
    description: 'Tentukan mata pelajaran yang dapat diampu setiap guru.',
    path: '/teachers/subjects',
    permission: 'teacher-subjects.read',
    group: 'Guru',
  },
  {
    key: 'teaching-assignments',
    label: 'Penugasan Mengajar',
    description: 'Kelola penugasan guru pada rombel, mapel, tahun ajaran, dan semester.',
    path: '/teachers/teaching-assignments',
    permission: 'teaching-assignments.read',
    group: 'Guru',
  },
  {
    key: 'homeroom-assignments',
    label: 'Wali Kelas',
    description: 'Tentukan guru wali kelas untuk setiap rombel dan tahun ajaran.',
    path: '/teachers/homeroom-assignments',
    permission: 'homeroom-assignments.read',
    group: 'Guru',
  },
  {
    key: 'school',
    label: 'Pengaturan Sekolah',
    description: 'Kelola identitas dan informasi kontak sekolah.',
    path: '/settings/school',
    permission: 'school.read',
    group: 'Preferensi',
  },
  {
    key: 'users',
    label: 'Pengguna',
    description: 'Kelola anggota dan akses ke workspace.',
    path: '/users',
    permission: 'users.read',
    group: 'Administrasi',
  },
  {
    key: 'roles',
    label: 'Role & Permission',
    description: 'Tentukan apa yang dapat diakses oleh setiap role.',
    path: '/roles',
    permission: 'roles.read',
    group: 'Administrasi',
  },
  {
    key: 'audit',
    label: 'Audit Trail',
    description: 'Telusuri aktivitas dan perubahan di workspace.',
    path: '/audit',
    permission: 'audit.read',
    group: 'Administrasi',
  },
];

export const moduleByKey = Object.fromEntries(modules.map((module) => [module.key, module])) as {
  [Key in ModuleKey]: CmsModule & { key: Key };
};

export function can(grants: readonly string[], permission: string) {
  return grants.includes(permission);
}
