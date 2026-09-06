'use client';

import {
  AcademicEntityManager,
  type AcademicEntityConfig,
} from '@/components/academic/academic-entity-manager';

const teacher: AcademicEntityConfig = {
  endpoint: '/api/modules/teachers',
  title: 'Data Guru',
  singular: 'Guru',
  eyebrow: 'GURU',
  description: 'Kelola identitas, kontak, akun, dan status kepegawaian guru.',
  note: 'Kode pegawai wajib unik. NIP dan akun pengguna bersifat opsional.',
  defaults: {
    user_id: '',
    photo_url: '',
    employee_code: '',
    nip: '',
    name: '',
    gender: '',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    join_date: '',
    employment_status: '',
    is_active: true,
  },
  fields: [
    {
      key: 'photo_url',
      label: 'Foto guru',
      kind: 'image',
      uploadScope: 'teacher.photo',
      description: 'PNG, JPEG, atau WebP. Ukuran maksimal 5 MB.',
    },
    { key: 'employee_code', label: 'Kode pegawai', placeholder: 'Contoh: GR-001', required: true },
    { key: 'nip', label: 'NIP', placeholder: 'Nomor induk pegawai (opsional)', maxLength: 30 },
    { key: 'name', label: 'Nama lengkap', placeholder: 'Nama lengkap guru', required: true },
    {
      key: 'gender',
      label: 'Jenis kelamin',
      kind: 'select',
      required: true,
      options: [
        { value: 'male', label: 'Laki-laki' },
        { value: 'female', label: 'Perempuan' },
      ],
    },
    { key: 'birth_date', label: 'Tanggal lahir', kind: 'date' },
    { key: 'phone', label: 'Nomor telepon', placeholder: 'Contoh: 081234567890', maxLength: 30 },
    { key: 'email', label: 'Email', placeholder: 'guru@sekolah.sch.id' },
    { key: 'address', label: 'Alamat', kind: 'textarea', placeholder: 'Alamat tempat tinggal' },
    { key: 'join_date', label: 'Tanggal bergabung', kind: 'date' },
    {
      key: 'employment_status',
      label: 'Status kepegawaian',
      kind: 'select',
      required: true,
      options: [
        { value: 'permanent', label: 'Tetap' },
        { value: 'contract', label: 'Kontrak' },
        { value: 'honorary', label: 'Honorer' },
      ],
    },
    {
      key: 'user_id',
      label: 'Akun pengguna',
      kind: 'select',
      optionsKey: 'user_id',
      placeholder: 'Hubungkan akun (opsional)',
    },
  ],
  columns: [
    { key: 'photo_url', label: 'FOTO', kind: 'avatar' },
    { key: 'employee_code', label: 'KODE', kind: 'code' },
    { key: 'name', label: 'NAMA' },
    { key: 'nip', label: 'NIP' },
    { key: 'gender_label', label: 'JENIS KELAMIN' },
    { key: 'employment_status_label', label: 'STATUS PEGAWAI' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

const teachingAssignment: AcademicEntityConfig = {
  endpoint: '/api/modules/teaching-assignments',
  title: 'Mapel & Penugasan Mengajar',
  singular: 'Penugasan mengajar',
  eyebrow: 'GURU',
  description:
    'Tentukan mapel yang diampu guru sekaligus rombel dan periode akademik tempatnya mengajar.',
  note: 'Setiap penugasan langsung menetapkan mapel yang diampu. Rombel dan semester harus berada pada tahun ajaran yang dipilih.',
  hasStatus: false,
  defaults: { teacher_id: '', subject_id: '', class_id: '', academic_year_id: '', semester_id: '' },
  fields: [
    { key: 'teacher_id', label: 'Guru', kind: 'select', required: true },
    { key: 'subject_id', label: 'Mata pelajaran', kind: 'select', required: true },
    { key: 'class_id', label: 'Rombel', kind: 'select', required: true },
    { key: 'academic_year_id', label: 'Tahun ajaran', kind: 'select', required: true },
    {
      key: 'semester_id',
      label: 'Semester',
      kind: 'select',
      placeholder: 'Semua semester (opsional)',
    },
  ],
  columns: [
    { key: 'teacher_name', label: 'GURU' },
    { key: 'subject_name', label: 'MATA PELAJARAN' },
    { key: 'class_name', label: 'ROMBEL' },
    { key: 'academic_year_name', label: 'TAHUN AJARAN' },
    { key: 'semester_name', label: 'SEMESTER' },
  ],
};

const homeroomAssignment: AcademicEntityConfig = {
  endpoint: '/api/modules/homeroom-assignments',
  title: 'Wali Kelas',
  singular: 'Penugasan wali kelas',
  eyebrow: 'GURU',
  description:
    'Tentukan guru yang menjadi wali kelas untuk setiap rombel pada tahun ajaran tertentu.',
  note: 'Satu guru hanya dapat menjadi wali satu rombel, dan satu rombel hanya memiliki satu wali pada tahun ajaran yang sama.',
  hasStatus: false,
  defaults: { teacher_id: '', class_id: '', academic_year_id: '' },
  fields: [
    { key: 'teacher_id', label: 'Guru', kind: 'select', required: true },
    { key: 'class_id', label: 'Rombel', kind: 'select', required: true },
    { key: 'academic_year_id', label: 'Tahun ajaran', kind: 'select', required: true },
  ],
  columns: [
    { key: 'teacher_name', label: 'WALI KELAS' },
    { key: 'employee_code', label: 'KODE GURU', kind: 'code' },
    { key: 'class_name', label: 'ROMBEL' },
    { key: 'academic_year_name', label: 'TAHUN AJARAN' },
  ],
};

export const TeacherManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={teacher} writable={writable} />
);
export const TeachingAssignmentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={teachingAssignment} writable={writable} />
);
export const HomeroomAssignmentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={homeroomAssignment} writable={writable} />
);
