'use client';

import {
  AcademicEntityManager,
  type AcademicEntityConfig,
} from '@/components/academic/academic-entity-manager';

const student: AcademicEntityConfig = {
  endpoint: '/api/modules/students',
  title: 'Data Murid',
  singular: 'Murid',
  eyebrow: 'MURID',
  description: 'Kelola identitas, kontak, tanggal masuk, dan status murid.',
  note: 'NIS wajib unik dalam sekolah. NISN dapat dikosongkan, tetapi harus unik jika diisi.',
  defaults: {
    nis: '',
    nisn: '',
    name: '',
    gender: '',
    birth_date: '',
    birth_place: '',
    address: '',
    phone: '',
    email: '',
    enrollment_date: '',
    is_active: true,
  },
  fields: [
    { key: 'nis', label: 'NIS', placeholder: 'Contoh: S-001', required: true, maxLength: 30 },
    { key: 'nisn', label: 'NISN', placeholder: 'Nomor induk siswa nasional', maxLength: 30 },
    { key: 'name', label: 'Nama lengkap', placeholder: 'Nama lengkap murid', required: true },
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
    { key: 'birth_place', label: 'Tempat lahir', placeholder: 'Kota kelahiran' },
    {
      key: 'birth_date',
      label: 'Tanggal lahir',
      kind: 'date',
      placeholder: 'Pilih tanggal lahir',
    },
    {
      key: 'address',
      label: 'Alamat',
      kind: 'textarea',
      placeholder: 'Masukkan alamat tempat tinggal',
    },
    { key: 'phone', label: 'Nomor telepon', placeholder: 'Contoh: 081234567890', maxLength: 30 },
    { key: 'email', label: 'Email', placeholder: 'murid@example.com' },
    {
      key: 'enrollment_date',
      label: 'Tanggal masuk',
      kind: 'date',
      placeholder: 'Pilih tanggal masuk',
    },
  ],
  columns: [
    { key: 'nis', label: 'NIS', kind: 'code' },
    { key: 'nisn', label: 'NISN' },
    { key: 'name', label: 'NAMA' },
    { key: 'gender_label', label: 'JENIS KELAMIN' },
    { key: 'enrollment_date', label: 'TANGGAL MASUK', kind: 'date' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

const guardian: AcademicEntityConfig = {
  endpoint: '/api/modules/guardians',
  title: 'Wali Murid',
  singular: 'Wali murid',
  eyebrow: 'MURID',
  description: 'Kelola orang tua atau wali yang dapat dihubungi untuk setiap murid.',
  note: 'Setiap murid dapat memiliki beberapa wali, tetapi hanya satu yang ditandai sebagai wali utama.',
  hasStatus: false,
  defaults: {
    student_id: '',
    name: '',
    relation: '',
    phone: '',
    email: '',
    address: '',
    is_primary: false,
  },
  fields: [
    { key: 'student_id', label: 'Murid', kind: 'select', required: true },
    { key: 'name', label: 'Nama wali', placeholder: 'Masukkan nama lengkap wali', required: true },
    { key: 'relation', label: 'Hubungan', placeholder: 'Contoh: Ayah, Ibu, Kakak', required: true },
    {
      key: 'phone',
      label: 'Nomor telepon',
      placeholder: 'Contoh: 081234567890',
      maxLength: 30,
    },
    { key: 'email', label: 'Email', placeholder: 'wali@example.com' },
    {
      key: 'address',
      label: 'Alamat',
      kind: 'textarea',
      placeholder: 'Masukkan alamat wali',
    },
    {
      key: 'is_primary',
      label: 'Wali utama',
      kind: 'switch',
      description: 'Jadikan kontak utama untuk murid ini.',
    },
  ],
  columns: [
    { key: 'student_name', label: 'MURID' },
    { key: 'nis', label: 'NIS', kind: 'code' },
    { key: 'name', label: 'NAMA WALI' },
    { key: 'relation', label: 'HUBUNGAN' },
    { key: 'phone', label: 'TELEPON' },
    { key: 'primary_label', label: 'KONTAK' },
  ],
};

const studentDocument: AcademicEntityConfig = {
  endpoint: '/api/modules/student-documents',
  title: 'Dokumen Murid',
  singular: 'Dokumen murid',
  eyebrow: 'MURID',
  description: 'Simpan dokumen administrasi murid secara terkontrol.',
  note: 'Format file: PDF, PNG, JPEG, atau WebP dengan ukuran maksimal 10 MB.',
  hasStatus: false,
  defaults: { student_id: '', type: '', file_url: '', description: '' },
  fields: [
    { key: 'student_id', label: 'Murid', kind: 'select', required: true },
    { key: 'type', label: 'Jenis dokumen', placeholder: 'Contoh: Akta kelahiran', required: true },
    {
      key: 'file_url',
      label: 'File dokumen',
      kind: 'file',
      uploadScope: 'student.document',
      required: true,
      description: 'PDF atau gambar, maksimal 10 MB.',
    },
    {
      key: 'description',
      label: 'Keterangan',
      kind: 'textarea',
      placeholder: 'Tambahkan keterangan dokumen (opsional)',
    },
  ],
  columns: [
    { key: 'student_name', label: 'MURID' },
    { key: 'nis', label: 'NIS', kind: 'code' },
    { key: 'type', label: 'JENIS DOKUMEN' },
    { key: 'file_url', label: 'FILE', kind: 'file' },
    { key: 'description', label: 'KETERANGAN' },
  ],
};

const classMembership: AcademicEntityConfig = {
  endpoint: '/api/modules/class-memberships',
  title: 'Riwayat Kelas',
  singular: 'Riwayat kelas',
  eyebrow: 'MURID',
  description: 'Kelola riwayat murid berada di rombel pada tahun ajaran tertentu.',
  note: 'Murid hanya dapat memiliki satu keanggotaan aktif pada setiap tahun ajaran; riwayat pindah kelas tetap tersimpan.',
  hasStatus: false,
  defaults: {
    student_id: '',
    class_id: '',
    academic_year_id: '',
    start_date: '',
    end_date: '',
    status: 'active',
  },
  fields: [
    { key: 'student_id', label: 'Murid', kind: 'select', required: true },
    { key: 'academic_year_id', label: 'Tahun ajaran', kind: 'select', required: true },
    { key: 'class_id', label: 'Rombel', kind: 'select', required: true },
    {
      key: 'start_date',
      label: 'Tanggal mulai',
      kind: 'date-range',
      required: true,
      placeholder: 'Pilih tanggal mulai',
      secondaryKey: 'end_date',
      secondaryLabel: 'Tanggal selesai',
      secondaryPlaceholder: 'Pilih tanggal selesai (opsional)',
    },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      required: true,
      options: [
        { value: 'active', label: 'Aktif' },
        { value: 'completed', label: 'Selesai' },
        { value: 'transferred', label: 'Pindah' },
        { value: 'withdrawn', label: 'Keluar' },
      ],
    },
  ],
  columns: [
    { key: 'student_name', label: 'MURID' },
    { key: 'nis', label: 'NIS', kind: 'code' },
    { key: 'class_name', label: 'ROMBEL' },
    { key: 'academic_year_name', label: 'TAHUN AJARAN' },
    { key: 'start_date', label: 'MULAI', kind: 'date' },
    { key: 'status_label', label: 'STATUS' },
  ],
};

export const StudentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={student} writable={writable} />
);
export const GuardianManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={guardian} writable={writable} />
);
export const StudentDocumentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={studentDocument} writable={writable} />
);
export const ClassMembershipManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={classMembership} writable={writable} />
);
