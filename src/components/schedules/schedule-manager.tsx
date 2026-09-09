'use client';

import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TimePicker } from '@mantine/dates';
import {
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconCopy,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { moduleMutation } from '@/hooks/use-module-list';
import styles from './schedule-manager.module.css';

type Option = { value: string; label: string; type?: 'lesson' | 'extracurricular' };
type CopyOption = Option & {
  academic_year_id?: string;
  name?: string;
  grade_id?: string;
};
type Slot = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  slot_order: number;
  is_break: number;
  is_active: number;
};
type Entry = {
  id: string;
  assignment_id: string;
  entry_type: 'lesson' | 'extracurricular';
  semester_id: string;
  time_slot_id: string;
  weekday: number;
  entry_name: string;
  entry_code: string;
  teacher_name: string;
  class_name: string;
};
type ScheduleResponse = {
  entries: Entry[];
  slots: Slot[];
  assignments: Option[];
  selected: Record<string, string>;
  options: Record<string, CopyOption[]>;
};

const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const weekdayOptions = days.map((label, index) => ({ value: String(index + 1), label }));
const weekdayName = (weekday: number) => days[weekday - 1] || '';
const emptySlotForm = {
  name: '',
  start_time: '',
  end_time: '',
  slot_order: 1,
  is_break: false,
  is_active: true,
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Koneksi gagal.');
  return result as T;
}

export function ScheduleManager({ writable }: { writable: boolean }) {
  const [tab, setTab] = useState<string | null>('schedule');
  const [view, setView] = useState<'class' | 'teacher'>('class');
  const [academicYearId, setAcademicYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [cell, setCell] = useState<{ weekday: number; time_slot_id: string } | null>(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyOpened, setCopyOpened] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [sourceSemesterId, setSourceSemesterId] = useState('');
  const [sourceClassId, setSourceClassId] = useState('');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotRevision, setSlotRevision] = useState(0);
  const [slotEditing, setSlotEditing] = useState<Slot | null | undefined>(undefined);
  const [slotRemoving, setSlotRemoving] = useState<Slot | null>(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [activeWeekdays, setActiveWeekdays] = useState([1, 2, 3, 4, 5]);
  const [weekdaysLoading, setWeekdaysLoading] = useState(true);
  const [savingWeekdays, setSavingWeekdays] = useState(false);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const reloadSlots = useCallback(() => setSlotRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (academicYearId) params.set('academic_year_id', academicYearId);
    if (semesterId) params.set('semester_id', semesterId);
    if (entityId) params.set(view === 'class' ? 'class_id' : 'teacher_id', entityId);
    jsonRequest<ScheduleResponse>(`/api/modules/schedules?${params}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
        setAcademicYearId(result.selected.academic_year_id || '');
        setSemesterId(result.selected.semester_id || '');
        setEntityId(result.selected[view === 'class' ? 'class_id' : 'teacher_id'] || '');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        notifications.show({
          color: 'red',
          title: 'Jadwal gagal dimuat',
          message: error instanceof Error ? error.message : 'Koneksi gagal.',
        });
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [academicYearId, semesterId, entityId, revision, view]);

  useEffect(() => {
    const controller = new AbortController();
    jsonRequest<{ rows: Slot[] }>('/api/modules/schedule-time-slots', {
      signal: controller.signal,
    })
      .then((result) => setSlots(result.rows))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        notifications.show({
          color: 'red',
          title: 'Slot waktu gagal dimuat',
          message: error instanceof Error ? error.message : 'Koneksi gagal.',
        });
      })
      .finally(() => !controller.signal.aborted && setSlotsLoading(false));
    return () => controller.abort();
  }, [slotRevision]);

  useEffect(() => {
    jsonRequest<{ weekdays: number[] }>('/api/modules/schedules/settings')
      .then((result) => setActiveWeekdays(result.weekdays))
      .catch((error: unknown) =>
        notifications.show({
          color: 'red',
          title: 'Pengaturan hari gagal dimuat',
          message: error instanceof Error ? error.message : 'Koneksi gagal.',
        }),
      )
      .finally(() => setWeekdaysLoading(false));
  }, []);

  const entryMap = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of data?.entries || []) {
      const key = `${entry.weekday}:${entry.time_slot_id}`;
      map.set(key, [...(map.get(key) || []), entry]);
    }
    return map;
  }, [data?.entries]);
  const copySemesters = data?.options.copy_semester_id || [];
  const selectedSourceSemester = copySemesters.find((option) => option.value === sourceSemesterId);
  const sourceClasses = (data?.options.copy_class_id || []).filter(
    (option) => option.academic_year_id === selectedSourceSemester?.academic_year_id,
  );

  function suggestedSourceClass(sourceSemesterValue: string) {
    const sourceSemester = copySemesters.find((option) => option.value === sourceSemesterValue);
    const candidates = (data?.options.copy_class_id || []).filter(
      (option) => option.academic_year_id === sourceSemester?.academic_year_id,
    );
    const target = (data?.options.copy_class_id || []).find((option) => option.value === entityId);
    return (
      candidates.find(
        (option) => option.grade_id === target?.grade_id && option.name === target?.name,
      )?.value ||
      candidates[0]?.value ||
      ''
    );
  }

  function openCell(weekday: number, timeSlotId: string, entry?: Entry) {
    if (!writable) return;
    setCell({ weekday, time_slot_id: timeSlotId });
    setEditing(entry || null);
    setAssignmentId(entry?.assignment_id || '');
  }

  async function saveWeekdays() {
    setSavingWeekdays(true);
    try {
      const result = await jsonRequest<{ weekdays: number[] }>('/api/modules/schedules/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekdays: activeWeekdays }),
      });
      setActiveWeekdays(result.weekdays);
      notifications.show({
        color: 'green',
        title: 'Hari jadwal tersimpan',
        message: 'Pilihan hari diterapkan untuk jadwal baru.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSavingWeekdays(false);
    }
  }

  function toggleWeekday(weekday: number) {
    setActiveWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((value) => value !== weekday)
        : [...current, weekday].sort((a, b) => a - b),
    );
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (!cell || !semesterId) return;
    setSaving(true);
    try {
      const type =
        data?.assignments.find((assignment) => assignment.value === assignmentId)?.type || 'lesson';
      await moduleMutation(
        type === 'extracurricular'
          ? '/api/modules/extracurricular-schedules'
          : '/api/modules/schedules',
        editing ? 'PATCH' : 'POST',
        {
          id: editing?.id,
          ...(type === 'extracurricular'
            ? { extracurricular_assignment_id: assignmentId }
            : { teaching_assignment_id: assignmentId }),
          semester_id: semesterId,
          time_slot_id: cell.time_slot_id,
          weekday: cell.weekday,
        },
      );
      setEditing(undefined);
      setCell(null);
      reload();
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Jadwal telah disimpan.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan jadwal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule() {
    if (!editing) return;
    setSaving(true);
    try {
      await moduleMutation(
        editing.entry_type === 'extracurricular'
          ? '/api/modules/extracurricular-schedules'
          : '/api/modules/schedules',
        'DELETE',
        { id: editing.id },
      );
      setEditing(undefined);
      setCell(null);
      reload();
      setConfirmingRemoval(false);
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Jadwal telah dihapus.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus jadwal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function copySchedule() {
    if (!sourceSemesterId || !sourceClassId || !semesterId || !entityId) return;
    setSaving(true);
    try {
      const result = await jsonRequest<{ copied: number; skipped: number }>(
        '/api/modules/schedules/copy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_semester_id: sourceSemesterId,
            target_semester_id: semesterId,
            source_class_id: sourceClassId,
            class_id: entityId,
          }),
        },
      );
      setCopyOpened(false);
      reload();
      notifications.show({
        color: result.skipped ? 'yellow' : 'green',
        title: 'Penyalinan selesai',
        message: `${result.copied} jadwal disalin${result.skipped ? `, ${result.skipped} dilewati karena bentrok atau penugasan belum tersedia` : ''}.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyalin jadwal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  function openSlot(row: Slot | null) {
    setSlotEditing(row);
    setSlotForm(
      row
        ? {
            name: row.name,
            start_time: row.start_time,
            end_time: row.end_time,
            slot_order: row.slot_order,
            is_break: Boolean(row.is_break),
            is_active: Boolean(row.is_active),
          }
        : { ...emptySlotForm, slot_order: slots.length + 1 },
    );
  }

  async function saveSlot(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation('/api/modules/schedule-time-slots', slotEditing ? 'PATCH' : 'POST', {
        ...slotForm,
        id: slotEditing?.id,
      });
      setSlotEditing(undefined);
      reloadSlots();
      reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Slot waktu telah disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan slot',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot() {
    if (!slotRemoving) return;
    setSaving(true);
    try {
      await moduleMutation('/api/modules/schedule-time-slots', 'DELETE', { id: slotRemoving.id });
      setSlotRemoving(null);
      reloadSlots();
      reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Slot waktu telah dihapus.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus slot',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="AKADEMIK"
        title="Jadwal Pelajaran"
        description="Susun jadwal mingguan per semester dan cegah bentrok waktu guru maupun rombel."
      />
      <Tabs value={tab} onChange={setTab} className={styles.tabs}>
        <Tabs.List>
          <Tabs.Tab value="schedule" leftSection={<IconCalendarTime size={17} />}>
            Jadwal Mingguan
          </Tabs.Tab>
          <Tabs.Tab value="slots" leftSection={<IconClock size={17} />}>
            Pengaturan Jam
          </Tabs.Tab>
          <Tabs.Tab value="days" leftSection={<IconCalendarTime size={17} />}>
            Pengaturan Hari
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="schedule" pt="lg">
          <Paper className={styles.panel} withBorder pos="relative">
            <LoadingOverlay visible={loading} />
            <div className={styles.toolbar}>
              <Stack gap={4}>
                <Title order={3}>Jadwal mingguan</Title>
                <Text variant="caption">Klik sel untuk menambah atau mengubah pelajaran.</Text>
              </Stack>
              <Group className={styles.filterBar} gap="xs" wrap="wrap">
                <SegmentedControl
                  className={styles.viewControl}
                  value={view}
                  onChange={(value) => {
                    setView(value as 'class' | 'teacher');
                    setEntityId('');
                  }}
                  data={[
                    { value: 'class', label: 'Per Rombel' },
                    { value: 'teacher', label: 'Per Guru' },
                  ]}
                  fullWidth
                />
                <Select
                  className={`${styles.filterControl} ${styles.yearFilter}`}
                  aria-label="Tahun ajaran"
                  data={data?.options.academic_year_id || []}
                  value={academicYearId || null}
                  onChange={(value) => {
                    setAcademicYearId(value || '');
                    setSemesterId('');
                    setEntityId('');
                  }}
                  allowDeselect={false}
                  searchable
                />
                <Select
                  className={`${styles.filterControl} ${styles.semesterFilter}`}
                  aria-label="Semester"
                  placeholder="Pilih semester"
                  data={data?.options.semester_id || []}
                  value={semesterId || null}
                  onChange={(value) => setSemesterId(value || '')}
                  allowDeselect={false}
                />
                <Select
                  className={`${styles.filterControl} ${styles.entityFilter}`}
                  aria-label={view === 'class' ? 'Rombel' : 'Guru'}
                  placeholder={view === 'class' ? 'Pilih rombel' : 'Pilih guru'}
                  data={data?.options[view === 'class' ? 'class_id' : 'teacher_id'] || []}
                  value={entityId || null}
                  onChange={(value) => setEntityId(value || '')}
                  allowDeselect={false}
                  searchable
                />
                {writable && copySemesters.length > 0 && (
                  <Tooltip
                    label={view === 'teacher' ? 'Salin jadwal tersedia pada mode Per Rombel' : ''}
                    disabled={view === 'class'}
                  >
                    <Button
                      className={styles.copyButton}
                      variant="light"
                      leftSection={<IconCopy size={16} />}
                      onClick={() => {
                        const initialSemester = copySemesters[0]?.value || '';
                        setSourceSemesterId(initialSemester);
                        setSourceClassId(suggestedSourceClass(initialSemester));
                        setCopyOpened(true);
                      }}
                      disabled={view === 'teacher' || !entityId || !semesterId}
                    >
                      Salin jadwal
                    </Button>
                  </Tooltip>
                )}
                <Tooltip label="Muat ulang">
                  <ActionIcon
                    className={styles.reloadButton}
                    variant="default"
                    size="lg"
                    onClick={reload}
                    aria-label="Muat ulang"
                  >
                    <IconRefresh size={17} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </div>
            {!semesterId ? (
              <div className={styles.empty}>
                Buat semester terlebih dahulu untuk menyusun jadwal.
              </div>
            ) : !entityId ? (
              <div className={styles.empty}>
                {view === 'class'
                  ? 'Buat dan pilih rombel terlebih dahulu.'
                  : 'Pilih guru untuk melihat jadwal.'}
              </div>
            ) : !data?.slots.length ? (
              <div className={styles.empty}>
                Tambahkan slot pada tab Pengaturan Jam sebelum menyusun jadwal.
              </div>
            ) : (
              <div className={styles.gridScroll}>
                <div
                  className={styles.scheduleGrid}
                  style={{ '--schedule-day-count': activeWeekdays.length } as CSSProperties}
                >
                  <div className={styles.gridHeader}>
                    <div className={`${styles.headerCell} ${styles.timeHeader}`}>WAKTU</div>
                    {activeWeekdays.map((weekday) => (
                      <div
                        className={`${styles.headerCell} ${weekday >= 6 ? styles.weekendHeader : ''}`}
                        key={weekday}
                      >
                        {weekdayName(weekday)}
                      </div>
                    ))}
                  </div>
                  {data.slots.map((slot) => (
                    <div className={styles.gridRow} key={slot.id}>
                      <div className={styles.timeCell}>
                        <Text fw={700} size="xs">
                          {slot.name}
                        </Text>
                        <Text variant="caption">
                          {slot.start_time}–{slot.end_time}
                        </Text>
                      </div>
                      {activeWeekdays.map((weekday) => {
                        const cellEntries = entryMap.get(`${weekday}:${slot.id}`) || [];
                        const entry = cellEntries[0];
                        const entryNames = [...new Set(cellEntries.map((item) => item.entry_name))];
                        if (slot.is_break)
                          return (
                            <div className={styles.breakCell} key={weekday}>
                              Istirahat
                            </div>
                          );
                        return (
                          <button
                            type="button"
                            key={weekday}
                            className={`${styles.scheduleCell} ${weekday >= 6 ? styles.weekendCell : ''} ${cellEntries.length ? styles.filledCell : ''}`}
                            onClick={() => openCell(weekday, slot.id, entry)}
                            disabled={!writable || cellEntries.length > 1}
                          >
                            {cellEntries.length ? (
                              <>
                                <Text fw={700} size="xs" lineClamp={2}>
                                  {entryNames.join(', ')}
                                </Text>
                                <Text variant="caption" lineClamp={1}>
                                  {cellEntries.length > 1
                                    ? `${cellEntries.length} kegiatan`
                                    : view === 'class'
                                      ? entry.teacher_name
                                      : entry.class_name}
                                </Text>
                                <Badge size="xs" variant="light" mt={5}>
                                  {cellEntries.every(
                                    (item) => item.entry_type === 'extracurricular',
                                  )
                                    ? 'EKSKUL'
                                    : entry?.entry_code}
                                </Badge>
                              </>
                            ) : writable ? (
                              <IconPlus size={17} />
                            ) : (
                              <Text variant="caption">—</Text>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!!semesterId && !!entityId && !!data?.slots.length && (
              <div className={styles.mobileSchedule}>
                {activeWeekdays.map((weekday) => (
                  <section className={styles.daySection} key={weekday}>
                    <Text className={styles.dayTitle} fw={700} size="sm">
                      {weekdayName(weekday)}
                    </Text>
                    {data.slots.map((slot) => {
                      const cellEntries = entryMap.get(`${weekday}:${slot.id}`) || [];
                      const entry = cellEntries[0];
                      const entryNames = [...new Set(cellEntries.map((item) => item.entry_name))];
                      return (
                        <button
                          type="button"
                          key={slot.id}
                          className={`${styles.mobileSlot} ${cellEntries.length ? styles.filledCell : ''} ${slot.is_break ? styles.mobileBreak : ''}`}
                          onClick={() => !slot.is_break && openCell(weekday, slot.id, entry)}
                          disabled={!writable || Boolean(slot.is_break) || cellEntries.length > 1}
                        >
                          <Box className={styles.mobileTime}>
                            <Text fw={700} size="xs">
                              {slot.name}
                            </Text>
                            <Text variant="caption">
                              {slot.start_time}–{slot.end_time}
                            </Text>
                          </Box>
                          <Box className={styles.mobileLesson}>
                            {slot.is_break ? (
                              <Text variant="caption">Istirahat</Text>
                            ) : cellEntries.length ? (
                              <>
                                <Text fw={700} size="xs">
                                  {entryNames.join(', ')}
                                </Text>
                                <Text variant="caption">
                                  {cellEntries.length > 1
                                    ? `${cellEntries.length} kegiatan`
                                    : view === 'class'
                                      ? entry.teacher_name
                                      : entry.class_name}
                                </Text>
                              </>
                            ) : (
                              <Text variant="caption">{writable ? '+ Tambah pelajaran' : '—'}</Text>
                            )}
                          </Box>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </Paper>
          <Text className={styles.note} variant="caption">
            Jadwal hanya memakai Penugasan Mengajar yang berlaku pada semester terpilih.
          </Text>
        </Tabs.Panel>

        <Tabs.Panel value="days" pt="lg">
          <Paper withBorder p="lg" pos="relative">
            <LoadingOverlay visible={weekdaysLoading} />
            <Stack gap="md">
              <Stack gap={3}>
                <Title order={3}>Hari aktif untuk jadwal</Title>
                <Text size="sm" c="dimmed">
                  Hanya hari yang dipilih yang tampil saat menyusun jadwal. Jadwal yang sudah ada
                  tidak dihapus.
                </Text>
              </Stack>
              <div className={styles.weekdayPicker} role="group" aria-label="Hari aktif jadwal">
                {weekdayOptions.map((day) => {
                  const weekday = Number(day.value);
                  const active = activeWeekdays.includes(weekday);
                  return (
                    <button
                      type="button"
                      key={day.value}
                      className={`${styles.weekdayCard} ${active ? styles.weekdayCardActive : ''}`}
                      onClick={() => toggleWeekday(weekday)}
                      aria-pressed={active}
                      disabled={!writable || weekdaysLoading}
                    >
                      <span className={styles.weekdayInitial}>{day.label.slice(0, 3)}</span>
                      <span className={styles.weekdayLabel}>{day.label}</span>
                      <span className={styles.weekdayStatus}>{active ? 'Aktif' : 'Nonaktif'}</span>
                    </button>
                  );
                })}
              </div>
              {writable && (
                <Group justify="flex-end">
                  <Button
                    loading={savingWeekdays}
                    disabled={!activeWeekdays.length}
                    onClick={saveWeekdays}
                  >
                    Simpan hari jadwal
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="slots" pt="lg">
          <Paper className={styles.panel} withBorder pos="relative">
            <LoadingOverlay visible={slotsLoading} />
            <div className={styles.toolbar}>
              <Stack gap={4}>
                <Title order={3}>Slot jam pelajaran</Title>
                <Text variant="caption">Slot berlaku untuk seluruh jadwal sekolah.</Text>
              </Stack>
              {writable && (
                <Button leftSection={<IconPlus size={17} />} onClick={() => openSlot(null)}>
                  Tambah slot
                </Button>
              )}
            </div>
            {!slots.length && !slotsLoading ? (
              <div className={styles.empty}>Belum ada slot jam pelajaran.</div>
            ) : (
              <Table.ScrollContainer minWidth={680}>
                <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>URUTAN</Table.Th>
                      <Table.Th>NAMA</Table.Th>
                      <Table.Th>WAKTU</Table.Th>
                      <Table.Th>JENIS</Table.Th>
                      <Table.Th>STATUS</Table.Th>
                      <Table.Th ta="right">AKSI</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {slots.map((slot) => (
                      <Table.Tr key={slot.id}>
                        <Table.Td>{slot.slot_order}</Table.Td>
                        <Table.Td>
                          <Text fw={600} size="xs">
                            {slot.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {slot.start_time}–{slot.end_time}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={slot.is_break ? 'orange' : 'blue'} variant="light">
                            {slot.is_break ? 'Istirahat' : 'Pelajaran'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={slot.is_active ? 'green' : 'gray'} variant="dot">
                            {slot.is_active ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={5} justify="flex-end">
                            {writable ? (
                              <>
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  aria-label={`Edit ${slot.name}`}
                                  onClick={() => openSlot(slot)}
                                >
                                  <IconPencil size={17} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  aria-label={`Hapus ${slot.name}`}
                                  onClick={() => setSlotRemoving(slot)}
                                >
                                  <IconTrash size={17} />
                                </ActionIcon>
                              </>
                            ) : (
                              '—'
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={editing !== undefined && !confirmingRemoval}
        onClose={() => !saving && setEditing(undefined)}
        centered
        title={editing ? 'Ubah jadwal' : 'Tambah jadwal'}
      >
        <form onSubmit={saveSchedule}>
          <Stack>
            <Group gap="xs">
              <Badge variant="light">{cell ? weekdayName(cell.weekday) : ''}</Badge>
              <Text size="sm" c="dimmed">
                {data?.slots.find((slot) => slot.id === cell?.time_slot_id)?.name}
              </Text>
            </Group>
            <Select
              label="Penugasan"
              placeholder="Pilih penugasan"
              data={data?.assignments || []}
              value={assignmentId || null}
              onChange={(value) => setAssignmentId(value || '')}
              searchable
              required
              nothingFoundMessage="Penugasan belum tersedia"
            />
            <Text size="xs" c="dimmed" mt={-8}>
              Pilihan mengikuti rombel/guru dan semester yang sedang ditampilkan. Pada tampilan Per
              Guru, ekstrakurikuler juga tersedia.
            </Text>
            <Group justify="space-between" mt="md">
              {editing ? (
                <Button
                  type="button"
                  variant="light"
                  color="red"
                  onClick={() => setConfirmingRemoval(true)}
                  loading={saving}
                >
                  Hapus
                </Button>
              ) : (
                <Box />
              )}
              <Group gap="xs">
                <Button variant="default" onClick={() => setEditing(undefined)} disabled={saving}>
                  Batal
                </Button>
                <Button type="submit" leftSection={<IconCheck size={16} />} loading={saving}>
                  Simpan
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={copyOpened}
        onClose={() => !saving && setCopyOpened(false)}
        centered
        title="Salin jadwal"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Pilih semester dan rombel dari tahun ajaran yang sama atau sebelumnya. Jadwal di
            semester tujuan tidak ditimpa; entri bentrok atau tanpa penugasan yang sesuai akan
            dilewati.
          </Text>
          <Select
            label="Salin dari semester"
            data={copySemesters}
            value={sourceSemesterId || null}
            onChange={(value) => {
              const nextSemester = value || '';
              setSourceSemesterId(nextSemester);
              setSourceClassId(suggestedSourceClass(nextSemester));
            }}
            allowDeselect={false}
          />
          <Select
            label="Rombel asal"
            data={sourceClasses}
            value={sourceClassId || null}
            onChange={(value) => setSourceClassId(value || '')}
            allowDeselect={false}
            searchable
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCopyOpened(false)} disabled={saving}>
              Batal
            </Button>
            <Button
              leftSection={<IconCopy size={16} />}
              onClick={copySchedule}
              loading={saving}
              disabled={!sourceSemesterId || !sourceClassId}
            >
              Salin jadwal
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={slotEditing !== undefined}
        onClose={() => !saving && setSlotEditing(undefined)}
        centered
        title={slotEditing ? 'Ubah slot waktu' : 'Tambah slot waktu'}
      >
        <form onSubmit={saveSlot}>
          <Stack>
            <TextInput
              label="Nama slot"
              placeholder="Contoh: JP 1 atau Istirahat"
              value={slotForm.name}
              onChange={(event) => setSlotForm({ ...slotForm, name: event.currentTarget.value })}
              required
            />
            <Group grow align="start">
              <TimePicker
                label="Jam mulai"
                value={slotForm.start_time}
                onChange={(value) => setSlotForm({ ...slotForm, start_time: value })}
                format="24h"
                withDropdown
                minutesStep={5}
                hoursInputLabel="Jam mulai"
                minutesInputLabel="Menit mulai"
                required
              />
              <TimePicker
                label="Jam selesai"
                value={slotForm.end_time}
                onChange={(value) => setSlotForm({ ...slotForm, end_time: value })}
                format="24h"
                withDropdown
                minutesStep={5}
                hoursInputLabel="Jam selesai"
                minutesInputLabel="Menit selesai"
                required
              />
            </Group>
            <NumberInput
              label="Urutan"
              min={1}
              max={100}
              allowDecimal={false}
              value={slotForm.slot_order}
              onChange={(value) => setSlotForm({ ...slotForm, slot_order: Number(value) || 1 })}
              required
            />
            <Paper withBorder p="md">
              <Stack gap="sm">
                <Switch
                  label="Slot istirahat"
                  description="Slot ditampilkan pada grid tetapi tidak dapat diisi pelajaran."
                  checked={slotForm.is_break}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, is_break: event.currentTarget.checked })
                  }
                />
                <Switch
                  label="Status aktif"
                  checked={slotForm.is_active}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, is_active: event.currentTarget.checked })
                  }
                />
              </Stack>
            </Paper>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setSlotEditing(undefined)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" leftSection={<IconCheck size={16} />} loading={saving}>
                Simpan
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ConfirmationDialog
        opened={confirmingRemoval}
        onClose={() => setConfirmingRemoval(false)}
        title="Hapus jadwal?"
        confirmLabel="Hapus jadwal"
        loading={saving}
        onConfirm={removeSchedule}
      >
        <Text size="sm">
          Jadwal <b>{data?.assignments.find((item) => item.value === assignmentId)?.label}</b> pada
          hari {cell ? weekdayName(cell.weekday) : ''}, slot{' '}
          {data?.slots.find((slot) => slot.id === cell?.time_slot_id)?.name} akan dihapus. Periksa
          kembali sebelum melanjutkan.
        </Text>
      </ConfirmationDialog>
      <ConfirmationDialog
        opened={!!slotRemoving}
        onClose={() => !saving && setSlotRemoving(null)}
        title="Hapus slot waktu?"
        loading={saving}
        onConfirm={removeSlot}
        confirmLabel="Hapus"
      >
        <Text>
          Slot{' '}
          <Text component="span" fw={700}>
            {slotRemoving?.name}
          </Text>{' '}
          tidak dapat dihapus jika sudah digunakan pada jadwal.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
