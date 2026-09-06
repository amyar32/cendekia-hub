'use client';

import { AcademicEntityManager, type AcademicEntityConfig } from './academic-entity-manager';

const semester: AcademicEntityConfig = {
  endpoint: '/api/modules/semesters',
  title: 'Semester',
  singular: 'Semester',
  description: 'Kelola semester dan periode dalam setiap tahun ajaran.',
  note: 'Semester aktif lain dalam sekolah akan dinonaktifkan otomatis.',
  defaults: {
    academic_year_id: '',
    name: '',
    period: '1',
    start_date: '',
    end_date: '',
    is_active: false,
  },
  fields: [
    {
      key: 'academic_year_id',
      label: 'Tahun ajaran',
      kind: 'select',
      placeholder: 'Pilih tahun ajaran',
      required: true,
    },
    { key: 'name', label: 'Nama semester', placeholder: 'Contoh: Semester Ganjil', required: true },
    {
      key: 'period',
      label: 'Periode',
      kind: 'select',
      placeholder: 'Pilih periode semester',
      required: true,
      options: [
        { value: '1', label: '1 — Ganjil' },
        { value: '2', label: '2 — Genap' },
      ],
    },
    {
      key: 'start_date',
      label: 'Tanggal mulai',
      kind: 'date',
      placeholder: 'Pilih tanggal mulai',
      required: true,
    },
    {
      key: 'end_date',
      label: 'Tanggal selesai',
      kind: 'date',
      placeholder: 'Pilih tanggal selesai',
      required: true,
    },
  ],
  columns: [
    { key: 'name', label: 'NAMA' },
    { key: 'academic_year_name', label: 'TAHUN AJARAN' },
    { key: 'period', label: 'PERIODE' },
    { key: 'start_date', label: 'MULAI', kind: 'date' },
    { key: 'end_date', label: 'SELESAI', kind: 'date' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};
const grade: AcademicEntityConfig = {
  endpoint: '/api/modules/grades',
  title: 'Tingkat / Kelas',
  singular: 'Tingkat / kelas',
  description: 'Kelola jenjang tingkat kelas yang berlaku di sekolah.',
  note: 'Urutan tingkat harus unik dan menentukan susunan tingkat di seluruh modul akademik.',
  defaults: { name: '', level_order: 1, description: '', is_active: true },
  fields: [
    { key: 'name', label: 'Nama tingkat', placeholder: 'Contoh: Kelas 7', required: true },
    {
      key: 'level_order',
      label: 'Urutan tingkat',
      kind: 'number',
      min: 1,
      max: 99,
      required: true,
    },
    {
      key: 'description',
      label: 'Deskripsi',
      kind: 'textarea',
      placeholder: 'Keterangan opsional',
    },
  ],
  columns: [
    { key: 'level_order', label: 'URUTAN' },
    { key: 'name', label: 'NAMA' },
    { key: 'description', label: 'DESKRIPSI' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};
const classroom: AcademicEntityConfig = {
  endpoint: '/api/modules/classes',
  title: 'Rombel',
  singular: 'Rombel',
  description: 'Kelola rombongan belajar per tahun ajaran dan tingkat.',
  note: 'Rombel selalu terikat pada satu tahun ajaran dan satu tingkat / kelas.',
  defaults: { academic_year_id: '', grade_id: '', name: '', capacity: 0, is_active: true },
  fields: [
    {
      key: 'academic_year_id',
      label: 'Tahun ajaran',
      kind: 'select',
      placeholder: 'Pilih tahun ajaran',
      required: true,
    },
    {
      key: 'grade_id',
      label: 'Tingkat / kelas',
      kind: 'select',
      placeholder: 'Pilih tingkat / kelas',
      required: true,
    },
    { key: 'name', label: 'Nama rombel', placeholder: 'Contoh: 7A', required: true },
    {
      key: 'capacity',
      label: 'Kapasitas siswa',
      kind: 'number',
      min: 0,
      max: 1000,
      required: true,
    },
  ],
  columns: [
    { key: 'name', label: 'NAMA' },
    { key: 'grade_name', label: 'TINGKAT' },
    { key: 'academic_year_name', label: 'TAHUN AJARAN' },
    { key: 'capacity', label: 'KAPASITAS' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};
const subject: AcademicEntityConfig = {
  endpoint: '/api/modules/subjects',
  title: 'Mata Pelajaran',
  singular: 'Mata pelajaran',
  description: 'Kelola kode, kategori, dan identitas mata pelajaran.',
  note: 'Kode dan nama mata pelajaran harus unik di dalam sekolah.',
  defaults: { code: '', name: '', category: '', description: '', is_active: true },
  fields: [
    { key: 'code', label: 'Kode', placeholder: 'Contoh: MAT', required: true },
    {
      key: 'name',
      label: 'Nama mata pelajaran',
      placeholder: 'Contoh: Matematika',
      required: true,
    },
    { key: 'category', label: 'Kategori', placeholder: 'Contoh: Wajib' },
    {
      key: 'description',
      label: 'Deskripsi',
      kind: 'textarea',
      placeholder: 'Keterangan opsional',
    },
  ],
  columns: [
    { key: 'code', label: 'KODE', kind: 'code' },
    { key: 'name', label: 'NAMA' },
    { key: 'category', label: 'KATEGORI' },
    { key: 'description', label: 'DESKRIPSI' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

export const SemesterManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={semester} writable={writable} />
);
export const GradeManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={grade} writable={writable} />
);
export const ClassManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={classroom} writable={writable} />
);
export const SubjectManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={subject} writable={writable} />
);
