'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconBook2,
  IconRun,
  IconCalendar,
  IconCheck,
  IconClock,
  IconLock,
  IconUsers,
} from '@tabler/icons-react';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { moduleMutation } from '@/hooks/use-module-list';
import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';
import styles from './attendance-manager.module.css';

type Schedule = {
  schedule_id: string;
  class_name?: string;
  extracurricular_name?: string;
  subject_name: string;
  teacher_name: string;
  slot_name: string;
  start_time: string;
  end_time: string;
  session_id: string | null;
  session_status: 'open' | 'closed' | null;
  student_count: number;
  present_count: number;
};
type AttendanceRecord = {
  id: string;
  student_nis: string;
  student_name: string;
  class_name?: string;
  status: Status;
  note: string;
};
type Status = 'present' | 'late' | 'sick' | 'excused' | 'absent';

const statusOptions = [
  { value: 'present', label: 'Hadir' },
  { value: 'late', label: 'Terlambat' },
  { value: 'sick', label: 'Sakit' },
  { value: 'excused', label: 'Izin' },
  { value: 'absent', label: 'Alpa' },
];
const dateToday = () => new Date().toLocaleDateString('en-CA');

export function AttendanceManager({
  writable,
  kind,
}: {
  writable: boolean;
  kind: 'lesson' | 'extracurricular';
}) {
  const extra = kind === 'extracurricular';
  const endpoint = `/api/modules/${extra ? 'extracurricular-attendance' : 'student-attendance'}`;
  const SessionIcon = extra ? IconRun : IconBook2;
  const scheduleName = (schedule: Schedule) =>
    extra ? schedule.extracurricular_name : `${schedule.subject_name} · ${schedule.class_name}`;
  const [date, setDate] = useState(dateToday);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<Schedule | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [savedRecords, setSavedRecords] = useState('');
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState('');
  const [recordVersion, setRecordVersion] = useState(0);
  const recordsReady = !!selected?.session_id && loadedSession === selected.session_id;
  const dirty = recordsReady && JSON.stringify(records) !== savedRecords;
  const navigate = (action: () => void) => {
    if (saving) return;
    if (dirty) setPendingNavigation(() => action);
    else action();
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${endpoint}?date=${date}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSchedules(result.schedules);
      setSelected(
        (current) =>
          result.schedules.find((item: Schedule) => item.schedule_id === current?.schedule_id) ??
          null,
      );
      setError('');
    } catch (cause) {
      setSchedules([]);
      setError(cause instanceof Error ? cause.message : 'Gagal memuat jadwal.');
    } finally {
      setLoading(false);
    }
  }, [date, endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?date=${date}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSchedules(result.schedules);
        setSelected(
          (current) =>
            result.schedules.find((item: Schedule) => item.schedule_id === current?.schedule_id) ??
            null,
        );
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setSchedules([]);
        setError(cause instanceof Error ? cause.message : 'Gagal memuat jadwal.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, endpoint]);

  useEffect(() => {
    if (!selected?.session_id) return;
    const controller = new AbortController();
    fetch(`${endpoint}?session_id=${selected.session_id}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result.records);
        setSavedRecords(JSON.stringify(result.records));
        setLoadedSession(selected.session_id);
        setRecordsError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setRecordsError(cause instanceof Error ? cause.message : 'Koneksi gagal.');
        notifications.show({
          title: 'Absensi gagal dimuat',
          message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
          color: 'red',
        });
      });
    return () => controller.abort();
  }, [selected?.session_id, endpoint, recordVersion]);

  const isOpen = selected?.session_status === 'open';
  const summary = useMemo(
    () =>
      records.reduce<Record<Status, number>>(
        (totals, record) => {
          totals[record.status]++;
          return totals;
        },
        { present: 0, late: 0, sick: 0, excused: 0, absent: 0 },
      ),
    [records],
  );

  const openSession = async (schedule: Schedule) => {
    setSaving(true);
    try {
      const result = await moduleMutation(endpoint, 'POST', {
        schedule_id: schedule.schedule_id,
        attendance_date: date,
      });
      notifications.show({
        title: 'Sesi dibuka',
        message: 'Daftar siswa telah disiapkan.',
        color: 'green',
      });
      await loadSchedules();
      setStarting(null);
      setLoadedSession(null);
      setSelected({
        ...schedule,
        session_id: result.id,
        session_status: 'open',
        student_count: 0,
        present_count: 0,
      });
    } catch (cause) {
      notifications.show({
        title: 'Sesi tidak dapat dibuka',
        message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };
  const saveRecords = async () => {
    if (!selected?.session_id || !recordsReady || !writable || !isOpen) return;
    setSaving(true);
    try {
      await moduleMutation(endpoint, 'PATCH', {
        action: 'records',
        session_id: selected.session_id,
        records,
      });
      notifications.show({
        title: 'Absensi tersimpan',
        message: 'Perubahan kehadiran berhasil disimpan.',
        color: 'green',
      });
      setSavedRecords(JSON.stringify(records));
      await loadSchedules();
    } catch (cause) {
      notifications.show({
        title: 'Absensi gagal disimpan',
        message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };
  const closeSession = async () => {
    if (!selected?.session_id || !recordsReady || !writable || !isOpen) return;
    setSaving(true);
    try {
      if (dirty) {
        await moduleMutation(endpoint, 'PATCH', {
          action: 'records',
          session_id: selected.session_id,
          records,
        });
        setSavedRecords(JSON.stringify(records));
      }
      await moduleMutation(endpoint, 'PATCH', {
        action: 'close',
        session_id: selected.session_id,
      });
      notifications.show({
        title: 'Sesi ditutup',
        message: 'Guru tidak dapat lagi mengubah absensi sesi ini.',
        color: 'green',
      });
      await loadSchedules();
      setConfirmingClose(false);
    } catch (cause) {
      notifications.show({
        title: 'Sesi gagal ditutup',
        message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };
  const updateRecord = (id: string, patch: Partial<AttendanceRecord>) =>
    setRecords((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <>
      <PageHeading
        eyebrow={extra ? 'KEHADIRAN EKSTRAKURIKULER' : 'KEHADIRAN PELAJARAN'}
        title={extra ? 'Absensi Ekstrakurikuler' : 'Absensi Pelajaran'}
        description={
          extra
            ? 'Catat kehadiran peserta berdasarkan jadwal dan pembina ekstrakurikuler.'
            : 'Buka absensi dari jadwal mengajar dan catat kehadiran siswa per rombel.'
        }
      />
      <Paper withBorder p="lg" mb="md" className={styles.datePanel}>
        <Group justify="space-between" align="end">
          <Group gap="sm" align="end">
            <ThemeIcon variant="light" size={42} radius="md" className={styles.dateIcon}>
              <IconCalendar size={21} />
            </ThemeIcon>
            <DateInput
              label="Tanggal absensi"
              placeholder="Pilih tanggal"
              value={date || null}
              disabled={saving || loading}
              onChange={(value) =>
                value &&
                value !== date &&
                navigate(() => {
                  setLoading(true);
                  setSelected(null);
                  setRecords([]);
                  setLoadedSession(null);
                  setDate(value);
                })
              }
              valueFormat="D MMMM YYYY"
              locale="id"
              w={230}
            />
          </Group>
          <Button
            variant="default"
            onClick={() =>
              navigate(() => {
                setLoadedSession(null);
                setRecordVersion((value) => value + 1);
                void loadSchedules();
              })
            }
            disabled={saving}
            loading={loading}
          >
            Perbarui
          </Button>
        </Group>
      </Paper>
      {error ? (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      ) : null}
      <Paper withBorder p="lg" mb="md" className={styles.schedulePanel}>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>Jadwal pada tanggal terpilih</Title>
            <Text size="sm" c="dimmed">
              Pilih jadwal untuk membuka atau mengisi sesi absensi.
            </Text>
          </div>
          <Badge variant="light">{schedules.length} jadwal</Badge>
        </Group>
        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : schedules.length === 0 ? (
          <Alert color="gray">
            Tidak ada jadwal {extra ? 'ekstrakurikuler' : 'pelajaran'} yang berlaku pada tanggal
            ini.
          </Alert>
        ) : (
          <Stack gap="sm">
            {schedules.map((schedule) => (
              <Paper
                key={schedule.schedule_id}
                withBorder
                p="md"
                className={`${styles.scheduleCard} ${selected?.schedule_id === schedule.schedule_id ? styles.selectedSchedule : ''}`}
              >
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" size={42} radius="md" className={styles.lessonIcon}>
                      <SessionIcon size={21} />
                    </ThemeIcon>
                    <Box>
                      <Group gap={7} mb={3}>
                        <Text fw={700}>{scheduleName(schedule)}</Text>
                        {schedule.session_id ? (
                          <Badge
                            color={schedule.session_status === 'open' ? 'blue' : 'gray'}
                            variant="light"
                          >
                            {schedule.session_status === 'open' ? 'Sedang berlangsung' : 'Selesai'}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            Belum dibuka
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed">
                        <IconClock size={14} className={styles.inlineIcon} /> {schedule.start_time}–
                        {schedule.end_time} · {schedule.slot_name}
                      </Text>
                      <Text size="xs" c="dimmed" mt={2}>
                        {schedule.teacher_name}
                      </Text>
                    </Box>
                  </Group>
                  <Group gap="sm" wrap="nowrap">
                    {schedule.session_id && schedule.session_status === 'open' ? (
                      <Text size="sm" fw={600} c="blue">
                        {schedule.present_count}/{schedule.student_count} hadir
                      </Text>
                    ) : null}
                    {schedule.session_id ? (
                      <Button
                        size="sm"
                        variant={
                          selected?.schedule_id === schedule.schedule_id ? 'filled' : 'light'
                        }
                        disabled={saving}
                        onClick={() =>
                          navigate(() => {
                            setRecordsError('');
                            setLoadedSession(null);
                            setRecordVersion((value) => value + 1);
                            setSelected(schedule);
                          })
                        }
                      >
                        {selected?.schedule_id === schedule.schedule_id
                          ? 'Dipilih'
                          : schedule.session_status === 'closed' || !writable
                            ? 'Lihat absensi'
                            : 'Isi absensi'}
                      </Button>
                    ) : writable ? (
                      <Button
                        size="sm"
                        onClick={() => navigate(() => setStarting(schedule))}
                        loading={saving}
                      >
                        Mulai sesi
                      </Button>
                    ) : null}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>
      {selected?.session_id ? (
        <Paper withBorder p="lg" className={styles.attendancePanel}>
          <Group justify="space-between" mb="md">
            <div>
              <Title order={3}>{scheduleName(selected)}</Title>
              <Text size="sm" c="dimmed">
                {selected.teacher_name} · {date}
              </Text>
            </div>
            <Group>
              <Badge color={isOpen ? 'blue' : 'gray'}>
                {isOpen ? 'Sesi terbuka' : 'Sesi ditutup'}
              </Badge>
              {isOpen && writable ? (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconLock size={16} />}
                  onClick={() => setConfirmingClose(true)}
                  loading={saving}
                  disabled={!recordsReady}
                >
                  Tutup sesi
                </Button>
              ) : null}
            </Group>
          </Group>
          {!recordsReady ? (
            recordsError ? (
              <Alert color="red" title="Absensi gagal dimuat" mb="md">
                {recordsError}
                <Button
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setRecordsError('');
                    setRecordVersion((value) => value + 1);
                  }}
                >
                  Coba lagi
                </Button>
              </Alert>
            ) : (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Memuat kehadiran siswa...
                </Text>
              </Group>
            )
          ) : (
            <>
              <SimpleGrid cols={{ base: 2, sm: 5 }} className={styles.summaryGrid} mb="lg">
                {(
                  [
                    ['present', 'Hadir', 'blue'],
                    ['late', 'Terlambat', 'yellow'],
                    ['sick', 'Sakit', 'cyan'],
                    ['excused', 'Izin', 'violet'],
                    ['absent', 'Alpa', 'red'],
                  ] as const
                ).map(([status, label, color]) => (
                  <Paper key={status} withBorder className={styles.summaryCard}>
                    <Text size="xs" c="dimmed" fw={600}>
                      {label.toUpperCase()}
                    </Text>
                    <Text size="xl" fw={800} c={color}>
                      {summary[status]}
                    </Text>
                  </Paper>
                ))}
              </SimpleGrid>
              <Group justify="space-between" mb="sm">
                <Group gap="xs">
                  <IconUsers size={17} />
                  <Text fw={600}>Daftar kehadiran siswa</Text>
                </Group>
                {isOpen && writable ? (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconCheck size={15} />}
                    disabled={saving || records.length === 0}
                    onClick={() => setConfirmingAll(true)}
                  >
                    Tandai semua hadir
                  </Button>
                ) : null}
              </Group>
              <Table.ScrollContainer minWidth={700} className={styles.attendanceTable}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>NIS</Table.Th>
                      <Table.Th>Nama siswa</Table.Th>
                      {extra && <Table.Th>Rombel</Table.Th>}
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Catatan</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {records.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={extra ? 5 : 4}>
                          <Text ta="center" c="dimmed" py="xl">
                            Belum ada peserta pada sesi ini.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                    {records.map((record) => (
                      <Table.Tr key={record.id}>
                        <Table.Td>{record.student_nis}</Table.Td>
                        <Table.Td fw={600}>{record.student_name}</Table.Td>
                        {extra && <Table.Td>{record.class_name || '—'}</Table.Td>}
                        <Table.Td>
                          <Select
                            aria-label={`Status ${record.student_name}`}
                            data={statusOptions}
                            value={record.status}
                            disabled={!isOpen || !writable || saving}
                            onChange={(value) =>
                              value && updateRecord(record.id, { status: value as Status })
                            }
                            w={145}
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            aria-label={`Catatan ${record.student_name}`}
                            value={record.note}
                            maxLength={500}
                            disabled={!isOpen || !writable || saving}
                            onChange={(event) =>
                              updateRecord(record.id, { note: event.currentTarget.value })
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {isOpen && writable ? (
                <Group justify="flex-end" mt="lg" className={styles.actionBar}>
                  <Text size="sm" c="dimmed" mr="auto">
                    {dirty
                      ? 'Ada perubahan yang belum disimpan.'
                      : 'Semua perubahan sudah tersimpan.'}
                  </Text>
                  <Button
                    leftSection={<IconCheck size={17} />}
                    onClick={() => void saveRecords()}
                    disabled={!dirty || records.length === 0}
                    loading={saving}
                  >
                    Simpan absensi
                  </Button>
                </Group>
              ) : null}
            </>
          )}
        </Paper>
      ) : null}
      <ConfirmationDialog
        opened={starting !== null}
        onClose={() => setStarting(null)}
        title="Mulai sesi absensi?"
        confirmLabel="Mulai sesi"
        color="brand"
        loading={saving}
        onConfirm={() => {
          if (starting) return openSession(starting);
        }}
      >
        <Text fw={700}>{starting && scheduleName(starting)}</Text>
        <Text size="sm" c="dimmed">
          {date} · {starting?.start_time}–{starting?.end_time} · {starting?.teacher_name}
        </Text>
        <Text size="sm">
          Daftar {extra ? 'peserta ekstrakurikuler' : 'siswa aktif pada rombel'} akan disiapkan
          untuk tanggal ini. Periksa jadwal sebelum melanjutkan.
        </Text>
      </ConfirmationDialog>
      <ConfirmationDialog
        opened={confirmingClose}
        onClose={() => setConfirmingClose(false)}
        title="Tutup sesi absensi?"
        confirmLabel={dirty ? 'Simpan dan tutup sesi' : 'Tutup sesi'}
        loading={saving}
        onConfirm={closeSession}
      >
        <Text fw={700}>
          {selected && scheduleName(selected)} · {date}
        </Text>
        <Text size="sm">
          Hadir {summary.present} · Terlambat {summary.late} · Sakit {summary.sick} · Izin{' '}
          {summary.excused} · Alpa {summary.absent}
        </Text>
        <Text size="sm">
          {dirty ? 'Perubahan akan disimpan sebelum sesi ditutup. ' : ''}Setelah ditutup, guru tidak
          dapat lagi mengubah absensi sesi ini.
        </Text>
      </ConfirmationDialog>
      <ConfirmationDialog
        opened={confirmingAll}
        onClose={() => setConfirmingAll(false)}
        title="Tandai semua siswa hadir?"
        confirmLabel="Tandai semua hadir"
        color="brand"
        onConfirm={() => {
          setRecords((items) => items.map((item) => ({ ...item, status: 'present' })));
          setConfirmingAll(false);
        }}
      >
        <Text size="sm">
          Status {records.length} siswa akan diubah menjadi hadir, termasuk siswa yang sudah
          ditandai sakit, izin, terlambat, atau alpa. Perubahan perlu disimpan.
        </Text>
      </ConfirmationDialog>
      <ConfirmationDialog
        opened={pendingNavigation !== null}
        onClose={() => setPendingNavigation(null)}
        title="Tinggalkan perubahan?"
        confirmLabel="Abaikan perubahan"
        onConfirm={() => {
          pendingNavigation?.();
          setPendingNavigation(null);
        }}
      >
        <Text size="sm">
          Ada perubahan absensi yang belum disimpan. Melanjutkan akan mengabaikan perubahan
          tersebut. Pilih Batal untuk kembali dan menyimpan.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
