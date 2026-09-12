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
  'extracurriculars.read',
  'extracurriculars.write',
  'teachers.read',
  'teachers.write',
  'teaching-assignments.read',
  'teaching-assignments.write',
  'homeroom-assignments.read',
  'homeroom-assignments.write',
  'extracurricular-assignments.read',
  'extracurricular-assignments.write',
  'students.read',
  'students.write',
  'admissions.read',
  'admissions.write',
  'promotions.read',
  'promotions.write',
  'schedules.read',
  'schedules.write',
  'student-attendance.read',
  'student-attendance.write',
  'student-attendance.approve',
  'student-attendance.report',
  'checkins.read',
  'checkins.write',
  'checkins.report',
  'extracurricular-attendance.read',
  'extracurricular-attendance.write',
  'extracurricular-attendance.approve',
  'academic-reports.read',
] as const;
export type Permission = (typeof permissions)[number];
export type ModuleKey =
  | 'onboarding'
  | 'users'
  | 'roles'
  | 'audit'
  | 'school'
  | 'academic-years'
  | 'semesters'
  | 'classes'
  | 'grades'
  | 'subjects'
  | 'extracurriculars'
  | 'teachers'
  | 'teaching-assignments'
  | 'homeroom-assignments'
  | 'extracurricular-assignments'
  | 'students'
  | 'admissions'
  | 'promotions'
  | 'schedules'
  | 'student-attendance'
  | 'checkins'
  | 'extracurricular-attendance'
  | 'academic-reports';
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
    key: 'onboarding',
    label: 'Persiapan Sekolah',
    description: 'Selesaikan konfigurasi awal, import data, dan checklist kesiapan operasional.',
    path: '/onboarding',
    permission: 'school.read',
    group: 'Utama',
  },
  {
    key: 'academic-years',
    label: 'Tahun Ajaran',
    description: 'Kelola periode tahun ajaran dan salin data akademik tahun sebelumnya.',
    path: '/academic/academic-years',
    permission: 'academic-years.read',
    group: 'Akademik',
  },
  {
    key: 'homeroom-assignments',
    label: 'Wali Kelas',
    description: 'Tentukan guru wali kelas untuk setiap rombel dan tahun ajaran.',
    path: '/academic/homeroom-assignments',
    permission: 'homeroom-assignments.read',
    group: 'Akademik',
  },
  {
    key: 'teaching-assignments',
    label: 'Penugasan Mengajar',
    description: 'Kelola mapel yang diampu guru beserta rombel dan periode mengajarnya.',
    path: '/academic/teaching-assignments',
    permission: 'teaching-assignments.read',
    group: 'Akademik',
  },
  {
    key: 'extracurricular-assignments',
    label: 'Penugasan Ekstrakurikuler',
    description: 'Kelola pembina, peserta, jadwal, lokasi, dan kuota ekstrakurikuler per periode.',
    path: '/academic/extracurricular-assignments',
    permission: 'extracurricular-assignments.read',
    group: 'Akademik',
  },
  {
    key: 'promotions',
    label: 'Pergantian Tahun Ajaran',
    description: 'Siapkan tahun baru, petakan rombel, dan proses hasil akademik murid.',
    path: '/annual-transition',
    permission: 'promotions.read',
    group: 'Utama',
  },
  {
    key: 'schedules',
    label: 'Jadwal Pelajaran',
    description: 'Susun jadwal mingguan per rombel dan semester tanpa bentrok guru.',
    path: '/schedules',
    permission: 'schedules.read',
    group: 'Utama',
  },
  {
    key: 'checkins',
    label: 'Check-in',
    description: 'Catat kedatangan murid dan guru serta status keterlambatannya.',
    path: '/checkins',
    permission: 'checkins.read',
    group: 'Utama',
  },
  {
    key: 'student-attendance',
    label: 'Absensi Pelajaran',
    description: 'Buka sesi dari jadwal, catat kehadiran, dan tinjau rekap absensi siswa.',
    path: '/student-attendance',
    permission: 'student-attendance.read',
    group: 'Utama',
  },
  {
    key: 'extracurricular-attendance',
    label: 'Absensi Ekstrakurikuler',
    description: 'Catat kehadiran peserta pada setiap sesi ekstrakurikuler.',
    path: '/extracurricular-attendance',
    permission: 'extracurricular-attendance.read',
    group: 'Utama',
  },
  {
    key: 'semesters',
    label: 'Semester',
    description: 'Kelola semester berdasarkan tahun ajaran.',
    path: '/academic/semesters',
    permission: 'semesters.read',
    group: 'Akademik',
  },
  {
    key: 'classes',
    label: 'Rombel',
    description: 'Kelola rombongan belajar berdasarkan tahun ajaran.',
    path: '/academic/classes',
    permission: 'classes.read',
    group: 'Akademik',
  },
  {
    key: 'teachers',
    label: 'Guru',
    description: 'Kelola identitas dan status kepegawaian guru.',
    path: '/master-data/teachers',
    permission: 'teachers.read',
    group: 'Data Sekolah',
  },
  {
    key: 'students',
    label: 'Murid',
    description: 'Kelola identitas, wali, dokumen, penempatan, dan riwayat kelas murid.',
    path: '/master-data/students',
    permission: 'students.read',
    group: 'Data Sekolah',
  },
  {
    key: 'admissions',
    label: 'Penerimaan Murid Baru',
    description: 'Kelola periode, pendaftaran, verifikasi, seleksi, dan daftar ulang calon murid.',
    path: '/admissions',
    permission: 'admissions.read',
    group: 'Utama',
  },
  {
    key: 'subjects',
    label: 'Mata Pelajaran',
    description: 'Kelola kode, kategori, dan identitas mata pelajaran.',
    path: '/master-data/subjects',
    permission: 'subjects.read',
    group: 'Data Sekolah',
  },
  {
    key: 'extracurriculars',
    label: 'Ekstrakurikuler',
    description: 'Kelola master program ekstrakurikuler sekolah.',
    path: '/master-data/extracurriculars',
    permission: 'extracurriculars.read',
    group: 'Data Sekolah',
  },
  {
    key: 'grades',
    label: 'Tingkat',
    description: 'Kelola jenjang tingkat kelas yang berlaku di sekolah.',
    path: '/master-data/grades',
    permission: 'grades.read',
    group: 'Data Sekolah',
  },
  {
    key: 'academic-reports',
    label: 'Laporan Akademik',
    description: 'Lihat penempatan dan riwayat murid berdasarkan tahun ajaran.',
    path: '/reports/academic',
    permission: 'academic-reports.read',
    group: 'Laporan',
  },
  {
    key: 'school',
    label: 'Sekolah',
    description: 'Kelola identitas dan informasi kontak sekolah.',
    path: '/settings/school',
    permission: 'school.read',
    group: 'Pengaturan',
  },
  {
    key: 'users',
    label: 'Pengguna',
    description: 'Kelola anggota dan akses ke workspace.',
    path: '/administration/users',
    permission: 'users.read',
    group: 'Administrasi',
  },
  {
    key: 'roles',
    label: 'Role & Izin',
    description: 'Tentukan apa yang dapat diakses oleh setiap role.',
    path: '/administration/roles',
    permission: 'roles.read',
    group: 'Administrasi',
  },
  {
    key: 'audit',
    label: 'Audit Trail',
    description: 'Telusuri aktivitas dan perubahan di workspace.',
    path: '/administration/audit',
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
