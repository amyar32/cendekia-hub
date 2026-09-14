'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  LoadingOverlay,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { DateInput, TimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArchive,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconCopy,
  IconDownload,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSparkles,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './exam-schedule-manager.module.css';

type Option = { value: string; label: string };
type StudentOption = Option & { class_id: string; class_name: string };
type Period = {
  id: string;
  academic_year_id: string;
  semester_id: string;
  academic_year_name: string;
  semester_name: string;
  name: string;
  exam_type: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'published' | 'completed' | 'archived';
  regular_schedule_policy: string;
  max_exams_per_class_per_day: number;
  max_supervisions_per_teacher_per_day: number;
  supervisors_per_room: number;
  minimum_break_minutes: number;
  allow_self_supervision: number;
  enforce_room_capacity: number;
  allow_warning_override: number;
  version: number;
  entry_count: number;
};
type Session = {
  id: string;
  exam_date: string;
  name: string;
  start_time: string;
  end_time: string;
  session_order: number;
};
type Room = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  room_type: string;
  location: string;
  facilities: string;
  is_active: number;
};
type Entry = {
  id: string;
  exam_session_id: string;
  subject_id: string;
  room_id: string;
  assessment_type: string;
  duration_minutes: number;
  notes: string;
  exam_date: string;
  session_name: string;
  start_time: string;
  end_time: string;
  subject_name: string;
  room_name: string;
  class_names: string;
  class_ids: string;
  participant_mode: 'class' | 'student';
  student_ids: string;
  supervisor_names: string;
  supervisor_ids: string;
  lead_supervisor_id: string;
  participant_count: number;
  capacity: number;
};
type Conflict = { code: string; severity: 'error' | 'warning'; message: string; entry_id?: string };
type Unavailability = {
  id: string;
  resource_type: 'teacher' | 'room';
  resource_name: string;
  exam_date: string;
  exam_session_id: string | null;
  session_name: string | null;
  reason: string;
};
type Version = {
  id: string;
  version: number;
  notes: string;
  published_at: string;
  published_by_name: string;
};
type SchoolInfo = {
  name: string;
  code: string;
  npsn: string;
  address: string;
  email: string;
  phone: string;
  logo_url: string;
  principal_name: string;
  principal_nip: string;
  principal_signature_url: string;
};
type Data = {
  periods: Period[];
  selected_period_id: string;
  sessions: Session[];
  entries: Entry[];
  rooms: Room[];
  conflicts: Conflict[];
  unavailabilities: Unavailability[];
  versions: Version[];
  options: {
    academic_year_id: Option[];
    semester_id: Option[];
    class_id: Option[];
    subject_id: Option[];
    teacher_id: Option[];
    student_id: StudentOption[];
  };
  access: { write: boolean; publish: boolean; report: boolean; own_only: boolean };
  school: SchoolInfo;
};

const periodDefaults = {
  academic_year_id: '',
  semester_id: '',
  name: '',
  exam_type: 'midterm',
  start_date: '',
  end_date: '',
  regular_schedule_policy: 'suspend_participating_classes',
  max_exams_per_class_per_day: 2,
  max_supervisions_per_teacher_per_day: 2,
  supervisors_per_room: 2,
  minimum_break_minutes: 15,
  allow_self_supervision: false,
  enforce_room_capacity: true,
  allow_warning_override: true,
};
const sessionDefaults = {
  exam_date: '',
  name: 'Sesi 1',
  start_time: '07:30',
  end_time: '09:00',
  session_order: 1,
};
const sessionPatternDefaults = [
  { name: 'Sesi 1', start_time: '07:30', end_time: '09:00', session_order: 1 },
  { name: 'Sesi 2', start_time: '09:30', end_time: '11:00', session_order: 2 },
];
const roomDefaults = {
  code: '',
  name: '',
  capacity: 30,
  room_type: 'classroom',
  location: '',
  facilities: '',
  is_active: true,
};
const entryDefaults = {
  exam_session_id: '',
  subject_id: '',
  room_id: '',
  participant_mode: 'class' as 'class' | 'student',
  class_ids: [] as string[],
  student_ids: [] as string[],
  supervisor_ids: [] as string[],
  lead_supervisor_id: '',
  assessment_type: 'written',
  duration_minutes: 90,
  notes: '',
};
const unavailableDefaults = {
  resource_type: 'teacher' as 'teacher' | 'room',
  resource_id: '',
  exam_date: '',
  exam_session_id: '',
  reason: '',
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
  return result;
}

function splitIds(value?: string) {
  return value ? value.split(',').filter(Boolean) : [];
}
function statusColor(status: Period['status']) {
  return status === 'published'
    ? 'green'
    : status === 'completed'
      ? 'blue'
      : status === 'archived'
        ? 'gray'
        : 'orange';
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

async function loadPdfImage(url?: string) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const format = blob.type.includes('jpeg')
      ? 'JPEG'
      : blob.type.includes('png')
        ? 'PNG'
        : blob.type.includes('webp')
          ? 'WEBP'
          : null;
    if (!format) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

function datesInRange(start: string, end: string) {
  if (!start || !end) return [];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function hexToPdfColor(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function ExamScheduleManager() {
  const mantineTheme = useMantineTheme();
  const pdfTableColors = useMemo(
    () => ({
      border: hexToPdfColor(mantineTheme.other.appColors.border),
      header: hexToPdfColor(mantineTheme.other.appColors.brandStrong),
      headerText: hexToPdfColor(mantineTheme.other.appColors.surface),
      stripe: hexToPdfColor(mantineTheme.other.appColors.subtle),
    }),
    [mantineTheme],
  );
  const [data, setData] = useState<Data | null>(null);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [periodModal, setPeriodModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [periodForm, setPeriodForm] = useState(periodDefaults);
  const [sessionModal, setSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [sessionForm, setSessionForm] = useState(sessionDefaults);
  const [patternModal, setPatternModal] = useState(false);
  const [patternDates, setPatternDates] = useState<string[]>([]);
  const [patternSessions, setPatternSessions] = useState(sessionPatternDefaults);
  const [roomModal, setRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState(roomDefaults);
  const [entryModal, setEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryForm, setEntryForm] = useState(entryDefaults);
  const [unavailableModal, setUnavailableModal] = useState(false);
  const [unavailableForm, setUnavailableForm] = useState(unavailableDefaults);
  const [publishModal, setPublishModal] = useState(false);
  const [publishNotes, setPublishNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [copyModal, setCopyModal] = useState(false);
  const [copyForm, setCopyForm] = useState({
    academic_year_id: '',
    semester_id: '',
    name: '',
    start_date: '',
    end_date: '',
  });

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (periodId) params.set('period_id', periodId);
    requestJson(`/api/modules/exam-schedules?${params}`, { signal: controller.signal })
      .then((result: Data) => {
        setData(result);
        setPeriodId(result.selected_period_id);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        notifications.show({
          color: 'red',
          title: 'Jadwal ujian gagal dimuat',
          message: error.message,
        });
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [periodId, revision]);

  const period = data?.periods.find((item) => item.id === periodId) || null;
  const editable = !!data?.access.write && period?.status === 'draft';
  const warnings = data?.conflicts.filter((item) => item.severity === 'warning').length || 0;
  const errors = data?.conflicts.filter((item) => item.severity === 'error').length || 0;
  const sortedEntries = useMemo(() => data?.entries || [], [data?.entries]);
  const calendarDates = useMemo(
    () => [...new Set((data?.sessions || []).map((item) => item.exam_date))].sort(),
    [data?.sessions],
  );
  const sessionOrders = useMemo(
    () =>
      [...new Set((data?.sessions || []).map((item) => item.session_order))].sort(
        (left, right) => left - right,
      ),
    [data?.sessions],
  );
  const sessionMap = useMemo(
    () =>
      new Map(
        (data?.sessions || []).map((item) => [`${item.exam_date}:${item.session_order}`, item]),
      ),
    [data?.sessions],
  );
  const entriesBySession = useMemo(() => {
    const result = new Map<string, Entry[]>();
    for (const entry of sortedEntries) {
      const entries = result.get(entry.exam_session_id) || [];
      entries.push(entry);
      result.set(entry.exam_session_id, entries);
    }
    return result;
  }, [sortedEntries]);
  const availablePatternDates = useMemo(
    () => datesInRange(period?.start_date || '', period?.end_date || ''),
    [period?.end_date, period?.start_date],
  );
  const unavailableStudentIds = useMemo(() => {
    const unavailable = new Set<string>();
    for (const entry of data?.entries || []) {
      if (entry.id === editingEntry?.id || entry.exam_session_id !== entryForm.exam_session_id)
        continue;
      for (const studentId of splitIds(entry.student_ids)) unavailable.add(studentId);
      if (entry.participant_mode === 'class') {
        const assignedClasses = splitIds(entry.class_ids);
        for (const student of data?.options.student_id || [])
          if (assignedClasses.includes(student.class_id)) unavailable.add(student.value);
      }
    }
    return unavailable;
  }, [data?.entries, data?.options, editingEntry?.id, entryForm.exam_session_id]);

  async function mutate(
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    success: string,
  ) {
    setSaving(true);
    try {
      await requestJson('/api/modules/exam-schedules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      notifications.show({
        color: 'green',
        title: success,
        message: 'Perubahan tersimpan dan dicatat pada audit trail.',
      });
      reload();
      return true;
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Perubahan gagal',
        message: error instanceof Error ? error.message : 'Permintaan gagal.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openPeriod(item?: Period) {
    setEditingPeriod(item || null);
    setPeriodForm(
      item
        ? {
            academic_year_id: item.academic_year_id,
            semester_id: item.semester_id,
            name: item.name,
            exam_type: item.exam_type,
            start_date: item.start_date,
            end_date: item.end_date,
            regular_schedule_policy: item.regular_schedule_policy,
            max_exams_per_class_per_day: item.max_exams_per_class_per_day,
            max_supervisions_per_teacher_per_day: item.max_supervisions_per_teacher_per_day,
            supervisors_per_room: item.supervisors_per_room,
            minimum_break_minutes: item.minimum_break_minutes,
            allow_self_supervision: !!item.allow_self_supervision,
            enforce_room_capacity: !!item.enforce_room_capacity,
            allow_warning_override: !!item.allow_warning_override,
          }
        : {
            ...periodDefaults,
            academic_year_id: data?.options.academic_year_id[0]?.value || '',
            semester_id: data?.options.semester_id[0]?.value || '',
          },
    );
    setPeriodModal(true);
  }

  async function savePeriod() {
    const ok = await mutate(
      editingPeriod ? 'PATCH' : 'POST',
      { action: 'period', id: editingPeriod?.id, ...periodForm },
      editingPeriod ? 'Periode diperbarui' : 'Periode dibuat',
    );
    if (ok) setPeriodModal(false);
  }

  function openSession(item?: Session) {
    setEditingSession(item || null);
    setSessionForm(
      item
        ? {
            exam_date: item.exam_date,
            name: item.name,
            start_time: item.start_time,
            end_time: item.end_time,
            session_order: item.session_order,
          }
        : {
            ...sessionDefaults,
            exam_date: period?.start_date || '',
            session_order: (data?.sessions.length || 0) + 1,
          },
    );
    setSessionModal(true);
  }

  async function saveSession() {
    const ok = await mutate(
      editingSession ? 'PATCH' : 'POST',
      {
        action: 'session',
        id: editingSession?.id,
        exam_period_id: periodId,
        ...sessionForm,
      },
      editingSession ? 'Sesi diperbarui' : 'Sesi ditambahkan',
    );
    if (ok) setSessionModal(false);
  }

  function openSessionPattern() {
    const existingDates = [...new Set((data?.sessions || []).map((item) => item.exam_date))];
    const referenceDate = existingDates[0];
    const referenceSessions = (data?.sessions || [])
      .filter((item) => item.exam_date === referenceDate)
      .sort((left, right) => left.session_order - right.session_order)
      .map(({ name, start_time, end_time, session_order }) => ({
        name,
        start_time,
        end_time,
        session_order,
      }));
    setPatternSessions(referenceSessions.length ? referenceSessions : sessionPatternDefaults);
    setPatternDates(
      existingDates.length
        ? existingDates
        : availablePatternDates.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0),
    );
    setPatternModal(true);
  }

  async function saveSessionPattern() {
    const ok = await mutate(
      'POST',
      {
        action: 'session-pattern',
        exam_period_id: periodId,
        dates: patternDates,
        sessions: patternSessions,
      },
      'Pola sesi diterapkan',
    );
    if (ok) setPatternModal(false);
  }

  function openRoom(item?: Room) {
    setEditingRoom(item || null);
    let facilities = '';
    if (item) {
      try {
        facilities = (JSON.parse(item.facilities) as string[]).join(', ');
      } catch {
        facilities = '';
      }
    }
    setRoomForm(
      item
        ? {
            code: item.code,
            name: item.name,
            capacity: item.capacity,
            room_type: item.room_type,
            location: item.location,
            facilities,
            is_active: !!item.is_active,
          }
        : roomDefaults,
    );
    setRoomModal(true);
  }

  async function saveRoom() {
    const ok = await mutate(
      editingRoom ? 'PATCH' : 'POST',
      {
        action: 'room',
        id: editingRoom?.id,
        ...roomForm,
        facilities: roomForm.facilities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      editingRoom ? 'Ruangan diperbarui' : 'Ruangan dibuat',
    );
    if (ok) setRoomModal(false);
  }

  function openEntry(item?: Entry, sessionId?: string) {
    setEditingEntry(item || null);
    setEntryForm(
      item
        ? {
            exam_session_id: item.exam_session_id,
            subject_id: item.subject_id,
            room_id: item.room_id,
            participant_mode: item.participant_mode || 'class',
            class_ids: splitIds(item.class_ids),
            student_ids: splitIds(item.student_ids),
            supervisor_ids: splitIds(item.supervisor_ids),
            lead_supervisor_id: item.lead_supervisor_id || '',
            assessment_type: item.assessment_type,
            duration_minutes: item.duration_minutes,
            notes: item.notes,
          }
        : {
            ...entryDefaults,
            exam_session_id: sessionId || data?.sessions[0]?.id || '',
            room_id: data?.rooms.find((room) => room.is_active)?.id || '',
          },
    );
    setEntryModal(true);
  }

  function randomizeEntryStudents() {
    const room = data?.rooms.find((item) => item.id === entryForm.room_id);
    if (!room) {
      notifications.show({
        color: 'orange',
        title: 'Pilih ruangan',
        message: 'Pilih ruangan sebelum mengacak peserta.',
      });
      return;
    }
    if (!entryForm.class_ids.length) {
      notifications.show({
        color: 'orange',
        title: 'Pilih rombel sumber',
        message: 'Pilih minimal satu rombel yang akan dicampur.',
      });
      return;
    }
    const candidates = (data?.options.student_id || []).filter(
      (student) =>
        entryForm.class_ids.includes(student.class_id) && !unavailableStudentIds.has(student.value),
    );
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    const studentIds = candidates.slice(0, room.capacity).map((student) => student.value);
    setEntryForm((current) => ({ ...current, student_ids: studentIds }));
    notifications.show({
      color: studentIds.length ? 'green' : 'orange',
      title: 'Peserta diacak',
      message: `${studentIds.length} murid dipilih dari ${candidates.length} murid yang belum ditempatkan pada sesi ini.`,
    });
  }

  async function saveEntry() {
    const ok = await mutate(
      editingEntry ? 'PATCH' : 'POST',
      { action: 'entry', id: editingEntry?.id, exam_period_id: periodId, ...entryForm },
      editingEntry ? 'Jadwal diperbarui' : 'Jadwal ditambahkan',
    );
    if (ok) setEntryModal(false);
  }

  async function publish() {
    const ok = await mutate(
      'PATCH',
      { action: 'publish', id: periodId, notes: publishNotes, override_reason: overrideReason },
      'Jadwal dipublikasikan',
    );
    if (ok) setPublishModal(false);
  }

  async function exportExcel() {
    if (!period || !data) return;
    setSaving(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Jadwal Ujian');
      sheet.addRow([period.name]);
      sheet.addRow([
        `${period.academic_year_name} · ${period.semester_name} · ${period.start_date} s.d. ${period.end_date}`,
      ]);
      sheet.addRow([]);
      sheet.addRow([
        'Tanggal',
        'Sesi',
        'Waktu',
        'Mata Pelajaran',
        'Rombel',
        'Ruang',
        'Peserta',
        'Pengawas',
        'Jenis',
        'Durasi',
        'Catatan',
      ]);
      for (const item of sortedEntries)
        sheet.addRow([
          item.exam_date,
          item.session_name,
          `${item.start_time}–${item.end_time}`,
          item.subject_name,
          item.class_names,
          item.room_name,
          item.participant_count,
          item.supervisor_names || '',
          item.assessment_type,
          item.duration_minutes,
          item.notes,
        ]);
      sheet.columns = [13, 14, 16, 24, 18, 18, 10, 28, 14, 10, 28].map((width) => ({ width }));
      sheet.getRow(4).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      link.download = `jadwal-ujian-${period.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Export gagal',
        message: error instanceof Error ? error.message : 'Gagal membuat Excel.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!period || !data) return;
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      notifications.show({
        color: 'orange',
        title: 'Pratinjau PDF diblokir',
        message: 'Izinkan pop-up untuk situs ini, lalu coba kembali.',
      });
      return;
    }
    previewWindow.document.title = 'Menyiapkan jadwal ujian...';
    setSaving(true);
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const autoTable = autoTableModule.default;
      const [logo, principalSignature] = await Promise.all([
        loadPdfImage(data.school.logo_url),
        loadPdfImage(data.school.principal_signature_url),
      ]);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const drawHeader = () => {
        if (logo) pdf.addImage(logo.data, logo.format, 14, 7, 18, 18);
        pdf.setTextColor(24, 35, 52);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.text(data.school.name.toUpperCase(), pageWidth / 2, 11, {
          align: 'center',
          maxWidth: pageWidth - 90,
        });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.text(data.school.address || 'Alamat sekolah belum dilengkapi', pageWidth / 2, 17, {
          align: 'center',
          maxWidth: 210,
        });
        const contacts = [
          data.school.npsn ? `NPSN ${data.school.npsn}` : '',
          data.school.phone,
          data.school.email,
        ].filter(Boolean);
        pdf.text(contacts.join('  |  '), pageWidth / 2, 22, {
          align: 'center',
          maxWidth: pageWidth - 90,
        });
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.7);
        pdf.line(14, 28, pageWidth - 14, 28);
        pdf.setLineWidth(0.2);
        pdf.line(14, 30, pageWidth - 14, 30);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.text('JADWAL UJIAN', pageWidth / 2, 37, { align: 'center' });
        pdf.setFontSize(10);
        pdf.text(period.name, pageWidth / 2, 43, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.text(
          `${period.academic_year_name} · ${period.semester_name} · ${formatLongDate(period.start_date)} s.d. ${formatLongDate(period.end_date)}`,
          pageWidth / 2,
          48,
          { align: 'center' },
        );
      };
      autoTable(pdf, {
        startY: 54,
        head: [['Tanggal', 'Sesi/Waktu', 'Mapel', 'Rombel', 'Ruang', 'Peserta', 'Pengawas']],
        body: sortedEntries.map((item) => [
          formatLongDate(item.exam_date),
          `${item.session_name}\n${item.start_time}–${item.end_time}`,
          item.subject_name,
          item.class_names,
          item.room_name,
          String(item.participant_count),
          item.supervisor_names || '—',
        ]),
        margin: { top: 54, right: 14, bottom: 18, left: 14 },
        styles: { fontSize: 8, cellPadding: 2.6, lineColor: pdfTableColors.border, lineWidth: 0.1 },
        headStyles: {
          fillColor: pdfTableColors.header,
          textColor: pdfTableColors.headerText,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: pdfTableColors.stripe },
        columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 30 }, 5: { halign: 'center' } },
        didDrawPage: drawHeader,
      });
      const finalY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      let signatureY = finalY + 12;
      if (signatureY > 165) {
        pdf.addPage();
        drawHeader();
        signatureY = 65;
      }
      const signatureX = pageWidth - 62;
      pdf.setFontSize(9);
      pdf.text('Mengetahui,', signatureX, signatureY, { align: 'center' });
      pdf.text('Kepala Sekolah', signatureX, signatureY + 5, { align: 'center' });
      if (principalSignature)
        pdf.addImage(
          principalSignature.data,
          principalSignature.format,
          signatureX - 13,
          signatureY + 7,
          26,
          14,
        );
      pdf.setFont('helvetica', 'bold');
      pdf.text(data.school.principal_name || '(Belum ditentukan)', signatureX, signatureY + 25, {
        align: 'center',
      });
      pdf.setFont('helvetica', 'normal');
      pdf.text(`NIP. ${data.school.principal_nip || '—'}`, signatureX, signatureY + 30, {
        align: 'center',
      });
      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFontSize(7.5);
        pdf.setTextColor(100);
        pdf.text(
          `Dicetak ${new Date().toLocaleString('id-ID')} · Halaman ${page} dari ${pageCount}`,
          14,
          202,
        );
      }
      const previewUrl = URL.createObjectURL(pdf.output('blob'));
      previewWindow.location.replace(previewUrl);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
    } catch (error) {
      previewWindow.close();
      notifications.show({
        color: 'red',
        title: 'Export gagal',
        message: error instanceof Error ? error.message : 'Gagal membuat PDF.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function exportEntryDocuments(item: Entry) {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      notifications.show({
        color: 'orange',
        title: 'Pratinjau PDF diblokir',
        message: 'Izinkan pop-up untuk situs ini, lalu coba kembali.',
      });
      return;
    }
    previewWindow.document.title = 'Menyiapkan dokumen ujian...';
    setSaving(true);
    try {
      const payload = (await requestJson(`/api/modules/exam-schedules?entry_id=${item.id}`)) as {
        entry: Entry & {
          period_name: string;
          academic_year_name: string;
          semester_name: string;
        };
        students: Array<{ nis: string; name: string; class_name: string }>;
        school: SchoolInfo;
      };
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const autoTable = autoTableModule.default;
      const [logo, principalSignature] = await Promise.all([
        loadPdfImage(payload.school.logo_url),
        loadPdfImage(payload.school.principal_signature_url),
      ]);
      const header = (title: string) => {
        const schoolTextCenter = 113;
        if (logo) pdf.addImage(logo.data, logo.format, 15, 7, 18, 18);
        pdf.setTextColor(24, 35, 52);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text(payload.school.name.toUpperCase(), schoolTextCenter, 12, {
          align: 'center',
          maxWidth: 150,
        });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(
          payload.school.address || 'Alamat sekolah belum dilengkapi',
          schoolTextCenter,
          17,
          {
            align: 'center',
            maxWidth: 150,
          },
        );
        pdf.text(
          [
            payload.school.npsn ? `NPSN ${payload.school.npsn}` : '',
            payload.school.phone,
            payload.school.email,
          ]
            .filter(Boolean)
            .join('  |  '),
          schoolTextCenter,
          22,
          { align: 'center' },
        );
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.6);
        pdf.line(14, 29, 196, 29);
        pdf.setLineWidth(0.2);
        pdf.line(14, 31, 196, 31);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(title, 105, 38, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.text(
          `${payload.entry.period_name} · ${payload.entry.academic_year_name} · ${payload.entry.semester_name}`,
          105,
          43,
          { align: 'center' },
        );
      };
      header('DAFTAR HADIR PESERTA UJIAN');
      autoTable(pdf, {
        startY: 49,
        body: [
          [
            'Hari/Tanggal',
            formatLongDate(payload.entry.exam_date),
            'Sesi',
            payload.entry.session_name,
          ],
          [
            'Mata Pelajaran',
            payload.entry.subject_name,
            'Waktu',
            `${payload.entry.start_time}–${payload.entry.end_time}`,
          ],
          [
            'Rombel',
            payload.entry.class_names || 'Lintas rombel',
            'Ruang',
            payload.entry.room_name,
          ],
        ],
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 1.4 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 27 },
          2: { fontStyle: 'bold', cellWidth: 18 },
        },
      });
      const metadataY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY;
      autoTable(pdf, {
        startY: metadataY + 4,
        head: [['No.', 'NIS', 'Nama peserta', 'Rombel', 'Tanda tangan']],
        body: payload.students.map((student, index) => [
          String(index + 1),
          student.nis,
          student.name,
          student.class_name,
          '',
        ]),
        margin: { top: 49, right: 14, bottom: 18, left: 14 },
        styles: {
          fontSize: 8,
          minCellHeight: 8,
          cellPadding: 2,
          lineColor: pdfTableColors.border,
          lineWidth: 0.1,
        },
        headStyles: { fillColor: pdfTableColors.header, textColor: pdfTableColors.headerText },
        alternateRowStyles: { fillColor: pdfTableColors.stripe },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { cellWidth: 25 },
          3: { cellWidth: 25 },
          4: { cellWidth: 38 },
        },
        didDrawPage: () => header('DAFTAR HADIR PESERTA UJIAN'),
      });
      pdf.addPage();
      header('BERITA ACARA PELAKSANAAN UJIAN');
      pdf.setFontSize(10);
      const lines = [
        `Pada ${formatLongDate(payload.entry.exam_date)}, telah dilaksanakan ${payload.entry.period_name}.`,
        `Mata pelajaran : ${payload.entry.subject_name}`,
        `Rombel          : ${payload.entry.class_names}`,
        `Ruang           : ${payload.entry.room_name}`,
        `Waktu           : ${payload.entry.start_time}–${payload.entry.end_time}`,
        `Jumlah peserta  : ${payload.students.length}`,
        `Hadir           : __________     Tidak hadir: __________`,
        '',
        'Catatan pelaksanaan:',
        '________________________________________________________________________________',
        '________________________________________________________________________________',
      ];
      lines.forEach((line, index) => pdf.text(line, 18, 52 + index * 8));
      pdf.text('Pengawas Ujian,', 48, 162, { align: 'center' });
      pdf.text('Mengetahui, Kepala Sekolah', 158, 162, { align: 'center' });
      if (principalSignature)
        pdf.addImage(principalSignature.data, principalSignature.format, 145, 166, 26, 14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(payload.entry.supervisor_names || '(____________________)', 48, 188, {
        align: 'center',
        maxWidth: 70,
      });
      pdf.text(payload.school.principal_name || '(____________________)', 158, 188, {
        align: 'center',
      });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text(`NIP. ${payload.school.principal_nip || '—'}`, 158, 193, { align: 'center' });
      pdf.addPage();
      header('LEMBAR PENGAWASAN UJIAN');
      pdf.setFontSize(9);
      pdf.text(`Pengawas: ${payload.entry.supervisor_names || 'Belum ditentukan'}`, 14, 49);
      pdf.text(
        `${formatLongDate(payload.entry.exam_date)} · ${payload.entry.start_time}–${payload.entry.end_time} · ${payload.entry.room_name}`,
        14,
        55,
      );
      autoTable(pdf, {
        startY: 61,
        head: [['No.', 'Waktu', 'Catatan pengawasan/kejadian', 'Tindak lanjut']],
        body: Array.from({ length: 9 }, (_, index) => [String(index + 1), '', '', '']),
        styles: {
          minCellHeight: 15,
          fontSize: 8.5,
          lineColor: pdfTableColors.border,
          lineWidth: 0.1,
        },
        headStyles: { fillColor: pdfTableColors.header, textColor: pdfTableColors.headerText },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          3: { cellWidth: 42 },
        },
      });
      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFontSize(7.5);
        pdf.setTextColor(100);
        pdf.text(
          `Dokumen ujian · ${payload.entry.subject_name} · Halaman ${page} dari ${pageCount}`,
          14,
          286,
        );
      }
      const previewUrl = URL.createObjectURL(pdf.output('blob'));
      previewWindow.location.replace(previewUrl);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
    } catch (error) {
      previewWindow.close();
      notifications.show({
        color: 'red',
        title: 'Dokumen gagal dibuat',
        message: error instanceof Error ? error.message : 'Gagal membuat dokumen ujian.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <LoadingOverlay visible={loading || saving} />
      <PageHeading
        eyebrow="Akademik"
        title="Jadwal Ujian"
        description="Periode UTS, UAS, sesi, ruang, peserta, pengawas, konflik, dan publikasi dalam satu modul."
      />
      <Group justify="space-between" mb="lg" className={styles.noPrint}>
        <Select
          label="Periode ujian"
          placeholder="Belum ada periode"
          data={
            data?.periods.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.academic_year_name}`,
            })) || []
          }
          value={periodId}
          onChange={(value) => value && setPeriodId(value)}
          w={{ base: '100%', sm: 360 }}
        />
        <Group align="end">
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={reload}>
            Muat ulang
          </Button>
          {data?.access.write ? (
            <Button leftSection={<IconPlus size={16} />} onClick={() => openPeriod()}>
              Periode baru
            </Button>
          ) : null}
        </Group>
      </Group>

      {!period ? (
        <Alert color="blue">Buat periode ujian pertama untuk mulai menyusun jadwal.</Alert>
      ) : (
        <>
          <Paper withBorder p="lg" mb="lg" className={styles.card}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Group gap="sm">
                  <Title order={2}>{period.name}</Title>
                  <Badge color={statusColor(period.status)}>{period.status}</Badge>
                  {period.version ? <Badge variant="outline">Versi {period.version}</Badge> : null}
                </Group>
                <Text c="dimmed" mt={4}>
                  {period.academic_year_name} · {period.semester_name} · {period.start_date}–
                  {period.end_date}
                </Text>
              </div>
              <Group className={styles.noPrint}>
                {data?.access.report ? (
                  <>
                    <Button
                      variant="light"
                      leftSection={<IconDownload size={16} />}
                      onClick={exportExcel}
                    >
                      Excel
                    </Button>
                    <Button
                      variant="light"
                      leftSection={<IconDownload size={16} />}
                      onClick={exportPdf}
                    >
                      PDF
                    </Button>
                  </>
                ) : null}
                {editable ? (
                  <Button
                    variant="light"
                    leftSection={<IconPencil size={16} />}
                    onClick={() => openPeriod(period)}
                  >
                    Pengaturan
                  </Button>
                ) : null}
                {data?.access.write && period.status === 'published' ? (
                  <Button
                    variant="light"
                    onClick={() =>
                      mutate('PATCH', { action: 'revise', id: period.id }, 'Draft revisi dibuat')
                    }
                  >
                    Buat revisi
                  </Button>
                ) : null}
                {data?.access.publish && period.status === 'draft' ? (
                  <Button
                    color="green"
                    leftSection={<IconCheck size={16} />}
                    onClick={() => setPublishModal(true)}
                  >
                    Publikasikan
                  </Button>
                ) : null}
                {data?.access.write && period.status === 'published' ? (
                  <Button
                    variant="light"
                    onClick={() =>
                      mutate(
                        'PATCH',
                        { action: 'status', id: period.id, status: 'completed' },
                        'Periode diselesaikan',
                      )
                    }
                  >
                    Selesaikan
                  </Button>
                ) : null}
                {data?.access.write && ['published', 'completed'].includes(period.status) ? (
                  <Button
                    variant="subtle"
                    color="gray"
                    leftSection={<IconArchive size={16} />}
                    onClick={() =>
                      mutate(
                        'PATCH',
                        { action: 'status', id: period.id, status: 'archived' },
                        'Periode diarsipkan',
                      )
                    }
                  >
                    Arsipkan
                  </Button>
                ) : null}
              </Group>
            </Group>
          </Paper>

          {errors || warnings ? (
            <Alert color={errors ? 'red' : 'orange'} icon={<IconAlertTriangle size={18} />} mb="lg">
              {errors} konflik kritis dan {warnings} peringatan ditemukan. Konflik kritis memblokir
              publikasi; peringatan memerlukan alasan override.
            </Alert>
          ) : (
            <Alert color="green" icon={<IconCheck size={18} />} mb="lg">
              Tidak ada konflik jadwal.
            </Alert>
          )}

          <Tabs defaultValue="schedule">
            <Tabs.List className={styles.noPrint}>
              <Tabs.Tab value="schedule">Jadwal</Tabs.Tab>
              <Tabs.Tab value="sessions">Sesi</Tabs.Tab>
              <Tabs.Tab value="rooms">Ruangan</Tabs.Tab>
              <Tabs.Tab value="availability">Ketidaktersediaan</Tabs.Tab>
              <Tabs.Tab value="conflicts">Konflik ({errors + warnings})</Tabs.Tab>
              <Tabs.Tab value="versions">Versi</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="schedule" pt="lg">
              <Group justify="space-between" mb="md" className={styles.noPrint}>
                <Text fw={700}>{sortedEntries.length} penempatan ujian</Text>
                {editable ? (
                  <Group>
                    <Button
                      variant="light"
                      leftSection={<IconSparkles size={16} />}
                      onClick={() =>
                        mutate(
                          'POST',
                          { action: 'generate', exam_period_id: period.id },
                          'Penyusunan otomatis selesai',
                        )
                      }
                    >
                      Susun dari penugasan
                    </Button>
                    <Button leftSection={<IconPlus size={16} />} onClick={() => openEntry()}>
                      Tambah jadwal
                    </Button>
                  </Group>
                ) : null}
              </Group>
              {!calendarDates.length ? (
                <Paper withBorder className={styles.emptyCalendar}>
                  Belum ada sesi ujian. Tambahkan sesi terlebih dahulu untuk menyusun jadwal.
                </Paper>
              ) : (
                <Paper withBorder className={styles.calendarScroll}>
                  <div
                    className={styles.calendarGrid}
                    style={{
                      gridTemplateColumns: `145px repeat(${calendarDates.length}, minmax(220px, 1fr))`,
                    }}
                  >
                    <div className={`${styles.calendarHeader} ${styles.sessionHeader}`}>SESI</div>
                    {calendarDates.map((date) => (
                      <div className={styles.calendarHeader} key={date}>
                        <Text fw={700} size="xs" tt="uppercase">
                          {formatCalendarDate(date)}
                        </Text>
                        <Text variant="caption">{date}</Text>
                      </div>
                    ))}
                    {sessionOrders.map((order) => {
                      const rowSessions = (data?.sessions || []).filter(
                        (item) => item.session_order === order,
                      );
                      const names = [...new Set(rowSessions.map((item) => item.name))];
                      const times = [
                        ...new Set(
                          rowSessions.map((item) => `${item.start_time}–${item.end_time}`),
                        ),
                      ];
                      return [
                        <div className={styles.sessionCell} key={`session-${order}`}>
                          <Text fw={700} size="xs">
                            {names.length === 1 ? names[0] : `Sesi ${order}`}
                          </Text>
                          {times.length === 1 ? <Text variant="caption">{times[0]}</Text> : null}
                        </div>,
                        ...calendarDates.map((date) => {
                          const session = sessionMap.get(`${date}:${order}`);
                          const entries = session ? entriesBySession.get(session.id) || [] : [];
                          return (
                            <div
                              className={`${styles.calendarCell} ${!session ? styles.unavailableCell : ''}`}
                              key={`${date}-${order}`}
                            >
                              {session ? (
                                <>
                                  <div className={styles.cellSessionMeta}>
                                    <Text size="xs" fw={600}>
                                      {formatCalendarDate(date)} · {session.name}
                                    </Text>
                                    <Text variant="caption">
                                      {session.start_time}–{session.end_time}
                                    </Text>
                                  </div>
                                  <Stack gap="xs">
                                    {entries.map((item) => (
                                      <div className={styles.examCard} key={item.id}>
                                        <Text fw={700} size="xs" lineClamp={2}>
                                          {item.subject_name}
                                        </Text>
                                        <Text variant="caption" lineClamp={2}>
                                          {item.class_names} · {item.room_name}
                                        </Text>
                                        <Text variant="caption" lineClamp={1}>
                                          {item.supervisor_names || 'Pengawas belum ditentukan'}
                                        </Text>
                                        <Group gap={4} mt={7} className={styles.noPrint}>
                                          {data?.access.report ? (
                                            <Button
                                              size="compact-xs"
                                              variant="light"
                                              onClick={() => exportEntryDocuments(item)}
                                            >
                                              PDF
                                            </Button>
                                          ) : null}
                                          {editable ? (
                                            <>
                                              <Button
                                                size="compact-xs"
                                                variant="subtle"
                                                onClick={() => openEntry(item)}
                                              >
                                                Edit
                                              </Button>
                                              <Button
                                                size="compact-xs"
                                                variant="subtle"
                                                color="red"
                                                onClick={() =>
                                                  mutate(
                                                    'DELETE',
                                                    { resource: 'entry', id: item.id },
                                                    'Jadwal dihapus',
                                                  )
                                                }
                                              >
                                                Hapus
                                              </Button>
                                            </>
                                          ) : null}
                                        </Group>
                                      </div>
                                    ))}
                                    {!entries.length ? (
                                      <Text variant="caption" className={styles.emptyCellText}>
                                        Belum ada ujian
                                      </Text>
                                    ) : null}
                                  </Stack>
                                  {editable ? (
                                    <Button
                                      className={`${styles.addCellButton} ${styles.noPrint}`}
                                      size="compact-xs"
                                      variant="subtle"
                                      leftSection={<IconPlus size={13} />}
                                      onClick={() => openEntry(undefined, session.id)}
                                    >
                                      Tambah ujian
                                    </Button>
                                  ) : null}
                                </>
                              ) : (
                                <Text variant="caption">Tidak ada sesi</Text>
                              )}
                            </div>
                          );
                        }),
                      ];
                    })}
                  </div>
                </Paper>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="sessions" pt="lg">
              <Paper withBorder p="md" mb="lg" className={styles.sessionIntro}>
                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={700}>Pola sesi harian</Text>
                    <Text size="sm" c="dimmed">
                      Pilih hari ujian dan terapkan susunan jam yang sama sekaligus.
                    </Text>
                  </div>
                  {editable ? (
                    <Button leftSection={<IconSparkles size={16} />} onClick={openSessionPattern}>
                      Atur pola sesi
                    </Button>
                  ) : null}
                </Group>
              </Paper>
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={700}>Jadwal sesi per tanggal</Text>
                  <Text size="sm" c="dimmed">
                    Periksa jam dan keterisian ujian, atau buat pengecualian untuk tanggal tertentu.
                  </Text>
                </div>
                {editable ? (
                  <Button leftSection={<IconPlus size={16} />} onClick={() => openSession()}>
                    Tambah sesi khusus
                  </Button>
                ) : null}
              </Group>
              <Stack gap="sm">
                {calendarDates.map((date) => {
                  const dateSessions = (data?.sessions || [])
                    .filter((item) => item.exam_date === date)
                    .sort((left, right) => left.session_order - right.session_order);
                  const examCount = dateSessions.reduce(
                    (total, session) => total + (entriesBySession.get(session.id)?.length || 0),
                    0,
                  );
                  return (
                    <Paper key={date} withBorder className={styles.sessionDateCard}>
                      <Group className={styles.sessionDateHeader} justify="space-between">
                        <Group gap="sm" wrap="nowrap">
                          <div className={styles.sessionDateIcon}>
                            <IconCalendarTime size={20} />
                          </div>
                          <div>
                            <Text fw={700}>{formatCalendarDate(date)}</Text>
                            <Text variant="caption">{date}</Text>
                          </div>
                        </Group>
                        <Group gap="xs">
                          <Badge variant="light">{dateSessions.length} sesi</Badge>
                          <Badge color={examCount ? 'green' : 'gray'} variant="light">
                            {examCount} ujian
                          </Badge>
                        </Group>
                      </Group>
                      <Stack gap={0}>
                        {dateSessions.map((item) => {
                          const sessionEntries = entriesBySession.get(item.id) || [];
                          return (
                            <div className={styles.sessionRow} key={item.id}>
                              <div className={styles.sessionOrder}>{item.session_order}</div>
                              <div className={styles.sessionDetails}>
                                <Group gap="xs">
                                  <Text size="sm" fw={700}>
                                    {item.name}
                                  </Text>
                                  <Badge
                                    size="xs"
                                    color={sessionEntries.length ? 'green' : 'gray'}
                                    variant="dot"
                                  >
                                    {sessionEntries.length
                                      ? `${sessionEntries.length} ujian`
                                      : 'Belum diisi'}
                                  </Badge>
                                </Group>
                                <Group gap={5} mt={3} wrap="nowrap">
                                  <IconClock size={14} className={styles.sessionClockIcon} />
                                  <Text variant="caption">
                                    {item.start_time}–{item.end_time}
                                  </Text>
                                </Group>
                                {sessionEntries.length ? (
                                  <Text variant="caption" lineClamp={1} mt={3}>
                                    {[
                                      ...new Set(sessionEntries.map((entry) => entry.subject_name)),
                                    ].join(', ')}
                                  </Text>
                                ) : null}
                              </div>
                              {editable ? (
                                <Group className={styles.sessionActions} gap="xs">
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => openSession(item)}
                                  >
                                    Edit sesi
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    color="red"
                                    onClick={() =>
                                      mutate(
                                        'DELETE',
                                        { resource: 'session', id: item.id },
                                        'Sesi dihapus',
                                      )
                                    }
                                  >
                                    Hapus
                                  </Button>
                                </Group>
                              ) : null}
                            </div>
                          );
                        })}
                      </Stack>
                    </Paper>
                  );
                })}
                {!calendarDates.length ? (
                  <Paper withBorder className={styles.emptyCalendar}>
                    Belum ada sesi. Gunakan “Atur pola sesi” untuk membuatnya sekaligus.
                  </Paper>
                ) : null}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="rooms" pt="lg">
              <Group justify="space-between" mb="md">
                <Text fw={700}>Master ruangan bersama</Text>
                {data?.access.write ? (
                  <Button leftSection={<IconPlus size={16} />} onClick={() => openRoom()}>
                    Tambah ruang
                  </Button>
                ) : null}
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {data?.rooms.map((room) => (
                  <Paper key={room.id} withBorder p="md">
                    <Group justify="space-between">
                      <div>
                        <Group gap="xs">
                          <Text fw={700}>
                            {room.code} · {room.name}
                          </Text>
                          {!room.is_active ? <Badge color="gray">Nonaktif</Badge> : null}
                        </Group>
                        <Text size="sm" c="dimmed">
                          Kapasitas {room.capacity} · {room.location || room.room_type}
                        </Text>
                      </div>
                      {data.access.write ? (
                        <Button size="xs" variant="subtle" onClick={() => openRoom(room)}>
                          Edit
                        </Button>
                      ) : null}
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Tabs.Panel>
            <Tabs.Panel value="availability" pt="lg">
              <Group justify="space-between" mb="md">
                <Text fw={700}>Guru dan ruang yang tidak tersedia</Text>
                {editable ? (
                  <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => {
                      setUnavailableForm({ ...unavailableDefaults, exam_date: period.start_date });
                      setUnavailableModal(true);
                    }}
                  >
                    Tambah
                  </Button>
                ) : null}
              </Group>
              <Stack>
                {data?.unavailabilities.map((item) => (
                  <Paper key={item.id} withBorder p="md">
                    <Group justify="space-between">
                      <div>
                        <Text fw={700}>{item.resource_name}</Text>
                        <Text size="sm" c="dimmed">
                          {item.exam_date} · {item.session_name || 'Sepanjang hari'}
                          {item.reason ? ` · ${item.reason}` : ''}
                        </Text>
                      </div>
                      {editable ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            mutate(
                              'DELETE',
                              { resource: 'unavailability', id: item.id },
                              'Ketidaktersediaan dihapus',
                            )
                          }
                        >
                          Hapus
                        </Button>
                      ) : null}
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="conflicts" pt="lg">
              <Stack>
                {data?.conflicts.map((item, index) => (
                  <Paper
                    key={`${item.code}-${item.entry_id}-${index}`}
                    withBorder
                    p="md"
                    className={styles.conflict}
                    data-severity={item.severity}
                  >
                    <Group>
                      <Badge color={item.severity === 'error' ? 'red' : 'orange'}>
                        {item.severity}
                      </Badge>
                      <Text>{item.message}</Text>
                    </Group>
                  </Paper>
                ))}
                {!data?.conflicts.length ? (
                  <Alert color="green">Jadwal siap dipublikasikan.</Alert>
                ) : null}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="versions" pt="lg">
              <Group justify="space-between" mb="md">
                <Text fw={700}>Riwayat publikasi</Text>
                {data?.access.write ? (
                  <Button
                    variant="light"
                    leftSection={<IconCopy size={16} />}
                    onClick={() => {
                      setCopyForm({
                        academic_year_id: data.options.academic_year_id[0]?.value || '',
                        semester_id: data.options.semester_id[0]?.value || '',
                        name: `${period.name} (Salinan)`,
                        start_date: period.start_date,
                        end_date: period.end_date,
                      });
                      setCopyModal(true);
                    }}
                  >
                    Salin sebagai template
                  </Button>
                ) : null}
              </Group>
              <Stack>
                {data?.versions.map((item) => (
                  <Paper key={item.id} withBorder p="md">
                    <Group justify="space-between">
                      <Text fw={700}>Versi {item.version}</Text>
                      <Text size="sm" c="dimmed">
                        {item.published_at} · {item.published_by_name}
                      </Text>
                    </Group>
                    <Text size="sm">{item.notes || 'Tanpa catatan publikasi'}</Text>
                  </Paper>
                ))}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </>
      )}

      <Modal
        opened={periodModal}
        onClose={() => setPeriodModal(false)}
        title={editingPeriod ? 'Ubah periode ujian' : 'Periode ujian baru'}
        size="lg"
      >
        <Stack>
          <TextInput
            label="Nama"
            placeholder="Contoh: Ujian Tengah Semester Ganjil"
            required
            value={periodForm.name}
            onChange={(e) => setPeriodForm({ ...periodForm, name: e.currentTarget.value })}
          />
          <SimpleGrid cols={2}>
            <Select
              label="Tahun ajaran"
              placeholder="Pilih tahun ajaran"
              data={data?.options.academic_year_id || []}
              value={periodForm.academic_year_id}
              onChange={(value) => setPeriodForm({ ...periodForm, academic_year_id: value || '' })}
            />
            <Select
              label="Semester"
              placeholder="Pilih semester"
              data={data?.options.semester_id || []}
              value={periodForm.semester_id}
              onChange={(value) => setPeriodForm({ ...periodForm, semester_id: value || '' })}
            />
            <Select
              label="Jenis"
              placeholder="Pilih jenis ujian"
              data={[
                ['midterm', 'UTS/Tengah semester'],
                ['final', 'UAS/Akhir semester'],
                ['practice', 'Praktik'],
                ['oral', 'Lisan'],
                ['computer', 'Komputer'],
                ['tryout', 'Tryout'],
                ['other', 'Lainnya'],
              ].map(([value, label]) => ({ value, label }))}
              value={periodForm.exam_type}
              onChange={(value) => setPeriodForm({ ...periodForm, exam_type: value || 'other' })}
            />
            <Select
              label="Kebijakan KBM"
              placeholder="Pilih kebijakan KBM"
              data={[
                { value: 'unaffected', label: 'KBM tidak terpengaruh' },
                { value: 'suspend_participating_classes', label: 'Tangguhkan rombel peserta' },
                { value: 'suspend_all_classes', label: 'Tangguhkan seluruh KBM' },
              ]}
              value={periodForm.regular_schedule_policy}
              onChange={(value) =>
                setPeriodForm({ ...periodForm, regular_schedule_policy: value || 'unaffected' })
              }
            />
            <DateInput
              label="Mulai"
              placeholder="Pilih tanggal mulai"
              value={periodForm.start_date || null}
              maxDate={periodForm.end_date || undefined}
              valueFormat="D MMMM YYYY"
              locale="id"
              popoverProps={{ withinPortal: true }}
              onChange={(value) => setPeriodForm({ ...periodForm, start_date: value || '' })}
            />
            <DateInput
              label="Selesai"
              placeholder="Pilih tanggal selesai"
              value={periodForm.end_date || null}
              minDate={periodForm.start_date || undefined}
              valueFormat="D MMMM YYYY"
              locale="id"
              popoverProps={{ withinPortal: true }}
              onChange={(value) => setPeriodForm({ ...periodForm, end_date: value || '' })}
            />
            <NumberInput
              label="Maks. ujian/rombel/hari"
              placeholder="Contoh: 2"
              min={1}
              value={periodForm.max_exams_per_class_per_day}
              onChange={(value) =>
                setPeriodForm({ ...periodForm, max_exams_per_class_per_day: Number(value) })
              }
            />
            <NumberInput
              label="Maks. pengawasan/guru/hari"
              placeholder="Contoh: 2"
              min={1}
              value={periodForm.max_supervisions_per_teacher_per_day}
              onChange={(value) =>
                setPeriodForm({
                  ...periodForm,
                  max_supervisions_per_teacher_per_day: Number(value),
                })
              }
            />
            <NumberInput
              label="Pengawas per ruang"
              placeholder="Contoh: 2"
              min={1}
              value={periodForm.supervisors_per_room}
              onChange={(value) =>
                setPeriodForm({ ...periodForm, supervisors_per_room: Number(value) })
              }
            />
            <NumberInput
              label="Jeda minimum (menit)"
              placeholder="Contoh: 15"
              min={0}
              value={periodForm.minimum_break_minutes}
              onChange={(value) =>
                setPeriodForm({ ...periodForm, minimum_break_minutes: Number(value) })
              }
            />
          </SimpleGrid>
          <Switch
            label="Izinkan guru mengawasi mapel/rombel sendiri"
            checked={periodForm.allow_self_supervision}
            onChange={(e) =>
              setPeriodForm({ ...periodForm, allow_self_supervision: e.currentTarget.checked })
            }
          />
          <Switch
            label="Kapasitas ruangan wajib dipatuhi"
            checked={periodForm.enforce_room_capacity}
            onChange={(e) =>
              setPeriodForm({ ...periodForm, enforce_room_capacity: e.currentTarget.checked })
            }
          />
          <Switch
            label="Peringatan boleh dioverride dengan alasan"
            checked={periodForm.allow_warning_override}
            onChange={(e) =>
              setPeriodForm({ ...periodForm, allow_warning_override: e.currentTarget.checked })
            }
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPeriodModal(false)}>
              Batal
            </Button>
            <Button onClick={savePeriod}>Simpan</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={patternModal}
        onClose={() => setPatternModal(false)}
        title="Atur pola sesi ujian"
        size="lg"
      >
        <Stack gap="lg">
          <div>
            <Text fw={700} mb={4}>
              1. Pilih hari pelaksanaan
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Hari Minggu tidak dipilih secara otomatis. Pilihan dapat disesuaikan.
            </Text>
            <div className={styles.patternDateGrid}>
              {availablePatternDates.map((date) => (
                <Checkbox
                  className={styles.patternDate}
                  key={date}
                  label={formatCalendarDate(date)}
                  checked={patternDates.includes(date)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setPatternDates((current) =>
                      checked ? [...current, date].sort() : current.filter((item) => item !== date),
                    );
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={700}>2. Susun pola sesi harian</Text>
                <Text size="sm" c="dimmed">
                  Sesi dengan urutan yang sama akan diperbarui tanpa menghapus jadwal ujian.
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => {
                  const nextOrder =
                    Math.max(0, ...patternSessions.map((item) => item.session_order)) + 1;
                  setPatternSessions((current) => [
                    ...current,
                    {
                      name: `Sesi ${nextOrder}`,
                      start_time: '07:30',
                      end_time: '09:00',
                      session_order: nextOrder,
                    },
                  ]);
                }}
              >
                Tambah sesi
              </Button>
            </Group>
            <Stack gap="xs">
              {patternSessions.map((session, index) => (
                <Paper withBorder p="sm" key={`${session.session_order}-${index}`}>
                  <SimpleGrid cols={{ base: 1, sm: 4 }}>
                    <TextInput
                      label="Nama sesi"
                      placeholder="Contoh: Sesi 1"
                      value={session.name}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        setPatternSessions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, name } : item,
                          ),
                        );
                      }}
                    />
                    <TimePicker
                      label="Jam mulai"
                      hoursPlaceholder="JJ"
                      minutesPlaceholder="MM"
                      value={session.start_time}
                      onChange={(value) =>
                        setPatternSessions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, start_time: value } : item,
                          ),
                        )
                      }
                      format="24h"
                      withDropdown
                      minutesStep={5}
                      hoursInputLabel="Jam mulai"
                      minutesInputLabel="Menit mulai"
                    />
                    <TimePicker
                      label="Jam selesai"
                      hoursPlaceholder="JJ"
                      minutesPlaceholder="MM"
                      value={session.end_time}
                      onChange={(value) =>
                        setPatternSessions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, end_time: value } : item,
                          ),
                        )
                      }
                      format="24h"
                      withDropdown
                      minutesStep={5}
                      hoursInputLabel="Jam selesai"
                      minutesInputLabel="Menit selesai"
                    />
                    <Stack gap={4} justify="flex-end">
                      <Text variant="caption">Urutan {session.session_order}</Text>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        disabled={patternSessions.length === 1}
                        onClick={() =>
                          setPatternSessions((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Hapus dari pola
                      </Button>
                    </Stack>
                  </SimpleGrid>
                </Paper>
              ))}
            </Stack>
          </div>
          <Alert color="blue">
            Pola diterapkan pada {patternDates.length} tanggal. Sesi tambahan yang tidak termasuk
            pola tetap dipertahankan.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPatternModal(false)}>
              Batal
            </Button>
            <Button
              disabled={!patternDates.length || !patternSessions.length}
              onClick={saveSessionPattern}
            >
              Terapkan pola sesi
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={sessionModal}
        onClose={() => setSessionModal(false)}
        title={editingSession ? 'Ubah sesi ujian' : 'Tambah sesi ujian'}
      >
        <Stack>
          <TextInput
            label="Nama sesi"
            placeholder="Contoh: Sesi 1"
            value={sessionForm.name}
            onChange={(e) => setSessionForm({ ...sessionForm, name: e.currentTarget.value })}
          />
          <DateInput
            label="Tanggal"
            placeholder="Pilih tanggal ujian"
            value={sessionForm.exam_date || null}
            minDate={period?.start_date}
            maxDate={period?.end_date}
            valueFormat="D MMMM YYYY"
            locale="id"
            popoverProps={{ withinPortal: true }}
            onChange={(value) => setSessionForm({ ...sessionForm, exam_date: value || '' })}
          />
          <SimpleGrid cols={2}>
            <TimePicker
              label="Jam mulai"
              hoursPlaceholder="JJ"
              minutesPlaceholder="MM"
              value={sessionForm.start_time}
              onChange={(value) => setSessionForm({ ...sessionForm, start_time: value })}
              format="24h"
              withDropdown
              minutesStep={5}
              hoursInputLabel="Jam mulai"
              minutesInputLabel="Menit mulai"
            />
            <TimePicker
              label="Jam selesai"
              hoursPlaceholder="JJ"
              minutesPlaceholder="MM"
              value={sessionForm.end_time}
              onChange={(value) => setSessionForm({ ...sessionForm, end_time: value })}
              format="24h"
              withDropdown
              minutesStep={5}
              hoursInputLabel="Jam selesai"
              minutesInputLabel="Menit selesai"
            />
          </SimpleGrid>
          <NumberInput
            label="Urutan"
            placeholder="Contoh: 1"
            min={1}
            value={sessionForm.session_order}
            onChange={(value) => setSessionForm({ ...sessionForm, session_order: Number(value) })}
          />
          <Button onClick={saveSession}>Simpan</Button>
        </Stack>
      </Modal>
      <Modal
        opened={roomModal}
        onClose={() => setRoomModal(false)}
        title={editingRoom ? 'Ubah ruangan' : 'Tambah ruangan'}
      >
        <Stack>
          <SimpleGrid cols={2}>
            <TextInput
              label="Kode"
              placeholder="Contoh: R-101"
              value={roomForm.code}
              onChange={(e) => setRoomForm({ ...roomForm, code: e.currentTarget.value })}
            />
            <TextInput
              label="Nama"
              placeholder="Contoh: Ruang Kelas 101"
              value={roomForm.name}
              onChange={(e) => setRoomForm({ ...roomForm, name: e.currentTarget.value })}
            />
          </SimpleGrid>
          <NumberInput
            label="Kapasitas"
            placeholder="Contoh: 32"
            min={0}
            value={roomForm.capacity}
            onChange={(value) => setRoomForm({ ...roomForm, capacity: Number(value) })}
          />
          <Select
            label="Jenis"
            placeholder="Pilih jenis ruangan"
            data={[
              { value: 'classroom', label: 'Kelas' },
              { value: 'laboratory', label: 'Laboratorium' },
              { value: 'computer_lab', label: 'Lab komputer' },
              { value: 'hall', label: 'Aula' },
              { value: 'other', label: 'Lainnya' },
            ]}
            value={roomForm.room_type}
            onChange={(value) => setRoomForm({ ...roomForm, room_type: value || 'other' })}
          />
          <TextInput
            label="Lokasi"
            placeholder="Contoh: Gedung A, lantai 1"
            value={roomForm.location}
            onChange={(e) => setRoomForm({ ...roomForm, location: e.currentTarget.value })}
          />
          <TextInput
            label="Fasilitas (pisahkan koma)"
            placeholder="Contoh: Proyektor, komputer, AC"
            value={roomForm.facilities}
            onChange={(e) => setRoomForm({ ...roomForm, facilities: e.currentTarget.value })}
          />
          <Switch
            label="Aktif"
            checked={roomForm.is_active}
            onChange={(e) => setRoomForm({ ...roomForm, is_active: e.currentTarget.checked })}
          />
          <Button onClick={saveRoom}>Simpan</Button>
        </Stack>
      </Modal>
      <Modal
        opened={entryModal}
        onClose={() => setEntryModal(false)}
        title={editingEntry ? 'Ubah jadwal ujian' : 'Tambah jadwal ujian'}
        size="lg"
      >
        <Stack>
          <SimpleGrid cols={2}>
            <Select
              searchable
              label="Sesi"
              placeholder="Pilih tanggal dan sesi ujian"
              data={
                data?.sessions.map((item) => ({
                  value: item.id,
                  label: `${item.exam_date} · ${item.name} · ${item.start_time}`,
                })) || []
              }
              value={entryForm.exam_session_id}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  exam_session_id: value || '',
                  student_ids: [],
                })
              }
            />
            <Select
              searchable
              label="Mata pelajaran"
              placeholder="Pilih mata pelajaran"
              data={data?.options.subject_id || []}
              value={entryForm.subject_id}
              onChange={(value) => setEntryForm({ ...entryForm, subject_id: value || '' })}
            />
            <Select
              searchable
              label="Ruangan"
              placeholder="Pilih ruangan ujian"
              data={
                data?.rooms
                  .filter((item) => item.is_active)
                  .map((item) => ({
                    value: item.id,
                    label: `${item.name} · kapasitas ${item.capacity}`,
                  })) || []
              }
              value={entryForm.room_id}
              onChange={(value) => setEntryForm({ ...entryForm, room_id: value || '' })}
            />
            <Select
              label="Jenis asesmen"
              placeholder="Pilih jenis asesmen"
              data={[
                { value: 'written', label: 'Tertulis' },
                { value: 'practice', label: 'Praktik' },
                { value: 'oral', label: 'Lisan' },
                { value: 'computer', label: 'Komputer' },
              ]}
              value={entryForm.assessment_type}
              onChange={(value) =>
                setEntryForm({ ...entryForm, assessment_type: value || 'written' })
              }
            />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={500} mb={5}>
              Cara memilih peserta
            </Text>
            <SegmentedControl
              fullWidth
              value={entryForm.participant_mode}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  participant_mode: value as 'class' | 'student',
                  student_ids: value === 'class' ? [] : entryForm.student_ids,
                })
              }
              data={[
                { value: 'class', label: 'Seluruh rombel' },
                { value: 'student', label: 'Pilih / acak murid' },
              ]}
            />
          </div>
          <MultiSelect
            searchable
            label={entryForm.participant_mode === 'class' ? 'Rombel peserta' : 'Rombel sumber'}
            placeholder="Pilih satu atau beberapa rombel"
            data={data?.options.class_id || []}
            value={entryForm.class_ids}
            onChange={(value) => {
              const allowedStudents = new Set(
                (data?.options.student_id || [])
                  .filter(
                    (student) =>
                      value.includes(student.class_id) && !unavailableStudentIds.has(student.value),
                  )
                  .map((student) => student.value),
              );
              setEntryForm({
                ...entryForm,
                class_ids: value,
                student_ids: entryForm.student_ids.filter((studentId) =>
                  allowedStudents.has(studentId),
                ),
              });
            }}
          />
          {entryForm.participant_mode === 'student' ? (
            <Paper withBorder p="md">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text fw={700} size="sm">
                    Murid yang ditempatkan
                  </Text>
                  <Text variant="caption">
                    Bisa dipilih manual atau diacak dari rombel sumber sampai kapasitas ruangan.
                  </Text>
                </div>
                <Button variant="light" size="xs" onClick={randomizeEntryStudents}>
                  Acak sesuai kapasitas
                </Button>
              </Group>
              <MultiSelect
                searchable
                clearable
                label="Daftar murid"
                placeholder="Pilih murid peserta ujian"
                data={(data?.options.student_id || []).filter(
                  (student) =>
                    (!entryForm.class_ids.length ||
                      entryForm.class_ids.includes(student.class_id)) &&
                    !unavailableStudentIds.has(student.value),
                )}
                value={entryForm.student_ids}
                onChange={(value) => setEntryForm({ ...entryForm, student_ids: value })}
                description={`${entryForm.student_ids.length} murid dipilih · ${unavailableStudentIds.size} sudah ditempatkan di sesi ini · kapasitas ruang ${data?.rooms.find((room) => room.id === entryForm.room_id)?.capacity ?? '—'}`}
              />
            </Paper>
          ) : null}
          <MultiSelect
            searchable
            label="Pengawas"
            placeholder="Pilih guru pengawas"
            data={data?.options.teacher_id || []}
            value={entryForm.supervisor_ids}
            onChange={(value) =>
              setEntryForm({
                ...entryForm,
                supervisor_ids: value,
                lead_supervisor_id: value.includes(entryForm.lead_supervisor_id)
                  ? entryForm.lead_supervisor_id
                  : '',
              })
            }
          />
          <Select
            searchable
            clearable
            label="Pengawas utama"
            placeholder="Pilih salah satu pengawas"
            data={(data?.options.teacher_id || []).filter((option) =>
              entryForm.supervisor_ids.includes(option.value),
            )}
            value={entryForm.lead_supervisor_id}
            onChange={(value) => setEntryForm({ ...entryForm, lead_supervisor_id: value || '' })}
          />
          <NumberInput
            label="Durasi (menit)"
            placeholder="Contoh: 90"
            min={1}
            value={entryForm.duration_minutes}
            onChange={(value) => setEntryForm({ ...entryForm, duration_minutes: Number(value) })}
          />
          <Textarea
            label="Catatan"
            placeholder="Contoh: Peserta membawa alat tulis sendiri"
            value={entryForm.notes}
            onChange={(e) => setEntryForm({ ...entryForm, notes: e.currentTarget.value })}
          />
          <Button onClick={saveEntry}>Simpan</Button>
        </Stack>
      </Modal>
      <Modal
        opened={unavailableModal}
        onClose={() => setUnavailableModal(false)}
        title="Tambah ketidaktersediaan"
      >
        <Stack>
          <Select
            label="Jenis sumber daya"
            placeholder="Pilih guru atau ruangan"
            data={[
              { value: 'teacher', label: 'Guru' },
              { value: 'room', label: 'Ruangan' },
            ]}
            value={unavailableForm.resource_type}
            onChange={(value) =>
              setUnavailableForm({
                ...unavailableForm,
                resource_type: (value || 'teacher') as 'teacher' | 'room',
                resource_id: '',
              })
            }
          />
          <Select
            searchable
            label={unavailableForm.resource_type === 'teacher' ? 'Guru' : 'Ruangan'}
            placeholder={
              unavailableForm.resource_type === 'teacher' ? 'Pilih guru' : 'Pilih ruangan'
            }
            data={
              unavailableForm.resource_type === 'teacher'
                ? data?.options.teacher_id || []
                : data?.rooms.map((item) => ({ value: item.id, label: item.name })) || []
            }
            value={unavailableForm.resource_id}
            onChange={(value) =>
              setUnavailableForm({ ...unavailableForm, resource_id: value || '' })
            }
          />
          <DateInput
            label="Tanggal"
            placeholder="Pilih tanggal ketidaktersediaan"
            value={unavailableForm.exam_date || null}
            minDate={period?.start_date}
            maxDate={period?.end_date}
            valueFormat="D MMMM YYYY"
            locale="id"
            popoverProps={{ withinPortal: true }}
            onChange={(value) =>
              setUnavailableForm({
                ...unavailableForm,
                exam_date: value || '',
                exam_session_id: '',
              })
            }
          />
          <Select
            clearable
            label="Sesi (kosong = sepanjang hari)"
            placeholder="Pilih sesi atau biarkan sepanjang hari"
            data={
              data?.sessions
                .filter((item) => item.exam_date === unavailableForm.exam_date)
                .map((item) => ({ value: item.id, label: `${item.name} · ${item.start_time}` })) ||
              []
            }
            value={unavailableForm.exam_session_id}
            onChange={(value) =>
              setUnavailableForm({ ...unavailableForm, exam_session_id: value || '' })
            }
          />
          <Textarea
            label="Alasan"
            placeholder="Contoh: Guru mengikuti pelatihan dinas"
            value={unavailableForm.reason}
            onChange={(e) =>
              setUnavailableForm({ ...unavailableForm, reason: e.currentTarget.value })
            }
          />
          <Button
            onClick={async () => {
              if (
                await mutate(
                  'POST',
                  { action: 'unavailability', exam_period_id: periodId, ...unavailableForm },
                  'Ketidaktersediaan ditambahkan',
                )
              )
                setUnavailableModal(false);
            }}
          >
            Simpan
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={publishModal}
        onClose={() => setPublishModal(false)}
        title="Publikasikan jadwal"
      >
        <Stack>
          <Alert color={errors ? 'red' : warnings ? 'orange' : 'green'}>
            {errors
              ? `${errors} konflik kritis harus diselesaikan.`
              : warnings
                ? `${warnings} peringatan akan dioverride dengan alasan di bawah.`
                : 'Jadwal siap dipublikasikan.'}
          </Alert>
          <Textarea
            label="Catatan versi"
            placeholder="Contoh: Jadwal final setelah penyesuaian pengawas"
            value={publishNotes}
            onChange={(e) => setPublishNotes(e.currentTarget.value)}
          />
          {warnings ? (
            <Textarea
              required
              label="Alasan override peringatan"
              placeholder="Jelaskan alasan peringatan tetap dapat diterima"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.currentTarget.value)}
            />
          ) : null}
          <Button color="green" disabled={!!errors} onClick={publish}>
            Publikasikan versi berikutnya
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={copyModal}
        onClose={() => setCopyModal(false)}
        title="Salin konfigurasi periode"
      >
        <Stack>
          <TextInput
            label="Nama periode baru"
            placeholder="Contoh: Ujian Tengah Semester Genap"
            value={copyForm.name}
            onChange={(e) => setCopyForm({ ...copyForm, name: e.currentTarget.value })}
          />
          <Select
            label="Tahun ajaran tujuan"
            placeholder="Pilih tahun ajaran tujuan"
            data={data?.options.academic_year_id || []}
            value={copyForm.academic_year_id}
            onChange={(value) => setCopyForm({ ...copyForm, academic_year_id: value || '' })}
          />
          <Select
            label="Semester tujuan"
            placeholder="Pilih semester tujuan"
            data={data?.options.semester_id || []}
            value={copyForm.semester_id}
            onChange={(value) => setCopyForm({ ...copyForm, semester_id: value || '' })}
          />
          <SimpleGrid cols={2}>
            <DateInput
              label="Mulai"
              placeholder="Pilih tanggal mulai"
              value={copyForm.start_date || null}
              maxDate={copyForm.end_date || undefined}
              valueFormat="D MMMM YYYY"
              locale="id"
              popoverProps={{ withinPortal: true }}
              onChange={(value) => setCopyForm({ ...copyForm, start_date: value || '' })}
            />
            <DateInput
              label="Selesai"
              placeholder="Pilih tanggal selesai"
              value={copyForm.end_date || null}
              minDate={copyForm.start_date || undefined}
              valueFormat="D MMMM YYYY"
              locale="id"
              popoverProps={{ withinPortal: true }}
              onChange={(value) => setCopyForm({ ...copyForm, end_date: value || '' })}
            />
          </SimpleGrid>
          <Text size="sm" c="dimmed">
            Sesi dan constraint disalin sebagai draft. Penempatan peserta dan pengawas tidak
            disalin.
          </Text>
          <Button
            onClick={async () => {
              if (
                await mutate(
                  'POST',
                  { action: 'copy_template', source_period_id: periodId, ...copyForm },
                  'Template periode disalin',
                )
              )
                setCopyModal(false);
            }}
          >
            Salin sebagai draft
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
