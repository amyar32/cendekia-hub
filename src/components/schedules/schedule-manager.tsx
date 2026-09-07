'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type Option = { value: string; label: string };
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
  teaching_assignment_id: string;
  semester_id: string;
  time_slot_id: string;
  weekday: number;
  subject_name: string;
  subject_code: string;
  teacher_name: string;
  class_name: string;
};
type ScheduleResponse = {
  entries: Entry[];
  slots: Slot[];
  assignments: Option[];
  selected: Record<string, string>;
  options: Record<string, Option[]>;
};

const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
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
  const [sourceSemesterId, setSourceSemesterId] = useState('');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotRevision, setSlotRevision] = useState(0);
  const [slotEditing, setSlotEditing] = useState<Slot | null | undefined>(undefined);
  const [slotRemoving, setSlotRemoving] = useState<Slot | null>(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm);

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

  const entryMap = useMemo(
    () => new Map(data?.entries.map((entry) => [`${entry.weekday}:${entry.time_slot_id}`, entry])),
    [data?.entries],
  );
  const otherSemesters = (data?.options.semester_id || []).filter(
    (option) => option.value !== semesterId,
  );

  function openCell(weekday: number, timeSlotId: string, entry?: Entry) {
    if (!writable) return;
    setCell({ weekday, time_slot_id: timeSlotId });
    setEditing(entry || null);
    setAssignmentId(entry?.teaching_assignment_id || '');
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (!cell || !semesterId) return;
    setSaving(true);
    try {
      await moduleMutation('/api/modules/schedules', editing ? 'PATCH' : 'POST', {
        id: editing?.id,
        teaching_assignment_id: assignmentId,
        semester_id: semesterId,
        time_slot_id: cell.time_slot_id,
        weekday: cell.weekday,
      });
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
      await moduleMutation('/api/modules/schedules', 'DELETE', { id: editing.id });
      setEditing(undefined);
      setCell(null);
      reload();
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
    if (!sourceSemesterId || !semesterId || !entityId) return;
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
                {writable && otherSemesters.length > 0 && (
                  <Tooltip
                    label={view === 'teacher' ? 'Salin jadwal tersedia pada mode Per Rombel' : ''}
                    disabled={view === 'class'}
                  >
                    <Button
                      className={styles.copyButton}
                      variant="light"
                      leftSection={<IconCopy size={16} />}
                      onClick={() => {
                        setSourceSemesterId(otherSemesters[0]?.value || '');
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
                <div className={styles.scheduleGrid}>
                  <div className={`${styles.headerCell} ${styles.timeHeader}`}>WAKTU</div>
                  {days.map((day) => (
                    <div className={styles.headerCell} key={day}>
                      {day}
                    </div>
                  ))}
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
                      {days.map((day, index) => {
                        const entry = entryMap.get(`${index + 1}:${slot.id}`);
                        if (slot.is_break)
                          return (
                            <div className={styles.breakCell} key={day}>
                              Istirahat
                            </div>
                          );
                        return (
                          <button
                            type="button"
                            key={day}
                            className={`${styles.scheduleCell} ${entry ? styles.filledCell : ''}`}
                            onClick={() => openCell(index + 1, slot.id, entry)}
                            disabled={!writable}
                          >
                            {entry ? (
                              <>
                                <Text fw={700} size="xs" lineClamp={2}>
                                  {entry.subject_name}
                                </Text>
                                <Text variant="caption" lineClamp={1}>
                                  {view === 'class' ? entry.teacher_name : entry.class_name}
                                </Text>
                                <Badge size="xs" variant="light" mt={5}>
                                  {entry.subject_code}
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
                {days.map((day, index) => (
                  <section className={styles.daySection} key={day}>
                    <Text className={styles.dayTitle} fw={700} size="sm">
                      {day}
                    </Text>
                    {data.slots.map((slot) => {
                      const entry = entryMap.get(`${index + 1}:${slot.id}`);
                      return (
                        <button
                          type="button"
                          key={slot.id}
                          className={`${styles.mobileSlot} ${entry ? styles.filledCell : ''} ${slot.is_break ? styles.mobileBreak : ''}`}
                          onClick={() => !slot.is_break && openCell(index + 1, slot.id, entry)}
                          disabled={!writable || Boolean(slot.is_break)}
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
                            ) : entry ? (
                              <>
                                <Text fw={700} size="xs">
                                  {entry.subject_name}
                                </Text>
                                <Text variant="caption">
                                  {view === 'class' ? entry.teacher_name : entry.class_name}
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
                          <Text fw={600} size="sm">
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
        opened={editing !== undefined}
        onClose={() => !saving && setEditing(undefined)}
        centered
        title={editing ? 'Ubah jadwal pelajaran' : 'Tambah jadwal pelajaran'}
      >
        <form onSubmit={saveSchedule}>
          <Stack>
            <Group gap="xs">
              <Badge variant="light">{cell ? days[cell.weekday - 1] : ''}</Badge>
              <Text size="sm" c="dimmed">
                {data?.slots.find((slot) => slot.id === cell?.time_slot_id)?.name}
              </Text>
            </Group>
            <Select
              label="Penugasan mengajar"
              description="Pilihan mengikuti rombel/guru dan semester yang sedang ditampilkan."
              placeholder="Pilih guru dan mata pelajaran"
              data={data?.assignments || []}
              value={assignmentId || null}
              onChange={(value) => setAssignmentId(value || '')}
              searchable
              required
              nothingFoundMessage="Penugasan belum tersedia"
            />
            <Group justify="space-between" mt="md">
              {editing ? (
                <Button
                  type="button"
                  variant="light"
                  color="red"
                  onClick={removeSchedule}
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
        title="Salin jadwal antarsemester"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Jadwal yang sudah ada di semester tujuan tidak ditimpa. Entri bentrok atau tanpa
            penugasan yang sesuai akan dilewati.
          </Text>
          <Select
            label="Salin dari semester"
            data={otherSemesters}
            value={sourceSemesterId || null}
            onChange={(value) => setSourceSemesterId(value || '')}
            allowDeselect={false}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCopyOpened(false)} disabled={saving}>
              Batal
            </Button>
            <Button leftSection={<IconCopy size={16} />} onClick={copySchedule} loading={saving}>
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

      <Modal
        opened={!!slotRemoving}
        onClose={() => !saving && setSlotRemoving(null)}
        centered
        title="Hapus slot waktu?"
      >
        <Text>
          Slot{' '}
          <Text component="span" fw={700}>
            {slotRemoving?.name}
          </Text>{' '}
          tidak dapat dihapus jika sudah digunakan pada jadwal.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setSlotRemoving(null)} disabled={saving}>
            Batal
          </Button>
          <Button color="red" onClick={removeSlot} loading={saving}>
            Hapus
          </Button>
        </Group>
      </Modal>
    </>
  );
}
