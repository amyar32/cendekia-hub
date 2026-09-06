export const permissions = [
  'dashboard.read',
  'users.read',
  'users.write',
  'roles.read',
  'roles.write',
  'audit.read',
  'categories.read',
  'categories.write',
  'school.read',
  'school.write',
  'academic-years.read',
  'academic-years.write',
] as const;
export type Permission = (typeof permissions)[number];
export type ModuleKey = 'users' | 'roles' | 'audit' | 'categories' | 'school' | 'academic-years';
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
    key: 'school',
    label: 'Pengaturan Sekolah',
    description: 'Kelola identitas dan informasi kontak sekolah.',
    path: '/settings/school',
    permission: 'school.read',
    group: 'Preferensi',
  },
  {
    key: 'categories',
    label: 'Kategori',
    description: 'Kelola kategori untuk mengorganisir data Anda.',
    path: '/master-data/categories',
    permission: 'categories.read',
    group: 'Master data',
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
