'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconLogin,
  IconQrcode,
  IconSearch,
  IconUserCheck,
  IconUserX,
  IconUsers,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { moduleMutation } from '@/hooks/use-module-list';
import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';
import styles from './checkin-manager.module.css';

type CheckinStatus = 'present' | 'late' | 'absent';
type Row = {
  id: string;
  nis: string;
  name: string;
  checkin_id: string | null;
  status: CheckinStatus | null;
  checked_in_at: string | null;
  note: string;
};
type Option = { value: string; label: string };
const today = () => new Date().toLocaleDateString('en-CA');

export function CheckinManager({
  writable,
  personType = 'student',
  embedded = false,
}: {
  writable: boolean;
  personType?: 'student' | 'teacher';
  embedded?: boolean;
}) {
  const isTeacher = personType === 'teacher';
  const endpoint = isTeacher ? '/api/modules/teacher-checkins' : '/api/modules/student-checkins';
  const [date, setDate] = useState(today);
  const [classId, setClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<Option[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dateNotice, setDateNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingCheckin, setPendingCheckin] = useState<{
    person: Row;
    status: CheckinStatus;
  } | null>(null);
  const scrollPositionRef = useRef<{ left: number; top: number } | null>(null);

  const reload = useCallback(
    async ({ showLoading = true } = {}) => {
      if (showLoading) setLoading(true);
      try {
        const params = new URLSearchParams({ date });
        if (classId && !isTeacher) params.set('class_id', classId);
        const response = await fetch(`${endpoint}?${params}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setClasses(result.options?.class_id || []);
        if (!isTeacher) setClassId(result.selected?.class_id || null);
        setRows(result.rows);
        setDateNotice(result.date_notice || '');
        setError('');
      } catch (cause) {
        setRows([]);
        setDateNotice('');
        setError(cause instanceof Error ? cause.message : 'Gagal memuat data cek-in.');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [classId, date, endpoint, isTeacher],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ date });
    if (classId && !isTeacher) params.set('class_id', classId);
    fetch(`${endpoint}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setClasses(result.options?.class_id || []);
        if (!isTeacher) setClassId(result.selected?.class_id || null);
        setRows(result.rows);
        setDateNotice(result.date_notice || '');
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setRows([]);
        setDateNotice('');
        setError(cause instanceof Error ? cause.message : 'Gagal memuat data cek-in.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, classId, endpoint, isTeacher]);

  useEffect(() => {
    const timer = window.setInterval(() => void reload({ showLoading: false }), 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.nis} ${row.name}`.toLowerCase().includes(query.toLowerCase()) &&
          (statusFilter === 'all' ||
            (statusFilter === 'pending' ? !row.status : row.status === statusFilter)),
      ),
    [rows, query, statusFilter],
  );
  const totals = useMemo(
    () =>
      rows.reduce(
        (value, row) => ({
          ...value,
          [row.status || 'pending']: value[row.status || 'pending'] + 1,
        }),
        { present: 0, late: 0, absent: 0, pending: 0 },
      ),
    [rows],
  );
  const checkin = async (person: Row, status: CheckinStatus) => {
    if (saving || !writable) return;
    scrollPositionRef.current = { left: window.scrollX, top: window.scrollY };
    setSaving(person.id);
    try {
      await moduleMutation(endpoint, 'POST', {
        [isTeacher ? 'teacher_id' : 'student_id']: person.id,
        attendance_date: date,
        status,
        note: person.note || '',
      });
      notifications.show({
        title:
          status === 'present'
            ? 'Cek-in berhasil'
            : status === 'late'
              ? 'Keterlambatan dicatat'
              : 'Ketidakhadiran dicatat',
        message: person.name,
        color: status === 'present' ? 'green' : status === 'late' ? 'yellow' : 'red',
      });
      await reload({ showLoading: false });
      setPendingCheckin(null);
    } catch (cause) {
      notifications.show({
        title: 'Cek-in gagal',
        message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setSaving(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const position = scrollPositionRef.current;
          if (position) window.scrollTo(position.left, position.top);
          scrollPositionRef.current = null;
        });
      });
    }
  };
  const requestCheckin = (person: Row, status: CheckinStatus) => {
    if (!saving) setPendingCheckin({ person, status });
  };

  return (
    <>
      {!embedded && (
        <PageHeading
          eyebrow="KEHADIRAN HARIAN"
          title={`Check-in ${isTeacher ? 'guru' : 'murid'}`}
          description={
            isTeacher
              ? 'Catat kedatangan guru, pantau keterlambatan, dan periksa kehadiran harian.'
              : 'Catat kedatangan murid, pantau keterlambatan, dan periksa kehadiran harian per rombel.'
          }
          action={
            writable ? (
              <Button
                component={Link}
                href="/checkins/scanner"
                leftSection={<IconQrcode size={18} />}
              >
                Buka scanner
              </Button>
            ) : undefined
          }
        />
      )}
      <Paper withBorder p="lg" mb="md" className={styles.controlPanel}>
        <Group justify="space-between" align="end" wrap="wrap">
          <Group align="end">
            <ThemeIcon variant="light" size={44} radius="md" className={styles.controlIcon}>
              <IconLogin size={21} />
            </ThemeIcon>
            <DateInput
              label="Tanggal cek-in"
              value={date || null}
              disabled={saving !== null || loading}
              onChange={(value) => {
                if (value && value !== date) {
                  setLoading(true);
                  setDate(value);
                }
              }}
              valueFormat="D MMMM YYYY"
              locale="id"
              leftSection={<IconCalendar size={16} />}
              w={220}
            />
            {!isTeacher && (
              <Select
                label="Rombel"
                placeholder="Pilih rombel"
                data={classes}
                value={classId}
                disabled={saving !== null || loading}
                onChange={(value) => {
                  if (value !== classId) {
                    setLoading(true);
                    setClassId(value);
                  }
                }}
                searchable
                w={280}
              />
            )}
          </Group>
          <Button
            variant="default"
            onClick={() => void reload()}
            disabled={saving !== null}
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
      {dateNotice ? (
        <Alert color="orange" mb="md" icon={<IconCalendar size={18} />}>
          {dateNotice} Pilih tanggal yang berada dalam periode tersebut untuk menampilkan murid.
        </Alert>
      ) : null}
      <Paper withBorder p="lg" className={styles.listPanel}>
        <Group justify="space-between" mb="md" wrap="wrap">
          <div>
            <Title order={3}>Daftar kedatangan</Title>
            <Text size="sm" c="dimmed">
              Catat status Hadir, Terlambat, atau Tidak hadir untuk setiap{' '}
              {isTeacher ? 'guru' : 'siswa'}.
            </Text>
          </div>
          <Text size="sm" c="dimmed">
            {rows.length} {isTeacher ? 'guru' : 'siswa'} terdaftar
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} className={styles.summaryGrid} mb="lg">
          <Paper withBorder className={styles.summaryCard}>
            <ThemeIcon color="blue" variant="light" radius="md">
              <IconUserCheck size={17} />
            </ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed" fw={600}>
                SUDAH HADIR
              </Text>
              <Text fw={800} size="xl" c="blue">
                {totals.present}
              </Text>
            </Box>
          </Paper>
          <Paper withBorder className={styles.summaryCard}>
            <ThemeIcon color="yellow" variant="light" radius="md">
              <IconClock size={17} />
            </ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed" fw={600}>
                TERLAMBAT
              </Text>
              <Text fw={800} size="xl" c="yellow">
                {totals.late}
              </Text>
            </Box>
          </Paper>
          <Paper withBorder className={styles.summaryCard}>
            <ThemeIcon color="red" variant="light" radius="md">
              <IconUserX size={17} />
            </ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed" fw={600}>
                TIDAK HADIR
              </Text>
              <Text fw={800} size="xl" c="red">
                {totals.absent}
              </Text>
            </Box>
          </Paper>
          <Paper withBorder className={styles.summaryCard}>
            <ThemeIcon color="gray" variant="light" radius="md">
              <IconUsers size={17} />
            </ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed" fw={600}>
                MENUNGGU
              </Text>
              <Text fw={800} size="xl">
                {totals.pending}
              </Text>
            </Box>
          </Paper>
        </SimpleGrid>
        <Group mb="md" grow align="end">
          <TextInput
            placeholder={`Cari nama atau ${isTeacher ? 'Kode Guru' : 'NIS'}...`}
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Select
            data={[
              { value: 'all', label: 'Semua status' },
              { value: 'pending', label: 'Belum cek-in' },
              { value: 'present', label: 'Hadir' },
              { value: 'late', label: 'Terlambat' },
              { value: 'absent', label: 'Tidak hadir' },
            ]}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || 'all')}
          />
        </Group>
        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : visibleRows.length === 0 ? (
          <Alert color="gray" icon={<IconUsers size={18} />}>
            {isTeacher ? 'Tidak ada guru aktif.' : 'Tidak ada siswa aktif pada rombel ini.'}
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={680} className={styles.checkinTable}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{isTeacher ? 'Kode Guru' : 'NIS'}</Table.Th>
                  <Table.Th>Nama {isTeacher ? 'guru' : 'siswa'}</Table.Th>
                  <Table.Th>Status cek-in</Table.Th>
                  <Table.Th>Waktu</Table.Th>
                  <Table.Th>Catatan</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleRows.map((person) => (
                  <Table.Tr key={person.id}>
                    <Table.Td>{person.nis}</Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon
                          size={28}
                          fz="xs"
                          fw={600}
                          radius="xl"
                          variant="light"
                          color={
                            person.status === 'late'
                              ? 'yellow'
                              : person.status === 'present'
                                ? 'blue'
                                : person.status === 'absent'
                                  ? 'red'
                                  : 'gray'
                          }
                        >
                          {person.name.slice(0, 1).toUpperCase()}
                        </ThemeIcon>
                        <Text size="xs" fw={600}>
                          {person.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {person.status ? (
                        <Badge
                          color={
                            person.status === 'present'
                              ? 'blue'
                              : person.status === 'late'
                                ? 'yellow'
                                : 'red'
                          }
                          variant="light"
                        >
                          {person.status === 'present'
                            ? 'Hadir'
                            : person.status === 'late'
                              ? 'Terlambat'
                              : 'Tidak hadir'}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Belum cek-in
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {person.checked_in_at && person.status !== 'absent'
                          ? new Intl.DateTimeFormat('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Jakarta',
                            }).format(new Date(`${person.checked_in_at}Z`))
                          : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {person.note || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        {writable ? (
                          <>
                            <Button
                              size="xs"
                              color="green"
                              variant={person.status === 'present' ? 'filled' : 'light'}
                              leftSection={<IconCheck size={14} />}
                              loading={saving === person.id}
                              disabled={saving !== null && saving !== person.id}
                              onClick={() => requestCheckin(person, 'present')}
                            >
                              Hadir
                            </Button>
                            <Button
                              size="xs"
                              color="yellow"
                              variant={person.status === 'late' ? 'filled' : 'light'}
                              leftSection={<IconClock size={14} />}
                              loading={saving === person.id}
                              disabled={saving !== null && saving !== person.id}
                              onClick={() => requestCheckin(person, 'late')}
                            >
                              Terlambat
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant={person.status === 'absent' ? 'filled' : 'light'}
                              leftSection={<IconUserX size={14} />}
                              loading={saving === person.id}
                              disabled={saving !== null && saving !== person.id}
                              onClick={() => requestCheckin(person, 'absent')}
                            >
                              Tidak hadir
                            </Button>
                          </>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
      <ConfirmationDialog
        opened={pendingCheckin !== null}
        onClose={() => setPendingCheckin(null)}
        title="Konfirmasi status kehadiran"
        confirmLabel={
          pendingCheckin?.status === 'present'
            ? 'Tandai hadir'
            : pendingCheckin?.status === 'late'
              ? 'Tandai terlambat'
              : 'Tandai tidak hadir'
        }
        color={
          pendingCheckin?.status === 'present'
            ? 'green'
            : pendingCheckin?.status === 'late'
              ? 'yellow'
              : 'red'
        }
        loading={saving !== null}
        onConfirm={() => {
          if (pendingCheckin) return checkin(pendingCheckin.person, pendingCheckin.status);
        }}
      >
        <Text size="sm">
          {pendingCheckin?.person.status ? (
            <>
              Status <b>{pendingCheckin.person.name}</b> pada tanggal {date} akan diubah dari{' '}
              <b>
                {pendingCheckin.person.status === 'present'
                  ? 'hadir'
                  : pendingCheckin.person.status === 'late'
                    ? 'terlambat'
                    : 'tidak hadir'}
              </b>{' '}
              menjadi{' '}
              <b>
                {pendingCheckin.status === 'present'
                  ? 'hadir'
                  : pendingCheckin.status === 'late'
                    ? 'terlambat'
                    : 'tidak hadir'}
              </b>
              .
            </>
          ) : (
            <>
              Tandai <b>{pendingCheckin?.person.name}</b> sebagai{' '}
              <b>
                {pendingCheckin?.status === 'present'
                  ? 'hadir'
                  : pendingCheckin?.status === 'late'
                    ? 'terlambat'
                    : 'tidak hadir'}
              </b>{' '}
              untuk tanggal {date}?
            </>
          )}
        </Text>
      </ConfirmationDialog>
    </>
  );
}
