'use client';

import { AcademicEntityManager, type AcademicEntityConfig } from './academic-entity-manager';

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
const subject: AcademicEntityConfig = {
  endpoint: '/api/modules/subjects',
  title: 'Mata Pelajaran',
  singular: 'Mata pelajaran',
  eyebrow: 'MASTER DATA',
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

const extracurricular: AcademicEntityConfig = {
  endpoint: '/api/modules/extracurriculars',
  title: 'Ekstrakurikuler',
  singular: 'Ekstrakurikuler',
  eyebrow: 'MASTER DATA',
  description: 'Kelola master program ekstrakurikuler sekolah.',
  note: 'Program dibuat satu kali; pembina, peserta, dan jadwal ditentukan melalui penugasan per tahun ajaran.',
  defaults: {
    code: '',
    name: '',
    category: '',
    description: '',
    is_required: false,
    is_active: true,
  },
  fields: [
    { key: 'code', label: 'Kode', placeholder: 'Contoh: PRAMUKA', required: true },
    { key: 'name', label: 'Nama ekstrakurikuler', placeholder: 'Contoh: Pramuka', required: true },
    { key: 'category', label: 'Kategori', placeholder: 'Contoh: Organisasi' },
    { key: 'description', label: 'Deskripsi', kind: 'textarea', placeholder: 'Keterangan program' },
    {
      key: 'is_required',
      label: 'Ekstrakurikuler wajib',
      kind: 'switch',
      description: 'Tandai jika seluruh murid wajib mengikuti program ini.',
    },
  ],
  columns: [
    { key: 'code', label: 'KODE', kind: 'code' },
    { key: 'name', label: 'NAMA' },
    { key: 'category', label: 'KATEGORI' },
    { key: 'requirement_label', label: 'JENIS' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

const semester: AcademicEntityConfig = {
  endpoint: '/api/modules/semesters',
  title: 'Semester',
  singular: 'Semester',
  eyebrow: 'DATA AKADEMIK',
  description: 'Kelola semester untuk tahun ajaran yang dipilih.',
  note: 'Filter tahun ajaran otomatis menggunakan tahun yang aktif.',
  academicYearFilter: true,
  hasStatus: false,
  defaults: {
    academic_year_id: '',
    name: '',
    period: '1',
    start_date: '',
    end_date: '',
  },
  fields: [
    {
      key: 'academic_year_id',
      label: 'Tahun ajaran',
      kind: 'select',
      required: true,
    },
    { key: 'name', label: 'Nama semester', placeholder: 'Contoh: Semester Ganjil', required: true },
    {
      key: 'period',
      label: 'Periode',
      kind: 'select',
      required: true,
      options: [
        { value: '1', label: 'Periode 1' },
        { value: '2', label: 'Periode 2' },
      ],
    },
    {
      key: 'start_date',
      label: 'Tanggal mulai',
      kind: 'date-range',
      secondaryKey: 'end_date',
      secondaryLabel: 'Tanggal selesai',
      required: true,
    },
  ],
  columns: [
    { key: 'name', label: 'NAMA' },
    { key: 'period', label: 'PERIODE' },
    { key: 'start_date', label: 'MULAI', kind: 'date' },
    { key: 'end_date', label: 'SELESAI', kind: 'date' },
  ],
};

const classroom: AcademicEntityConfig = {
  endpoint: '/api/modules/classes',
  title: 'Rombel',
  singular: 'Rombel',
  eyebrow: 'DATA AKADEMIK',
  description: 'Kelola rombongan belajar untuk tahun ajaran yang dipilih.',
  note: 'Filter tahun ajaran otomatis menggunakan tahun yang aktif.',
  academicYearFilter: true,
  viewStudents: true,
  defaults: {
    academic_year_id: '',
    grade_id: '',
    name: '',
    is_active: true,
  },
  fields: [
    { key: 'academic_year_id', label: 'Tahun ajaran', kind: 'select', required: true },
    { key: 'grade_id', label: 'Tingkat / kelas', kind: 'select', required: true },
    { key: 'name', label: 'Nama rombel', placeholder: 'Contoh: 7A', required: true },
  ],
  columns: [
    { key: 'name', label: 'NAMA' },
    { key: 'grade_name', label: 'TINGKAT' },
    { key: 'student_count', label: 'TERISI' },
    { key: 'is_active', label: 'STATUS', kind: 'status' },
  ],
};

export const GradeManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={grade} writable={writable} />
);
export const SubjectManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={subject} writable={writable} />
);
export const ExtracurricularManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={extracurricular} writable={writable} />
);
export const SemesterManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={semester} writable={writable} />
);
export const ClassroomManager = ({ writable }: { writable: boolean }) => (
  <AcademicEntityManager config={classroom} writable={writable} />
);
