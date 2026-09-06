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
] as const;
export type Permission = (typeof permissions)[number];
export type ModuleKey = 'users' | 'roles' | 'audit' | 'categories' | 'school';
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
    label: 'Role & permission',
    description: 'Tentukan apa yang dapat diakses oleh setiap role.',
    path: '/roles',
    permission: 'roles.read',
    group: 'Administrasi',
  },
  {
    key: 'audit',
    label: 'Audit trail',
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
