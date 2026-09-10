'use client';

import {
  AcademicEntityManager,
  type AcademicEntityConfig,
} from '@/components/academic/academic-entity-manager';
import { useState } from 'react';
import { IdentityCardModal } from '@/components/identity-card/identity-card-modal';

const teacher: AcademicEntityConfig = {
  endpoint: '/api/modules/teachers',
  title: 'Data Guru',
  singular: 'Guru',
  eyebrow: 'GURU',
  description: 'Kelola identitas, kontak, akun, dan status kepegawaian guru.',
  note: 'Akun aplikasi dibuat otomatis untuk guru baru. Email wajib dan password sementara hanya ditampilkan satu kali.',
  defaults: {
    create_account: true,
    user_id: '',
    photo_url: '',
    employee_code: '',
    nip: '',
    name: '',
    gender: '',
    birth_date: '',
    blood_type: '',
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
    { key: 'employee_code', label: 'Kode Guru', placeholder: 'Contoh: GR-001', required: true },
    { key: 'nip', label: 'NIP/NUPTK', placeholder: 'NIP atau NUPTK (opsional)', maxLength: 30 },
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
    {
      key: 'blood_type',
      label: 'Golongan darah',
      kind: 'select',
      placeholder: 'Pilih golongan darah (opsional)',
      options: ['A', 'B', 'AB', 'O'].map((value) => ({ value, label: value })),
    },
    { key: 'phone', label: 'Nomor telepon', placeholder: 'Contoh: 081234567890', maxLength: 30 },
    {
      key: 'email',
      label: 'Email',
      placeholder: 'guru@sekolah.sch.id',
      description: 'Digunakan sebagai email login jika akun aplikasi dibuat.',
    },
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
      key: 'create_account',
      label: 'Buat akun aplikasi',
      kind: 'switch',
      description: 'Akun role Guru dan password sementara akan dibuat bersama profil ini.',
      createOnly: true,
    },
    {
      key: 'user_id',
      label: 'Akun pengguna',
      kind: 'select',
      optionsKey: 'user_id',
      placeholder: 'Hubungkan akun (opsional)',
      editOnly: true,
    },
  ],
  columns: [
    { key: 'photo_url', label: 'FOTO', kind: 'avatar' },
    { key: 'employee_code', label: 'KODE GURU', kind: 'code' },
    { key: 'name', label: 'NAMA' },
    { key: 'nip', label: 'NIP/NUPTK' },
    { key: 'gender_label', label: 'JENIS KELAMIN' },
    { key: 'blood_type', label: 'GOL. DARAH' },
    { key: 'employment_status_label', label: 'STATUS PEGAWAI' },
    { key: 'account_status', label: 'AKSES APLIKASI', kind: 'account' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

const teachingAssignment: AcademicEntityConfig = {
  endpoint: '/api/modules/teaching-assignments',
  title: 'Penugasan Mapel',
  singular: 'Penugasan mengajar',
  eyebrow: 'DATA AKADEMIK',
  academicYearFilter: true,
  filters: [
    { key: 'class_id', label: 'Semua rombel' },
    { key: 'subject_id', label: 'Semua mata pelajaran' },
  ],
  description:
    'Tentukan mapel yang diampu guru sekaligus rombel dan periode akademik tempatnya mengajar. Rombel dengan guru, mapel, dan periode sama ditampilkan dalam satu baris.',
  note: 'Setiap penugasan langsung menetapkan mapel yang diampu. Rombel dan semester harus berada pada tahun ajaran yang dipilih.',
  hasStatus: false,
  groupedRowsReadOnly: true,
  defaults: { teacher_id: '', subject_id: '', class_id: '', class_ids: [], semester_id: 'all' },
  fields: [
    { key: 'teacher_id', label: 'Guru', kind: 'select', required: true },
    { key: 'subject_id', label: 'Mata pelajaran', kind: 'select', required: true },
    {
      key: 'class_id',
      label: 'Rombel',
      kind: 'select',
      multipleKey: 'class_ids',
      required: true,
      description: 'Anda dapat memilih lebih dari satu rombel saat menambah penugasan.',
    },
    {
      key: 'semester_id',
      label: 'Semester',
      kind: 'select',
      placeholder: 'Pilih semester',
      description: 'Pilih Semua semester jika penugasan berlaku selama satu tahun ajaran.',
    },
  ],
  columns: [
    { key: 'teacher_name', label: 'GURU' },
    { key: 'subject_name', label: 'MATA PELAJARAN' },
    { key: 'class_name', label: 'ROMBEL' },
    { key: 'semester_name', label: 'SEMESTER' },
  ],
};

const homeroomAssignment: AcademicEntityConfig = {
  endpoint: '/api/modules/homeroom-assignments',
  title: 'Wali Kelas',
  singular: 'Penugasan wali kelas',
  eyebrow: 'DATA AKADEMIK',
  academicYearFilter: true,
  description:
    'Tentukan guru yang menjadi wali kelas untuk setiap rombel pada tahun ajaran tertentu.',
  note: 'Satu guru hanya dapat menjadi wali satu rombel, dan satu rombel hanya memiliki satu wali pada tahun ajaran yang sama.',
  hasStatus: false,
  defaults: { teacher_id: '', class_id: '' },
  fields: [
    { key: 'teacher_id', label: 'Guru', kind: 'select', required: true },
    { key: 'class_id', label: 'Rombel', kind: 'select', required: true },
  ],
  columns: [
    { key: 'teacher_name', label: 'WALI KELAS' },
    { key: 'employee_code', label: 'KODE GURU', kind: 'code' },
    { key: 'class_name', label: 'ROMBEL' },
  ],
};

export function TeacherManager({ writable }: { writable: boolean }) {
  const [cardTeacherId, setCardTeacherId] = useState<string | null>(null);
  return (
    <>
      <AcademicEntityManager
        config={teacher}
        writable={writable}
        onCard={(row) => setCardTeacherId(row.id)}
      />
      <IdentityCardModal
        key={cardTeacherId || 'closed'}
        personId={cardTeacherId}
        personType="teacher"
        writable={writable}
        onClose={() => setCardTeacherId(null)}
      />
    </>
  );
}
export const TeachingAssignmentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={teachingAssignment} writable={writable} />
);
export const HomeroomAssignmentManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={homeroomAssignment} writable={writable} />
);
