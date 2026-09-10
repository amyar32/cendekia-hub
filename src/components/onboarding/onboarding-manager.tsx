'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DateInput, TimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBooks,
  IconBuilding,
  IconCalendarEvent,
  IconCheck,
  IconChecklist,
  IconClock,
  IconDownload,
  IconFileSpreadsheet,
  IconPlus,
  IconRocket,
  IconSchool,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconUsers,
} from '@tabler/icons-react';
import { ImageUploader } from '@/components/cms/image-uploader/image-uploader';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { publishAcademicContext } from '@/lib/academic-context-client';
import styles from './onboarding-manager.module.css';

type EducationLevel = 'sd' | 'smp' | 'sma';
type Grade = { id?: string; name: string; level_order: number; description: string };
type Subject = { id?: string; code: string; name: string; category: string; description: string };
type Extracurricular = Subject & { is_required: boolean };
type TeachingAssignment = {
  id?: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  semester_id: string;
};
type HomeroomAssignment = { id?: string; teacher_id: string; class_id: string };
type ExtracurricularAssignment = {
  id?: string;
  extracurricular_id: string;
  teacher_id: string;
  semester_id: string;
  location: string;
  quota: number | string;
  status: 'draft' | 'active';
  student_ids: string[];
};
type Semester = {
  id?: string;
  name: string;
  period: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};
type Classroom = { id?: string; grade_id: string; name: string; capacity: number | string };
type Slot = {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  slot_order: number;
  is_break: boolean;
};
type ImportRow = {
  sheet: 'Guru' | 'Murid';
  row: number;
  status: 'valid' | 'warning' | 'error';
  messages: string[];
  data: Record<string, string | number | boolean>;
};
type ReadinessKey =
  | 'profile'
  | 'grades'
  | 'subjects'
  | 'extracurriculars'
  | 'academic_year'
  | 'semesters'
  | 'slots'
  | 'teachers'
  | 'classrooms'
  | 'students'
  | 'schedules'
  | 'teaching_assignments'
  | 'homeroom_assignments'
  | 'extracurricular_assignments';
const readinessOrder: ReadinessKey[] = [
  'profile',
  'grades',
  'subjects',
  'extracurriculars',
  'academic_year',
  'semesters',
  'slots',
  'teachers',
  'classrooms',
  'students',
  'teaching_assignments',
  'homeroom_assignments',
  'extracurricular_assignments',
  'schedules',
];
export type OnboardingData = {
  school: null | Record<string, string | number | null>;
  grades: Array<Grade & { is_active: number }>;
  subjects: Array<Subject & { is_active: number }>;
  extracurriculars: Array<Extracurricular & { is_active: number; is_required: number | boolean }>;
  active_year: null | {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    semesters: Array<Omit<Semester, 'is_active'> & { is_active: number }>;
    classrooms: Array<Classroom & { is_active: number; grade_name: string }>;
  };
  teachers: Array<{ id: string; employee_code: string; name: string }>;
  students: Array<{ id: string; nis: string; name: string; class_name: string }>;
  teaching_assignments: TeachingAssignment[];
  homeroom_assignments: HomeroomAssignment[];
  extracurricular_assignments: ExtracurricularAssignment[];
  slots: Array<Omit<Slot, 'is_break'> & { is_break: number; is_active: number }>;
  weekdays: number[];
  counts: Record<
    | 'teachers'
    | 'students'
    | 'subjects'
    | 'extracurriculars'
    | 'classrooms'
    | 'schedules'
    | 'teaching_assignments'
    | 'homeroom_assignments'
    | 'extracurricular_assignments',
    number
  >;
  readiness: Record<ReadinessKey, boolean>;
};

const levelTemplates: Record<
  EducationLevel,
  { label: string; description: string; names: string[] }
> = {
  sd: {
    label: 'Sekolah Dasar',
    description: 'Enam tingkat, dari Kelas 1 sampai Kelas 6.',
    names: ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'],
  },
  smp: {
    label: 'Sekolah Menengah Pertama',
    description: 'Tiga tingkat: Kelas VII, VIII, dan IX.',
    names: ['Kelas VII', 'Kelas VIII', 'Kelas IX'],
  },
  sma: {
    label: 'Sekolah Menengah Atas',
    description: 'Tiga tingkat: Kelas X, XI, dan XII.',
    names: ['Kelas X', 'Kelas XI', 'Kelas XII'],
  },
};
const weekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
function subjectTemplate(rows: Array<[string, string]>): Subject[] {
  return rows.map(([code, name]) => ({
    code,
    name,
    category: '',
    description: `Pembelajaran ${name} sesuai kurikulum sekolah.`,
  }));
}

const subjectTemplates: Record<EducationLevel, Subject[]> = {
  sd: subjectTemplate([
    ['PAI', 'Pendidikan Agama dan Budi Pekerti'],
    ['PP', 'Pendidikan Pancasila'],
    ['BIN', 'Bahasa Indonesia'],
    ['MAT', 'Matematika'],
    ['IPAS', 'Ilmu Pengetahuan Alam dan Sosial'],
    ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'],
    ['SENI', 'Seni dan Budaya'],
    ['BIG', 'Bahasa Inggris'],
  ]),
  smp: subjectTemplate([
    ['PAI', 'Pendidikan Agama dan Budi Pekerti'],
    ['PP', 'Pendidikan Pancasila'],
    ['BIN', 'Bahasa Indonesia'],
    ['MAT', 'Matematika'],
    ['IPA', 'Ilmu Pengetahuan Alam'],
    ['IPS', 'Ilmu Pengetahuan Sosial'],
    ['BIG', 'Bahasa Inggris'],
    ['INF', 'Informatika'],
    ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'],
    ['SENI', 'Seni Budaya'],
  ]),
  sma: subjectTemplate([
    ['PAI', 'Pendidikan Agama dan Budi Pekerti'],
    ['PP', 'Pendidikan Pancasila'],
    ['BIN', 'Bahasa Indonesia'],
    ['MAT', 'Matematika'],
    ['BIG', 'Bahasa Inggris'],
    ['FIS', 'Fisika'],
    ['KIM', 'Kimia'],
    ['BIO', 'Biologi'],
    ['SEJ', 'Sejarah'],
    ['EKO', 'Ekonomi'],
    ['SOS', 'Sosiologi'],
    ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'],
  ]),
};

const extracurricularTemplate: Extracurricular[] = [
  {
    code: 'PRAMUKA',
    name: 'Pramuka',
    category: 'Kepanduan',
    description: '',
    is_required: true,
  },
  {
    code: 'PMR',
    name: 'Palang Merah Remaja',
    category: 'Sosial',
    description: '',
    is_required: false,
  },
  {
    code: 'PASKIBRA',
    name: 'Paskibra',
    category: 'Kepemimpinan',
    description: '',
    is_required: false,
  },
];

function academicDefaults() {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${startYear}/${startYear + 1}`,
    start_date: `${startYear}-07-01`,
    end_date: `${startYear + 1}-06-30`,
    semesters: [
      {
        name: 'Semester Ganjil',
        period: 1,
        start_date: `${startYear}-07-01`,
        end_date: `${startYear}-12-31`,
        is_active: true,
      },
      {
        name: 'Semester Genap',
        period: 2,
        start_date: `${startYear + 1}-01-01`,
        end_date: `${startYear + 1}-06-30`,
        is_active: false,
      },
    ] as Semester[],
    classrooms: [] as Classroom[],
  };
}

function scheduleTemplate(level: EducationLevel): Slot[] {
  const duration = level === 'sd' ? 35 : level === 'smp' ? 40 : 45;
  let minutes = 7 * 60;
  const result: Slot[] = [];
  for (let index = 1; index <= 7; index += 1) {
    if (index === 4) {
      result.push({
        name: 'Istirahat',
        start_time: toTime(minutes),
        end_time: toTime(minutes + 15),
        slot_order: result.length + 1,
        is_break: true,
      });
      minutes += 15;
    }
    result.push({
      name: `Jam ke-${index}`,
      start_time: toTime(minutes),
      end_time: toTime(minutes + duration),
      slot_order: result.length + 1,
      is_break: false,
    });
    minutes += duration;
  }
  return result;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function onboardingLevel(data: OnboardingData) {
  return (data.school?.education_level as EducationLevel) || 'sma';
}

function onboardingGrades(data: OnboardingData, level: EducationLevel): Grade[] {
  return data.grades.length
    ? data.grades.map(({ id, name, level_order, description }) => ({
        id,
        name,
        level_order,
        description,
      }))
    : levelTemplates[level].names.map((name, index) => ({
        name,
        level_order: index + 1,
        description: `Tingkat ${name.replace('Kelas ', '')}`,
      }));
}

function onboardingAcademic(data: OnboardingData) {
  if (!data.active_year) return academicDefaults();
  return {
    id: data.active_year.id,
    name: data.active_year.name,
    start_date: data.active_year.start_date,
    end_date: data.active_year.end_date,
    semesters: data.active_year.semesters.map((semester) => ({
      ...semester,
      is_active: Boolean(semester.is_active),
    })),
    classrooms: data.active_year.classrooms.map(({ id, grade_id, name, capacity }) => ({
      id,
      grade_id,
      name,
      capacity,
    })),
  };
}

function onboardingStep(data: OnboardingData) {
  const foundations = [
    data.readiness.profile,
    data.readiness.grades,
    data.readiness.subjects && data.readiness.extracurriculars,
    data.readiness.academic_year && data.readiness.semesters && data.readiness.classrooms,
    data.readiness.slots,
    data.readiness.teachers && data.readiness.students,
    data.readiness.teaching_assignments &&
      data.readiness.homeroom_assignments &&
      data.readiness.extracurricular_assignments,
  ];
  const incomplete = foundations.findIndex((ready) => !ready);
  return incomplete === -1 ? 7 : incomplete;
}

function ImportPreviewTable({ rows, sheet }: { rows: ImportRow[]; sheet: ImportRow['sheet'] }) {
  const visibleRows = rows.filter((row) => row.sheet === sheet).slice(0, 100);
  const isStudent = sheet === 'Murid';
  return (
    <>
      <Table.ScrollContainer minWidth={isStudent ? 780 : 680}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Baris</Table.Th>
              <Table.Th>{isStudent ? 'NIS' : 'Kode pegawai'}</Table.Th>
              <Table.Th>Nama</Table.Th>
              {isStudent && <Table.Th>Rombel</Table.Th>}
              <Table.Th>Status</Table.Th>
              <Table.Th>Catatan</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.map((row) => (
              <Table.Tr key={`${row.sheet}-${row.row}`}>
                <Table.Td>{row.row}</Table.Td>
                <Table.Td>
                  {String(isStudent ? row.data.nis || '' : row.data.kode_pegawai || '')}
                </Table.Td>
                <Table.Td>{String(row.data.nama || '')}</Table.Td>
                {isStudent && <Table.Td>{String(row.data.nama_rombel || '')}</Table.Td>}
                <Table.Td>
                  <Badge
                    color={
                      row.status === 'valid' ? 'green' : row.status === 'warning' ? 'orange' : 'red'
                    }
                  >
                    {row.status === 'valid'
                      ? 'Valid'
                      : row.status === 'warning'
                        ? 'Dilewati'
                        : 'Error'}
                  </Badge>
                </Table.Td>
                <Table.Td>{row.messages.join(' ') || 'Siap diimpor'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows.filter((row) => row.sheet === sheet).length > 100 && (
        <Text variant="caption">
          Menampilkan 100 dari {rows.filter((row) => row.sheet === sheet).length} baris.
        </Text>
      )}
    </>
  );
}

export function OnboardingManager({
  writable,
  initialData,
}: {
  writable: boolean;
  initialData: OnboardingData;
}) {
  const selectedLevel = onboardingLevel(initialData);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [active, setActive] = useState(() => onboardingStep(initialData));
  const [saving, setSaving] = useState(false);
  const [level, setLevel] = useState<EducationLevel>(selectedLevel);
  const [profile, setProfile] = useState(() => ({
    name: String(initialData.school?.name || ''),
    code: String(initialData.school?.code || ''),
    npsn: String(initialData.school?.npsn || ''),
    address: String(initialData.school?.address || ''),
    email: String(initialData.school?.email || ''),
    phone: String(initialData.school?.phone || ''),
    logo_url: String(initialData.school?.logo_url || ''),
    principal_name: String(initialData.school?.principal_name || ''),
    principal_nip: String(initialData.school?.principal_nip || ''),
    principal_signature_url: String(initialData.school?.principal_signature_url || ''),
    timezone: String(initialData.school?.timezone || 'Asia/Jakarta'),
    checkin_late_after: String(initialData.school?.checkin_late_after || '07:15'),
  }));
  const [grades, setGrades] = useState<Grade[]>(() => onboardingGrades(initialData, selectedLevel));
  const [subjects, setSubjects] = useState<Subject[]>(() =>
    initialData.subjects.length
      ? initialData.subjects.map(({ id, code, name, category, description }) => ({
          id,
          code,
          name,
          category,
          description,
        }))
      : subjectTemplates[selectedLevel],
  );
  const [extracurriculars, setExtracurriculars] = useState<Extracurricular[]>(() =>
    initialData.extracurriculars.length
      ? initialData.extracurriculars.map(
          ({ id, code, name, category, description, is_required }) => ({
            id,
            code,
            name,
            category,
            description,
            is_required: Boolean(is_required),
          }),
        )
      : extracurricularTemplate,
  );
  const [academic, setAcademic] = useState(() => onboardingAcademic(initialData));
  const [activeDays, setActiveDays] = useState(initialData.weekdays);
  const [slots, setSlots] = useState<Slot[]>(() =>
    initialData.slots.length
      ? initialData.slots.map(({ id, name, start_time, end_time, slot_order, is_break }) => ({
          id,
          name,
          start_time,
          end_time,
          slot_order,
          is_break: Boolean(is_break),
        }))
      : scheduleTemplate(selectedLevel),
  );
  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>(
    initialData.teaching_assignments,
  );
  const [homeroomAssignments, setHomeroomAssignments] = useState<HomeroomAssignment[]>(
    initialData.homeroom_assignments,
  );
  const [extracurricularAssignments, setExtracurricularAssignments] = useState<
    ExtracurricularAssignment[]
  >(initialData.extracurricular_assignments);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSummary, setImportSummary] = useState({ total: 0, valid: 0, warning: 0, error: 0 });
  const [importing, setImporting] = useState(false);

  async function load() {
    try {
      const response = await fetch('/api/modules/onboarding', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      hydrate(result);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal memuat onboarding',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    }
  }

  function hydrate(result: OnboardingData) {
    const school = result.school;
    const selectedLevel = (school?.education_level as EducationLevel) || 'sma';
    setLevel(selectedLevel);
    if (school)
      setProfile({
        name: String(school.name || ''),
        code: String(school.code || ''),
        npsn: String(school.npsn || ''),
        address: String(school.address || ''),
        email: String(school.email || ''),
        phone: String(school.phone || ''),
        logo_url: String(school.logo_url || ''),
        principal_name: String(school.principal_name || ''),
        principal_nip: String(school.principal_nip || ''),
        principal_signature_url: String(school.principal_signature_url || ''),
        timezone: String(school.timezone || 'Asia/Jakarta'),
        checkin_late_after: String(school.checkin_late_after || '07:15'),
      });
    setGrades(
      result.grades.length
        ? result.grades.map(({ id, name, level_order, description }) => ({
            id,
            name,
            level_order,
            description,
          }))
        : levelTemplates[selectedLevel].names.map((name, index) => ({
            name,
            level_order: index + 1,
            description: `Tingkat ${name.replace('Kelas ', '')}`,
          })),
    );
    setSubjects(
      result.subjects.length
        ? result.subjects.map(({ id, code, name, category, description }) => ({
            id,
            code,
            name,
            category,
            description,
          }))
        : subjectTemplates[selectedLevel],
    );
    setExtracurriculars(
      result.extracurriculars.length
        ? result.extracurriculars.map(({ id, code, name, category, description, is_required }) => ({
            id,
            code,
            name,
            category,
            description,
            is_required: Boolean(is_required),
          }))
        : extracurricularTemplate,
    );
    if (result.active_year)
      setAcademic({
        id: result.active_year.id,
        name: result.active_year.name,
        start_date: result.active_year.start_date,
        end_date: result.active_year.end_date,
        semesters: result.active_year.semesters.map((semester) => ({
          ...semester,
          is_active: Boolean(semester.is_active),
        })),
        classrooms: result.active_year.classrooms.map(({ id, grade_id, name, capacity }) => ({
          id,
          grade_id,
          name,
          capacity,
        })),
      } as ReturnType<typeof academicDefaults> & { id: string });
    setActiveDays(result.weekdays);
    setSlots(
      result.slots.length
        ? result.slots.map(({ id, name, start_time, end_time, slot_order, is_break }) => ({
            id,
            name,
            start_time,
            end_time,
            slot_order,
            is_break: Boolean(is_break),
          }))
        : scheduleTemplate(selectedLevel),
    );
    setTeachingAssignments(result.teaching_assignments);
    setHomeroomAssignments(result.homeroom_assignments);
    setExtracurricularAssignments(result.extracurricular_assignments);
  }

  async function saveAction(body: Record<string, unknown>, next?: number) {
    setSaving(true);
    try {
      const response = await fetch('/api/modules/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      hydrate(result);
      if (next !== undefined) setActive(next);
      notifications.show({
        color: 'green',
        title: 'Progres tersimpan',
        message: 'Konfigurasi onboarding berhasil diperbarui.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  function selectLevel(next: EducationLevel) {
    setLevel(next);
    setGrades(
      levelTemplates[next].names.map((name, index) => ({
        name,
        level_order: index + 1,
        description: `${levelTemplates[next].label} tingkat ${index + 1}`,
      })),
    );
    setSlots(scheduleTemplate(next));
    if (!data.subjects.length) setSubjects(subjectTemplates[next]);
  }

  function generateClasses() {
    setAcademic((current) => ({
      ...current,
      classrooms: grades.map((grade) => ({
        grade_id: grade.id || '',
        name: grade.name.replace('Kelas ', ''),
        capacity: level === 'sd' ? 32 : 36,
      })),
    }));
  }

  function addTeachingAssignment() {
    setTeachingAssignments((current) => [
      ...current,
      {
        teacher_id: data.teachers[0]?.id || '',
        subject_id: data.subjects[0]?.id || '',
        class_id: data.active_year?.classrooms[0]?.id || '',
        semester_id: 'all',
      },
    ]);
  }

  function addExtracurricularAssignment() {
    const extracurricular = data.extracurriculars[0];
    setExtracurricularAssignments((current) => [
      ...current,
      {
        extracurricular_id: extracurricular?.id || '',
        teacher_id: data.teachers[0]?.id || '',
        semester_id: 'all',
        location: '',
        quota: 0,
        status: 'active',
        student_ids: extracurricular?.is_required ? data.students.map((student) => student.id) : [],
      },
    ]);
  }

  function addHomeroomAssignment() {
    const assignedClasses = new Set(homeroomAssignments.map((assignment) => assignment.class_id));
    const assignedTeachers = new Set(
      homeroomAssignments.map((assignment) => assignment.teacher_id),
    );
    setHomeroomAssignments((current) => [
      ...current,
      {
        teacher_id:
          data.teachers.find((teacher) => !assignedTeachers.has(teacher.id))?.id ||
          data.teachers[0]?.id ||
          '',
        class_id:
          data.active_year?.classrooms.find((classroom) => !assignedClasses.has(classroom.id || ''))
            ?.id ||
          data.active_year?.classrooms[0]?.id ||
          '',
      },
    ]);
  }

  function continueFromImport() {
    const missing: string[] = [];
    if (!data.teachers.length) missing.push('guru');
    if (!data.counts.students) missing.push('murid');
    if (missing.length) {
      notifications.show({
        color: 'red',
        title: 'Data belum lengkap',
        message: `Tambahkan data ${missing.join(' dan ')} sebelum melanjutkan.`,
      });
      return;
    }
    setActive(6);
  }

  function saveAssignments() {
    const classroomIds = (data.active_year?.classrooms || [])
      .map((classroom) => classroom.id)
      .filter((id): id is string => Boolean(id));
    const assignedClassIds = new Set(
      homeroomAssignments
        .filter((assignment) => assignment.teacher_id && assignment.class_id)
        .map((assignment) => assignment.class_id),
    );
    if (
      assignedClassIds.size !== classroomIds.length ||
      classroomIds.some((id) => !assignedClassIds.has(id))
    ) {
      notifications.show({
        color: 'red',
        title: 'Wali kelas belum lengkap',
        message: 'Setiap rombel wajib memiliki satu wali kelas sebelum melanjutkan.',
      });
      return;
    }
    void saveAction(
      {
        action: 'assignments',
        teaching_assignments: teachingAssignments,
        homeroom_assignments: homeroomAssignments,
        extracurricular_assignments: extracurricularAssignments,
      },
      7,
    );
  }

  async function previewImport(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/modules/onboarding/import', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setImportRows(result.rows);
      setImportSummary(result.summary);
      notifications.show({
        color: result.summary.error ? 'orange' : 'green',
        title: 'Preview selesai',
        message: `${result.summary.total} baris diperiksa; ${result.summary.error} perlu diperbaiki.`,
      });
    } catch (error) {
      setImportRows([]);
      notifications.show({
        color: 'red',
        title: 'Gagal membaca Excel',
        message: error instanceof Error ? error.message : 'File tidak valid.',
      });
    } finally {
      setImporting(false);
    }
  }

  async function commitImport() {
    setImporting(true);
    try {
      const response = await fetch('/api/modules/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', rows: importRows }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setImportRows([]);
      await load();
      notifications.show({
        color: 'green',
        title: 'Import berhasil',
        message: `${result.created.teachers} guru dan ${result.created.students} murid ditambahkan.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Import gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setImporting(false);
    }
  }

  const readiness = useMemo(
    () => readinessOrder.map((key) => [key, data.readiness[key]] as [ReadinessKey, boolean]),
    [data],
  );
  const readinessLabels: Record<ReadinessKey, string> = {
    profile: 'Profil sekolah',
    grades: 'Struktur tingkat',
    subjects: 'Mata pelajaran',
    extracurriculars: 'Ekstrakurikuler',
    academic_year: 'Tahun ajaran aktif',
    semesters: 'Dua semester',
    slots: 'Slot waktu',
    teachers: 'Data guru',
    classrooms: 'Rombel aktif',
    students: 'Data dan penempatan murid',
    schedules: 'Jadwal pelajaran',
    teaching_assignments: 'Penugasan mata pelajaran',
    homeroom_assignments: 'Wali kelas setiap rombel',
    extracurricular_assignments: 'Penugasan ekstrakurikuler',
  };
  const readyCount = readiness.filter(([, ready]) => ready).length;

  return (
    <>
      <PageHeading
        eyebrow="PERSIAPAN WORKSPACE"
        title="Onboarding Sekolah"
        description="Siapkan fondasi akademik, masukkan data awal, dan validasi kesiapan operasional melalui satu alur terpandu."
        action={
          <Badge
            color={data?.school?.onboarding_completed_at ? 'green' : 'orange'}
            leftSection={
              data?.school?.onboarding_completed_at ? (
                <IconCheck size={13} />
              ) : (
                <IconRocket size={13} />
              )
            }
          >
            {data?.school?.onboarding_completed_at
              ? 'Onboarding selesai'
              : `${readyCount}/${readiness.length} siap`}
          </Badge>
        }
      />
      {!writable && (
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} mb="lg">
          Anda dapat melihat progres, tetapi memerlukan izin tulis konfigurasi sekolah, master
          akademik, guru, murid, rombel, jadwal, dan penugasan untuk mengubah onboarding.
        </Alert>
      )}
      <Paper withBorder className={styles.shell}>
        <div className={styles.stepperWrap}>
          <Progress
            value={readiness.length ? (readyCount / readiness.length) * 100 : 0}
            size="xs"
            mb="lg"
          />
          <Stepper
            active={active}
            size="sm"
            allowNextStepsSelect={false}
            classNames={{ steps: styles.stepperSteps, stepBody: styles.stepBody }}
          >
            <Stepper.Step
              label="Sekolah"
              description="Identitas & jenjang"
              icon={<IconSchool size={17} />}
            />
            <Stepper.Step
              label="Tingkat"
              description="Struktur kelas"
              icon={<IconBuilding size={17} />}
            />
            <Stepper.Step
              label="Program"
              description="Mapel & ekskul"
              icon={<IconBooks size={17} />}
            />
            <Stepper.Step
              label="Akademik"
              description="Tahun & rombel"
              icon={<IconCalendarEvent size={17} />}
            />
            <Stepper.Step label="Waktu" description="Hari & jam" icon={<IconClock size={17} />} />
            <Stepper.Step
              label="Import"
              description="Data awal"
              icon={<IconFileSpreadsheet size={17} />}
            />
            <Stepper.Step
              label="Penugasan"
              description="Guru & pembina"
              icon={<IconChecklist size={17} />}
            />
            <Stepper.Step
              label="Kesiapan"
              description="Siap digunakan"
              icon={<IconCheck size={17} />}
            />
          </Stepper>
          <Text className={styles.mobileStep}>Langkah {active + 1} dari 8</Text>
        </div>
        <div className={styles.content}>
          {active === 0 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Identitas dan jenjang sekolah</Title>
                <Text variant="description" mt={5}>
                  Pilihan jenjang menyiapkan struktur tingkat dan durasi jam pelajaran yang masih
                  dapat disesuaikan.
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                {(Object.keys(levelTemplates) as EducationLevel[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={`${styles.levelCard} ${level === key ? styles.levelCardActive : ''}`}
                    onClick={() => writable && selectLevel(key)}
                    disabled={!writable || (data.grades.length > 0 && level !== key)}
                    title={
                      data.grades.length > 0 && level !== key
                        ? 'Jenjang dikunci setelah struktur tingkat disimpan.'
                        : undefined
                    }
                  >
                    <ThemeIcon variant="light" size={42}>
                      <IconSchool size={22} />
                    </ThemeIcon>
                    <Text fw={700}>{key.toUpperCase()}</Text>
                    <Text variant="description">{levelTemplates[key].description}</Text>
                  </button>
                ))}
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Nama sekolah"
                  placeholder="Contoh: SMA Cendekia Utama"
                  required
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.currentTarget.value })}
                  disabled={!writable}
                />
                <TextInput
                  label="Kode sekolah"
                  placeholder="Contoh: SCU"
                  required
                  value={profile.code}
                  onChange={(event) => setProfile({ ...profile, code: event.currentTarget.value })}
                  disabled={!writable}
                />
                <TextInput
                  label="NPSN"
                  placeholder="8 digit NPSN"
                  value={profile.npsn}
                  onChange={(event) => setProfile({ ...profile, npsn: event.currentTarget.value })}
                  maxLength={8}
                  disabled={!writable}
                />
                <Select
                  label="Zona waktu"
                  data={[
                    { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta' },
                    { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar' },
                    { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura' },
                  ]}
                  value={profile.timezone}
                  onChange={(value) => value && setProfile({ ...profile, timezone: value })}
                  allowDeselect={false}
                  disabled={!writable}
                />
                <TextInput
                  label="Email sekolah"
                  type="email"
                  placeholder="admin@sekolah.sch.id"
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.currentTarget.value })}
                  disabled={!writable}
                />
                <TextInput
                  label="Telepon"
                  placeholder="Contoh: 0215550101"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.currentTarget.value })}
                  disabled={!writable}
                />
              </SimpleGrid>
              <Textarea
                label="Alamat lengkap"
                required
                minRows={3}
                value={profile.address}
                onChange={(event) => setProfile({ ...profile, address: event.currentTarget.value })}
                disabled={!writable}
              />
              <ImageUploader
                label="Logo sekolah"
                description="PNG, JPEG, atau WebP. Maksimal 5 MB."
                scope="school.logo"
                value={profile.logo_url}
                onChange={(value) => setProfile({ ...profile, logo_url: value })}
                disabled={!writable}
              />
              <Divider />
              <div>
                <Title order={4}>Informasi kepala sekolah</Title>
                <Text variant="description" mt={5}>
                  Nama, NIP, dan tanda tangan ini akan dicantumkan pada kartu siswa dan guru.
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Nama kepala sekolah"
                  placeholder="Nama lengkap beserta gelar"
                  value={profile.principal_name}
                  onChange={(event) =>
                    setProfile({ ...profile, principal_name: event.currentTarget.value })
                  }
                  maxLength={150}
                  required
                  disabled={!writable}
                />
                <TextInput
                  label="NIP kepala sekolah"
                  placeholder="Opsional"
                  value={profile.principal_nip}
                  onChange={(event) =>
                    setProfile({ ...profile, principal_nip: event.currentTarget.value })
                  }
                  maxLength={50}
                  disabled={!writable}
                />
              </SimpleGrid>
              <ImageUploader
                label="Tanda tangan kepala sekolah"
                description="Disarankan PNG dengan latar transparan. Maksimal 5 MB."
                scope="school.principal-signature"
                value={profile.principal_signature_url}
                onChange={(value) => setProfile({ ...profile, principal_signature_url: value })}
                disabled={!writable}
              />
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                onSave={() =>
                  saveAction({ action: 'profile', education_level: level, ...profile }, 1)
                }
              />
            </Stack>
          )}

          {active === 1 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Struktur tingkat {level.toUpperCase()}</Title>
                <Text variant="description" mt={5}>
                  Urutan ini dipakai untuk kenaikan kelas. Nama dapat disesuaikan, tetapi jumlah
                  tingkat mengikuti jenjang.
                </Text>
              </div>
              <div className={styles.rows}>
                {grades.map((grade, index) => (
                  <Paper withBorder p="md" key={grade.id || index}>
                    <Group align="flex-end" wrap="nowrap">
                      <NumberInput
                        label="Urutan"
                        value={grade.level_order}
                        min={1}
                        max={99}
                        w={90}
                        onChange={(value) =>
                          setGrades((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, level_order: Number(value) } : item,
                            ),
                          )
                        }
                        disabled={!writable}
                      />
                      <TextInput
                        label="Nama tingkat"
                        value={grade.name}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setGrades((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: value } : item,
                            ),
                          );
                        }}
                        className={styles.grow}
                        disabled={!writable}
                      />
                      <TextInput
                        label="Keterangan"
                        value={grade.description}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setGrades((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, description: value } : item,
                            ),
                          );
                        }}
                        className={styles.grow}
                        disabled={!writable}
                      />
                    </Group>
                  </Paper>
                ))}
              </div>
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                onSave={() => saveAction({ action: 'grades', education_level: level, grades }, 2)}
              />
            </Stack>
          )}

          {active === 2 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Mata pelajaran dan ekstrakurikuler</Title>
                <Text variant="description" mt={5}>
                  Template disesuaikan dengan jenjang sekolah. Kode dan nama dapat diubah sebelum
                  disimpan.
                </Text>
              </div>
              <Paper withBorder p="lg">
                <Group mb="md">
                  <div>
                    <Text fw={700}>Mata pelajaran</Text>
                    <Text variant="description">Digunakan untuk penugasan guru dan jadwal.</Text>
                  </div>
                </Group>
                <Stack gap="sm">
                  {subjects.map((subject, index) => (
                    <Paper withBorder p="md" key={subject.id || index}>
                      <Group align="flex-end" wrap="nowrap">
                        <TextInput
                          label="Kode"
                          placeholder="MAT"
                          value={subject.code}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setSubjects((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, code: value } : item,
                              ),
                            );
                          }}
                          w={120}
                          disabled={!writable}
                        />
                        <TextInput
                          label="Nama mata pelajaran"
                          value={subject.name}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setSubjects((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: value } : item,
                              ),
                            );
                          }}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <TextInput
                          label="Deskripsi"
                          placeholder="Keterangan mata pelajaran"
                          value={subject.description}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setSubjects((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, description: value } : item,
                              ),
                            );
                          }}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          aria-label="Hapus mata pelajaran"
                          onClick={() =>
                            setSubjects((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          disabled={!writable || Boolean(subject.id)}
                          title={
                            subject.id
                              ? 'Hapus data tersimpan melalui modul Mata Pelajaran.'
                              : undefined
                          }
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={15} />}
                      onClick={() =>
                        setSubjects((current) => [
                          ...current,
                          { code: '', name: '', category: '', description: '' },
                        ])
                      }
                      disabled={!writable}
                    >
                      Tambah mata pelajaran
                    </Button>
                  </Group>
                </Stack>
              </Paper>
              <Paper withBorder p="lg">
                <Group mb="md">
                  <div>
                    <Text fw={700}>Ekstrakurikuler</Text>
                    <Text variant="description">
                      Pembina, peserta, dan jadwal ditentukan setelah data program tersimpan.
                    </Text>
                  </div>
                </Group>
                <Stack gap="sm">
                  {extracurriculars.map((extracurricular, index) => (
                    <Paper withBorder p="md" key={extracurricular.id || index}>
                      <Group align="flex-end" wrap="nowrap">
                        <TextInput
                          label="Kode"
                          placeholder="PRAMUKA"
                          value={extracurricular.code}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setExtracurriculars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, code: value } : item,
                              ),
                            );
                          }}
                          w={130}
                          disabled={!writable}
                        />
                        <TextInput
                          label="Nama ekstrakurikuler"
                          value={extracurricular.name}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setExtracurriculars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: value } : item,
                              ),
                            );
                          }}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <TextInput
                          label="Kategori"
                          value={extracurricular.category}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setExtracurriculars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, category: value } : item,
                              ),
                            );
                          }}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Checkbox
                          label="Wajib"
                          checked={extracurricular.is_required}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setExtracurriculars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, is_required: checked } : item,
                              ),
                            );
                          }}
                          style={{ alignSelf: 'center' }}
                          disabled={!writable}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          aria-label="Hapus ekstrakurikuler"
                          onClick={() =>
                            setExtracurriculars((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          disabled={!writable || Boolean(extracurricular.id)}
                          title={
                            extracurricular.id
                              ? 'Hapus data tersimpan melalui modul Ekstrakurikuler.'
                              : undefined
                          }
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={15} />}
                      onClick={() =>
                        setExtracurriculars((current) => [
                          ...current,
                          {
                            code: '',
                            name: '',
                            category: '',
                            description: '',
                            is_required: false,
                          },
                        ])
                      }
                      disabled={!writable}
                    >
                      Tambah ekstrakurikuler
                    </Button>
                  </Group>
                </Stack>
              </Paper>
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                onSave={() => saveAction({ action: 'master_data', subjects, extracurriculars }, 3)}
              />
            </Stack>
          )}

          {active === 3 && (
            <Stack gap="xl">
              <Group>
                <div>
                  <Title order={3}>Kalender akademik dan rombel</Title>
                  <Text variant="description" mt={5}>
                    Tahun ajaran dibuat aktif dengan tepat dua semester dan minimal satu rombel.
                  </Text>
                </div>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput
                  label="Nama tahun ajaran"
                  value={academic.name}
                  onChange={(event) =>
                    setAcademic({ ...academic, name: event.currentTarget.value })
                  }
                  disabled={!writable}
                />
                <DateInput
                  label="Mulai"
                  placeholder="Pilih tanggal mulai"
                  value={academic.start_date || null}
                  maxDate={academic.end_date || undefined}
                  onChange={(value) => setAcademic({ ...academic, start_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  popoverProps={{ withinPortal: true }}
                  disabled={!writable}
                />
                <DateInput
                  label="Selesai"
                  placeholder="Pilih tanggal selesai"
                  value={academic.end_date || null}
                  minDate={academic.start_date || undefined}
                  onChange={(value) => setAcademic({ ...academic, end_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  popoverProps={{ withinPortal: true }}
                  disabled={!writable}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                {academic.semesters.map((semester, index) => (
                  <Paper withBorder p="lg" key={semester.id || semester.period}>
                    <Group justify="space-between" mb="md">
                      <Text fw={700}>{semester.name}</Text>
                      <Checkbox
                        label="Aktif"
                        checked={semester.is_active}
                        onChange={() =>
                          setAcademic((current) => ({
                            ...current,
                            semesters: current.semesters.map((item, itemIndex) => ({
                              ...item,
                              is_active: itemIndex === index,
                            })),
                          }))
                        }
                        disabled={!writable}
                      />
                    </Group>
                    <SimpleGrid cols={2}>
                      <DateInput
                        label="Mulai"
                        placeholder="Pilih tanggal mulai"
                        value={semester.start_date || null}
                        maxDate={semester.end_date || undefined}
                        onChange={(value) => {
                          setAcademic((current) => ({
                            ...current,
                            semesters: current.semesters.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, start_date: value || '' } : item,
                            ),
                          }));
                        }}
                        valueFormat="D MMMM YYYY"
                        locale="id"
                        popoverProps={{ withinPortal: true }}
                        disabled={!writable}
                      />
                      <DateInput
                        label="Selesai"
                        placeholder="Pilih tanggal selesai"
                        value={semester.end_date || null}
                        minDate={semester.start_date || undefined}
                        onChange={(value) => {
                          setAcademic((current) => ({
                            ...current,
                            semesters: current.semesters.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, end_date: value || '' } : item,
                            ),
                          }));
                        }}
                        valueFormat="D MMMM YYYY"
                        locale="id"
                        popoverProps={{ withinPortal: true }}
                        disabled={!writable}
                      />
                    </SimpleGrid>
                  </Paper>
                ))}
              </SimpleGrid>
              <Stack gap="sm">
                <Text fw={700} size="sm">
                  Rombel awal
                </Text>
                {academic.classrooms.map((classroom, index) => (
                  <Paper withBorder p="md" key={classroom.id || index}>
                    <Group align="flex-end" wrap="nowrap">
                      <Select
                        label="Tingkat"
                        data={grades
                          .map((grade) => ({ value: grade.id || '', label: grade.name }))
                          .filter((item) => item.value)}
                        value={classroom.grade_id}
                        onChange={(value) =>
                          setAcademic((current) => ({
                            ...current,
                            classrooms: current.classrooms.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, grade_id: value || '' } : item,
                            ),
                          }))
                        }
                        className={styles.grow}
                        disabled={!writable}
                      />
                      <TextInput
                        label="Nama rombel"
                        placeholder="Contoh: X A"
                        value={classroom.name}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setAcademic((current) => ({
                            ...current,
                            classrooms: current.classrooms.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: value } : item,
                            ),
                          }));
                        }}
                        className={styles.grow}
                        disabled={!writable}
                      />
                      <NumberInput
                        label="Kapasitas"
                        min={0}
                        max={1000}
                        value={classroom.capacity}
                        onChange={(value) =>
                          setAcademic((current) => ({
                            ...current,
                            classrooms: current.classrooms.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, capacity: value } : item,
                            ),
                          }))
                        }
                        w={120}
                        disabled={!writable}
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        aria-label="Hapus rombel"
                        onClick={() =>
                          setAcademic((current) => ({
                            ...current,
                            classrooms: current.classrooms.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                        disabled={!writable}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Group>
                  </Paper>
                ))}
                <Group justify="flex-end" mt="xs">
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={15} />}
                    onClick={generateClasses}
                    disabled={!writable || grades.some((grade) => !grade.id)}
                  >
                    Buat rombel dari tingkat
                  </Button>
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={15} />}
                    onClick={() =>
                      setAcademic((current) => ({
                        ...current,
                        classrooms: [
                          ...current.classrooms,
                          {
                            grade_id: grades[0]?.id || '',
                            name: '',
                            capacity: level === 'sd' ? 32 : 36,
                          },
                        ],
                      }))
                    }
                    disabled={!writable || !grades[0]?.id}
                  >
                    Tambah rombel
                  </Button>
                </Group>
              </Stack>
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                onSave={() => saveAction({ action: 'academic', year: academic }, 4)}
              />
            </Stack>
          )}

          {active === 4 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Hari aktif dan slot waktu</Title>
                <Text variant="description" mt={5}>
                  Hari ini menjadi batas penempatan jadwal. Slot istirahat tidak dapat diisi
                  pelajaran.
                </Text>
              </div>
              <TimePicker
                label="Batas keterlambatan"
                description="Kehadiran setelah waktu ini akan ditandai terlambat."
                value={profile.checkin_late_after}
                onChange={(value) => setProfile({ ...profile, checkin_late_after: value })}
                format="24h"
                withDropdown
                minutesStep={5}
                hoursInputLabel="Jam batas keterlambatan"
                minutesInputLabel="Menit batas keterlambatan"
                required
                disabled={!writable}
              />
              <div className={styles.weekdays}>
                {weekdays.map((day, index) => (
                  <button
                    type="button"
                    key={day}
                    className={`${styles.dayCard} ${activeDays.includes(index + 1) ? styles.dayCardActive : ''}`}
                    onClick={() =>
                      writable &&
                      setActiveDays((current) =>
                        current.includes(index + 1)
                          ? current.filter((value) => value !== index + 1)
                          : [...current, index + 1].sort(),
                      )
                    }
                    disabled={!writable}
                  >
                    <Text fw={700} size="sm">
                      {day}
                    </Text>
                    <Text variant="caption">
                      {activeDays.includes(index + 1) ? 'Aktif' : 'Libur'}
                    </Text>
                  </button>
                ))}
              </div>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700} size="sm">
                    Susunan jam
                  </Text>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<IconPlus size={14} />}
                    onClick={() =>
                      setSlots((current) => [
                        ...current,
                        {
                          name: `Jam ke-${current.filter((item) => !item.is_break).length + 1}`,
                          start_time: '12:00',
                          end_time: '12:45',
                          slot_order: current.length + 1,
                          is_break: false,
                        },
                      ])
                    }
                    disabled={!writable}
                  >
                    Tambah slot
                  </Button>
                </Group>
                {slots.map((slot, index) => (
                  <Paper withBorder p="md" key={slot.id || index}>
                    <Group align="flex-end" wrap="nowrap">
                      <NumberInput
                        label="Urutan"
                        value={slot.slot_order}
                        w={90}
                        onChange={(value) =>
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, slot_order: Number(value) } : item,
                            ),
                          )
                        }
                        disabled={!writable}
                      />
                      <TextInput
                        label="Nama"
                        value={slot.name}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: value } : item,
                            ),
                          );
                        }}
                        className={styles.grow}
                        disabled={!writable}
                      />
                      <TimePicker
                        label="Mulai"
                        value={slot.start_time}
                        onChange={(value) =>
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, start_time: value } : item,
                            ),
                          )
                        }
                        format="24h"
                        withDropdown
                        minutesStep={5}
                        hoursInputLabel={`Jam mulai ${slot.name}`}
                        minutesInputLabel={`Menit mulai ${slot.name}`}
                        disabled={!writable}
                      />
                      <TimePicker
                        label="Selesai"
                        value={slot.end_time}
                        onChange={(value) =>
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, end_time: value } : item,
                            ),
                          )
                        }
                        format="24h"
                        withDropdown
                        minutesStep={5}
                        hoursInputLabel={`Jam selesai ${slot.name}`}
                        minutesInputLabel={`Menit selesai ${slot.name}`}
                        disabled={!writable}
                      />
                      <Checkbox
                        label="Istirahat"
                        checked={slot.is_break}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, is_break: checked } : item,
                            ),
                          );
                        }}
                        style={{ alignSelf: 'center' }}
                        disabled={!writable}
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        aria-label="Hapus slot"
                        onClick={() =>
                          setSlots((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        disabled={!writable}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                onSave={() =>
                  saveAction(
                    {
                      action: 'schedule',
                      checkin_late_after: profile.checkin_late_after,
                      weekdays: activeDays,
                      slots,
                    },
                    5,
                  )
                }
              />
            </Stack>
          )}

          {active === 5 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Import data awal dari Excel</Title>
                <Text variant="description" mt={5}>
                  Gunakan satu workbook untuk guru dan murid. Penempatan kelas menggunakan rombel
                  yang sudah dibuat pada langkah sebelumnya. Preview tidak mengubah database.
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Paper withBorder p="lg" className={styles.importCard}>
                  <ThemeIcon size={46} variant="light">
                    <IconDownload size={23} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700}>Template kosong</Text>
                    <Text variant="description">
                      Isi data sekolah sendiri sesuai petunjuk di workbook.
                    </Text>
                  </div>
                  <Button
                    component="a"
                    href={`/api/modules/onboarding/import?level=${level}`}
                    variant="light"
                  >
                    Unduh template
                  </Button>
                </Paper>
                <Paper withBorder p="lg" className={styles.importCard}>
                  <ThemeIcon size={46} variant="light" color="grape">
                    <IconUsers size={23} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700}>Data simulasi {level.toUpperCase()}</Text>
                    <Text variant="description">
                      Berisi 15 guru dan 50 murid yang ditempatkan ke rombel aktif.
                    </Text>
                  </div>
                  <Button
                    component="a"
                    href={`/api/modules/onboarding/import?level=${level}&simulation=1`}
                    variant="light"
                    color="grape"
                  >
                    Unduh simulasi
                  </Button>
                </Paper>
              </SimpleGrid>
              <Paper withBorder p="xl" className={styles.dropzone}>
                <IconFileSpreadsheet size={36} />
                <Stack gap={4} align="center">
                  <Text fw={700}>Pilih workbook untuk diperiksa</Text>
                  <Text variant="description">
                    Format .xlsx, maksimal 5 MB. Data belum disimpan pada tahap preview.
                  </Text>
                </Stack>
                <FileButton
                  onChange={previewImport}
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                >
                  {(props) => (
                    <Button
                      {...props}
                      leftSection={<IconUpload size={17} />}
                      loading={importing}
                      disabled={!writable}
                    >
                      Pilih file Excel
                    </Button>
                  )}
                </FileButton>
              </Paper>
              <Alert color="blue" icon={<IconUsers size={18} />}>
                Import guru menambahkan profil guru, tetapi tidak membuat akun login. Setelah
                import, buat atau tautkan akun melalui modul Guru sebelum uji coba bersama.
              </Alert>
              {importRows.length > 0 && (
                <>
                  <SimpleGrid cols={{ base: 2, sm: 4 }}>
                    {(
                      [
                        ['Total', importSummary.total, 'gray'],
                        ['Valid', importSummary.valid, 'green'],
                        ['Dilewati', importSummary.warning, 'orange'],
                        ['Error', importSummary.error, 'red'],
                      ] as const
                    ).map(([label, count, color]) => (
                      <Paper withBorder p="md" key={label}>
                        <Text variant="caption">{label}</Text>
                        <Text fw={700} fz={24} c={color}>
                          {count}
                        </Text>
                      </Paper>
                    ))}
                  </SimpleGrid>
                  <Tabs defaultValue="students" keepMounted={false}>
                    <Tabs.List mb="md">
                      <Tabs.Tab value="students">
                        Murid ({importRows.filter((row) => row.sheet === 'Murid').length})
                      </Tabs.Tab>
                      <Tabs.Tab value="teachers">
                        Guru ({importRows.filter((row) => row.sheet === 'Guru').length})
                      </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="students">
                      <ImportPreviewTable rows={importRows} sheet="Murid" />
                    </Tabs.Panel>
                    <Tabs.Panel value="teachers">
                      <ImportPreviewTable rows={importRows} sheet="Guru" />
                    </Tabs.Panel>
                  </Tabs>
                  <Group justify="flex-end">
                    <Button
                      onClick={commitImport}
                      loading={importing}
                      disabled={importSummary.error > 0}
                    >
                      Import {importSummary.valid} baris valid
                    </Button>
                  </Group>
                </>
              )}
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={writable}
                nextOnly
                onSave={continueFromImport}
              />
            </Stack>
          )}

          {active === 6 && (
            <Stack gap="xl">
              <div>
                <Title order={3}>Penugasan guru dan pembina</Title>
                <Text variant="description" mt={5}>
                  Hubungkan guru dengan mata pelajaran, rombel, dan program ekstrakurikuler pada
                  tahun ajaran aktif.
                </Text>
              </div>
              {(!data.teachers.length || !data.active_year?.classrooms.length) && (
                <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                  Import minimal satu guru dan pastikan rombel aktif tersedia sebelum membuat
                  penugasan.
                </Alert>
              )}
              <Paper withBorder p="lg">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={700}>Penugasan mata pelajaran</Text>
                    <Text variant="description">
                      Satu baris menetapkan satu guru, mata pelajaran, rombel, dan periode.
                    </Text>
                  </div>
                </Group>
                <Stack gap="sm">
                  {teachingAssignments.map((assignment, index) => (
                    <Paper withBorder p="md" key={assignment.id || index}>
                      <Group align="flex-end" wrap="nowrap">
                        <Select
                          label="Guru"
                          data={data.teachers.map((teacher) => ({
                            value: teacher.id,
                            label: `${teacher.name} — ${teacher.employee_code}`,
                          }))}
                          value={assignment.teacher_id}
                          onChange={(value) =>
                            setTeachingAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, teacher_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Mata pelajaran"
                          data={data.subjects.map((subject) => ({
                            value: subject.id!,
                            label: `${subject.code} — ${subject.name}`,
                          }))}
                          value={assignment.subject_id}
                          onChange={(value) =>
                            setTeachingAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, subject_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Rombel"
                          data={(data.active_year?.classrooms || []).map((classroom) => ({
                            value: classroom.id!,
                            label: `${classroom.grade_name} · ${classroom.name}`,
                          }))}
                          value={assignment.class_id}
                          onChange={(value) =>
                            setTeachingAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, class_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Periode"
                          data={[
                            { value: 'all', label: 'Semua Semester' },
                            ...(data.active_year?.semesters || []).map((semester) => ({
                              value: semester.id!,
                              label: semester.name,
                            })),
                          ]}
                          value={assignment.semester_id}
                          onChange={(value) =>
                            setTeachingAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, semester_id: value || 'all' }
                                  : item,
                              ),
                            )
                          }
                          allowDeselect={false}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          aria-label="Hapus penugasan mata pelajaran"
                          onClick={() =>
                            setTeachingAssignments((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          disabled={!writable || Boolean(assignment.id)}
                          title={
                            assignment.id
                              ? 'Hapus penugasan tersimpan melalui modul Penugasan Mapel.'
                              : undefined
                          }
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                  {!teachingAssignments.length && (
                    <Text variant="description">Belum ada penugasan mata pelajaran.</Text>
                  )}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={15} />}
                      onClick={addTeachingAssignment}
                      disabled={
                        !writable ||
                        !data.teachers.length ||
                        !data.subjects.length ||
                        !data.active_year?.classrooms.length
                      }
                    >
                      Tambah penugasan
                    </Button>
                  </Group>
                </Stack>
              </Paper>
              <Paper withBorder p="lg">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={700}>Wali kelas</Text>
                    <Text variant="description">
                      Tetapkan satu wali untuk setiap rombel pada tahun ajaran aktif.
                    </Text>
                  </div>
                  <Badge
                    variant="light"
                    color={
                      homeroomAssignments.length >= (data.active_year?.classrooms.length || 0)
                        ? 'green'
                        : 'orange'
                    }
                  >
                    {homeroomAssignments.length}/{data.active_year?.classrooms.length || 0} rombel
                  </Badge>
                </Group>
                <Stack gap="sm">
                  {homeroomAssignments.map((assignment, index) => (
                    <Paper withBorder p="md" key={assignment.id || index}>
                      <Group align="flex-end" wrap="nowrap">
                        <Select
                          label="Wali kelas"
                          data={data.teachers.map((teacher) => ({
                            value: teacher.id,
                            label: `${teacher.name} — ${teacher.employee_code}`,
                          }))}
                          value={assignment.teacher_id}
                          onChange={(value) =>
                            setHomeroomAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, teacher_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Rombel"
                          data={(data.active_year?.classrooms || []).map((classroom) => ({
                            value: classroom.id!,
                            label: `${classroom.grade_name} · ${classroom.name}`,
                          }))}
                          value={assignment.class_id}
                          onChange={(value) =>
                            setHomeroomAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, class_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          aria-label="Hapus wali kelas"
                          onClick={() =>
                            setHomeroomAssignments((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          disabled={!writable || Boolean(assignment.id)}
                          title={
                            assignment.id
                              ? 'Hapus penugasan tersimpan melalui modul Wali Kelas.'
                              : undefined
                          }
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                  {!homeroomAssignments.length && (
                    <Text variant="description">Belum ada wali kelas yang ditetapkan.</Text>
                  )}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={15} />}
                      onClick={addHomeroomAssignment}
                      disabled={
                        !writable ||
                        !data.teachers.length ||
                        !data.active_year?.classrooms.length ||
                        homeroomAssignments.length >= data.active_year.classrooms.length
                      }
                    >
                      Tambah wali kelas
                    </Button>
                  </Group>
                </Stack>
              </Paper>
              <Paper withBorder p="lg">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={700}>Penugasan ekstrakurikuler</Text>
                    <Text variant="description">
                      Tetapkan pembina, periode, peserta, lokasi, kuota, dan status awal program.
                    </Text>
                  </div>
                </Group>
                <Stack gap="sm">
                  {extracurricularAssignments.map((assignment, index) => (
                    <Paper withBorder p="md" key={assignment.id || index}>
                      <Group align="flex-end" wrap="nowrap">
                        <Select
                          label="Ekstrakurikuler"
                          data={data.extracurriculars.map((extracurricular) => ({
                            value: extracurricular.id!,
                            label: `${extracurricular.code} — ${extracurricular.name}`,
                          }))}
                          value={assignment.extracurricular_id}
                          onChange={(value) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      extracurricular_id: value || '',
                                      student_ids: data.extracurriculars.find(
                                        (extracurricular) => extracurricular.id === value,
                                      )?.is_required
                                        ? data.students.map((student) => student.id)
                                        : [],
                                    }
                                  : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Pembina"
                          data={data.teachers.map((teacher) => ({
                            value: teacher.id,
                            label: `${teacher.name} — ${teacher.employee_code}`,
                          }))}
                          value={assignment.teacher_id}
                          onChange={(value) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, teacher_id: value || '' } : item,
                              ),
                            )
                          }
                          searchable
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <Select
                          label="Periode"
                          data={[
                            { value: 'all', label: 'Semua Semester' },
                            ...(data.active_year?.semesters || []).map((semester) => ({
                              value: semester.id!,
                              label: semester.name,
                            })),
                          ]}
                          value={assignment.semester_id}
                          onChange={(value) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, semester_id: value || 'all' }
                                  : item,
                              ),
                            )
                          }
                          allowDeselect={false}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <TextInput
                          label="Lokasi"
                          placeholder="Lapangan sekolah"
                          value={assignment.location}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, location: value } : item,
                              ),
                            );
                          }}
                          className={styles.grow}
                          disabled={!writable}
                        />
                        <NumberInput
                          label="Kuota"
                          value={assignment.quota}
                          min={0}
                          max={1000}
                          onChange={(value) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, quota: value } : item,
                              ),
                            )
                          }
                          w={100}
                          disabled={!writable}
                        />
                        <Select
                          label="Status"
                          data={[
                            { value: 'draft', label: 'Draft' },
                            { value: 'active', label: 'Aktif' },
                          ]}
                          value={assignment.status}
                          onChange={(value) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      status: (value || 'active') as 'draft' | 'active',
                                    }
                                  : item,
                              ),
                            )
                          }
                          allowDeselect={false}
                          w={120}
                          disabled={!writable}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          aria-label="Hapus penugasan ekstrakurikuler"
                          onClick={() =>
                            setExtracurricularAssignments((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          disabled={!writable || Boolean(assignment.id)}
                          title={
                            assignment.id
                              ? 'Hapus penugasan tersimpan melalui modul Penugasan Ekstrakurikuler.'
                              : undefined
                          }
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                      {data.extracurriculars.find(
                        (extracurricular) => extracurricular.id === assignment.extracurricular_id,
                      )?.is_required ? (
                        <Alert color="blue" icon={<IconUsers size={18} />} mt="md">
                          Ekstrakurikuler wajib otomatis mencakup seluruh {data.students.length}{' '}
                          murid aktif. Peserta tidak perlu dipilih manual.
                        </Alert>
                      ) : (
                        <MultiSelect
                          label="Murid/peserta"
                          placeholder="Pilih murid peserta ekstrakurikuler"
                          description={`${assignment.student_ids.length} peserta dipilih${Number(assignment.quota) > 0 ? ` dari kuota ${assignment.quota}` : ''}.`}
                          data={data.students.map((student) => ({
                            value: student.id,
                            label: `${student.name} — ${student.nis} · ${student.class_name}`,
                          }))}
                          value={assignment.student_ids}
                          onChange={(student_ids) =>
                            setExtracurricularAssignments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, student_ids } : item,
                              ),
                            )
                          }
                          searchable
                          clearable
                          mt="md"
                          disabled={!writable}
                        />
                      )}
                    </Paper>
                  ))}
                  {!extracurricularAssignments.length && (
                    <Text variant="description">Belum ada penugasan ekstrakurikuler.</Text>
                  )}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={15} />}
                      onClick={addExtracurricularAssignment}
                      disabled={!writable || !data.teachers.length || !data.extracurriculars.length}
                    >
                      Tambah penugasan
                    </Button>
                  </Group>
                </Stack>
              </Paper>
              <WizardActions
                active={active}
                setActive={setActive}
                saving={saving}
                writable={
                  writable &&
                  Boolean(data.teachers.length) &&
                  Boolean(data.active_year?.classrooms.length)
                }
                onSave={saveAssignments}
              />
            </Stack>
          )}

          {active === 7 && (
            <Stack gap="xl">
              <Paper withBorder className={styles.readinessHero}>
                <div className={styles.readinessGlow} />
                <Group justify="space-between" align="flex-start" className={styles.readinessTop}>
                  <Group wrap="nowrap" align="flex-start">
                    <ThemeIcon
                      size={54}
                      radius="xl"
                      variant="white"
                      color={readyCount === readiness.length ? 'green' : 'blue'}
                      className={styles.readinessHeroIcon}
                    >
                      {readyCount === readiness.length ? (
                        <IconCheck size={28} />
                      ) : (
                        <IconSparkles size={27} />
                      )}
                    </ThemeIcon>
                    <div>
                      <Badge variant="white" color="dark" mb="sm">
                        Tahap akhir onboarding
                      </Badge>
                      <Title order={2} className={styles.readinessTitle}>
                        {readyCount === readiness.length
                          ? 'Sekolah siap digunakan'
                          : 'Sedikit lagi menuju siap operasional'}
                      </Title>
                      <Text className={styles.readinessDescription} mt={6}>
                        {readyCount === readiness.length
                          ? 'Seluruh fondasi sekolah sudah terhubung dan siap dipakai oleh tim.'
                          : `${readiness.length - readyCount} komponen masih perlu dilengkapi sebelum onboarding ditutup.`}
                      </Text>
                    </div>
                  </Group>
                  <div className={styles.readinessScore}>
                    <Text fw={800} fz={28} lh={1}>
                      {Math.round((readyCount / readiness.length) * 100)}%
                    </Text>
                    <Text size="xs" mt={5}>
                      kesiapan
                    </Text>
                  </div>
                </Group>
                <Progress
                  value={(readyCount / readiness.length) * 100}
                  size="md"
                  radius="xl"
                  color={readyCount === readiness.length ? 'green' : 'blue'}
                  className={styles.readinessProgress}
                />
              </Paper>

              <div>
                <Text fw={700} mb="sm">
                  Ringkasan data sekolah
                </Text>
                <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
                  {Object.entries(data.counts).map(([key, count]) => (
                    <Paper withBorder className={styles.countItem} key={key}>
                      <Text fw={800} fz={25} className={styles.countValue}>
                        {count}
                      </Text>
                      <Text variant="caption">
                        {
                          {
                            teachers: 'Guru',
                            students: 'Murid',
                            subjects: 'Mata pelajaran',
                            extracurriculars: 'Ekstrakurikuler',
                            classrooms: 'Rombel',
                            schedules: 'Jadwal',
                            teaching_assignments: 'Penugasan mapel',
                            homeroom_assignments: 'Wali kelas',
                            extracurricular_assignments: 'Penugasan ekskul',
                          }[key]
                        }
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </div>

              <Paper withBorder p="lg" className={styles.readinessPanel}>
                <Group justify="space-between" mb="lg">
                  <div>
                    <Text fw={700}>Checklist kesiapan</Text>
                    <Text variant="description">
                      Periksa fondasi yang akan dipakai sehari-hari.
                    </Text>
                  </div>
                  <Badge
                    size="lg"
                    variant="light"
                    color={readyCount === readiness.length ? 'green' : 'orange'}
                  >
                    {readyCount}/{readiness.length} siap
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                  {readiness.map(([key, ready]) => (
                    <div
                      key={key}
                      className={`${styles.readinessItem} ${ready ? styles.readinessItemReady : ''}`}
                    >
                      <ThemeIcon
                        size={34}
                        radius="xl"
                        color={ready ? 'green' : 'gray'}
                        variant={ready ? 'light' : 'default'}
                      >
                        {ready ? <IconCheck size={17} /> : <IconClock size={17} />}
                      </ThemeIcon>
                      <div className={styles.readinessItemText}>
                        <Text size="sm" fw={650}>
                          {readinessLabels[key]}
                        </Text>
                        <Text variant="caption">{ready ? 'Sudah siap' : 'Perlu dilengkapi'}</Text>
                      </div>
                      {!ready && readinessLink(key) && (
                        <Button
                          component={Link}
                          href={readinessLink(key)!}
                          variant="subtle"
                          size="compact-xs"
                          ml="auto"
                        >
                          Buka
                        </Button>
                      )}
                    </div>
                  ))}
                </SimpleGrid>
              </Paper>
              {readyCount === readiness.length ? (
                <Alert color="green" icon={<IconCheck size={18} />}>
                  Seluruh komponen sistem siap. Onboarding dapat diselesaikan.
                </Alert>
              ) : (
                <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                  Masih ada konfigurasi yang perlu diselesaikan. Gunakan checklist di atas untuk
                  melanjutkan.
                </Alert>
              )}
              <Group justify="space-between" className={styles.actions}>
                <Button
                  variant="default"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={() => setActive(6)}
                >
                  Kembali
                </Button>
                <Group>
                  <Button component={Link} href="/" variant="light">
                    Ke ringkasan
                  </Button>
                  <Button
                    leftSection={<IconCheck size={16} />}
                    onClick={async () => {
                      await saveAction({ action: 'complete' });
                      publishAcademicContext({
                        academic_year: data?.active_year?.name || null,
                        semester:
                          data?.active_year?.semesters.find((semester) => semester.is_active)
                            ?.name || null,
                      });
                    }}
                    loading={saving}
                    disabled={!writable || readyCount !== readiness.length}
                  >
                    Selesaikan onboarding
                  </Button>
                </Group>
              </Group>
            </Stack>
          )}
        </div>
      </Paper>
    </>
  );
}

function readinessLink(key: ReadinessKey) {
  if (key === 'subjects') return '/master-data/subjects';
  if (key === 'extracurriculars') return '/master-data/extracurriculars';
  if (key === 'teachers') return '/master-data/teachers';
  if (key === 'students') return '/master-data/students';
  if (key === 'schedules') return '/schedules';
  if (key === 'teaching_assignments') return '/academic/teaching-assignments';
  if (key === 'homeroom_assignments') return '/academic/homeroom-assignments';
  if (key === 'extracurricular_assignments') return '/academic/extracurricular-assignments';
  if (key === 'classrooms') return '/academic/classes';
  return null;
}

function WizardActions({
  active,
  setActive,
  saving,
  writable,
  onSave,
  nextOnly = false,
}: {
  active: number;
  setActive: (value: number) => void;
  saving: boolean;
  writable: boolean;
  onSave: () => void;
  nextOnly?: boolean;
}) {
  return (
    <Group justify="space-between" className={styles.actions}>
      {active > 0 ? (
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => setActive(active - 1)}
        >
          Kembali
        </Button>
      ) : (
        <Box />
      )}
      {nextOnly ? (
        <Button rightSection={<IconArrowRight size={16} />} onClick={onSave}>
          Lanjutkan
        </Button>
      ) : (
        <Button
          rightSection={<IconArrowRight size={16} />}
          onClick={onSave}
          loading={saving}
          disabled={!writable}
        >
          Simpan & lanjutkan
        </Button>
      )}
    </Group>
  );
}
