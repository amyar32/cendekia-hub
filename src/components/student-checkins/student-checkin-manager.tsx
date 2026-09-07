'use client';

import { useEffect, useMemo, useState } from 'react';
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
  IconSearch,
  IconUserCheck,
  IconUsers,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { moduleMutation } from '@/hooks/use-module-list';
import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';
import styles from './student-checkin-manager.module.css';

type Row = {
  id: string;
  nis: string;
  name: string;
  checkin_id: string | null;
  status: 'present' | 'late' | null;
  checked_in_at: string | null;
  note: string;
};
type Option = { value: string; label: string };
const today = () => new Date().toLocaleDateString('en-CA');

export function StudentCheckinManager({ writable }: { writable: boolean }) {
  const [date, setDate] = useState(today);
  const [classId, setClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<Option[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingCheckin, setPendingCheckin] = useState<{
    student: Row;
    status: 'present' | 'late';
  } | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (classId) params.set('class_id', classId);
      const response = await fetch(`/api/modules/student-checkins?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setClasses(result.options.class_id);
      setClassId(result.selected.class_id || null);
      setRows(result.rows);
      setError('');
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'Gagal memuat data cek-in.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ date });
    if (classId) params.set('class_id', classId);
    fetch(`/api/modules/student-checkins?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setClasses(result.options.class_id);
        setClassId(result.selected.class_id || null);
        setRows(result.rows);
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setRows([]);
        setError(cause instanceof Error ? cause.message : 'Gagal memuat data cek-in.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, classId]);

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
        { present: 0, late: 0, pending: 0 },
      ),
    [rows],
  );
  const checkin = async (student: Row, status: 'present' | 'late') => {
    if (saving || !writable) return;
    setSaving(student.id);
    try {
      await moduleMutation('/api/modules/student-checkins', 'POST', {
        student_id: student.id,
        attendance_date: date,
        status,
        note: student.note || '',
      });
      notifications.show({
        title: status === 'present' ? 'Cek-in berhasil' : 'Keterlambatan dicatat',
        message: student.name,
        color: status === 'present' ? 'green' : 'yellow',
      });
      await reload();
      setPendingCheckin(null);
    } catch (cause) {
      notifications.show({
        title: 'Cek-in gagal',
        message: cause instanceof Error ? cause.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setSaving(null);
    }
  };
  const requestCheckin = (student: Row, status: 'present' | 'late') => {
    if (student.status && student.status !== status) setPendingCheckin({ student, status });
    else void checkin(student, status);
  };

  return (
    <>
      <PageHeading
        eyebrow="KEHADIRAN HARIAN"
        title="Cek-in siswa"
        description="Catat kedatangan siswa, pantau keterlambatan, dan periksa kehadiran harian per rombel."
      />
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
      <Paper withBorder p="lg" className={styles.listPanel}>
        <Group justify="space-between" mb="md" wrap="wrap">
          <div>
            <Title order={3}>Daftar kedatangan</Title>
            <Text size="sm" c="dimmed">
              Klik Hadir atau Terlambat saat siswa tiba di sekolah.
            </Text>
          </div>
          <Text size="sm" c="dimmed">
            {rows.length} siswa terdaftar
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, xs: 3 }} className={styles.summaryGrid} mb="lg">
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
            placeholder="Cari nama atau NIS..."
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
            Tidak ada siswa aktif pada rombel ini.
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={680} className={styles.checkinTable}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>NIS</Table.Th>
                  <Table.Th>Nama siswa</Table.Th>
                  <Table.Th>Status cek-in</Table.Th>
                  <Table.Th>Waktu</Table.Th>
                  <Table.Th>Catatan</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleRows.map((student) => (
                  <Table.Tr key={student.id}>
                    <Table.Td>{student.nis}</Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon
                          size={28}
                          fz="xs"
                          fw={600}
                          radius="xl"
                          variant="light"
                          color={
                            student.status === 'late'
                              ? 'yellow'
                              : student.status === 'present'
                                ? 'blue'
                                : 'gray'
                          }
                        >
                          {student.name.slice(0, 1).toUpperCase()}
                        </ThemeIcon>
                        <Text size="xs" fw={600}>
                          {student.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {student.status ? (
                        <Badge
                          color={student.status === 'present' ? 'blue' : 'yellow'}
                          variant="light"
                        >
                          {student.status === 'present' ? 'Hadir' : 'Terlambat'}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Belum cek-in
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {student.checked_in_at
                          ? new Intl.DateTimeFormat('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Jakarta',
                            }).format(new Date(`${student.checked_in_at}Z`))
                          : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {student.note || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        {writable ? (
                          <>
                            <Button
                              size="xs"
                              variant={student.status === 'present' ? 'filled' : 'light'}
                              leftSection={<IconCheck size={14} />}
                              loading={saving === student.id}
                              disabled={saving !== null && saving !== student.id}
                              onClick={() => requestCheckin(student, 'present')}
                            >
                              Hadir
                            </Button>
                            <Button
                              size="xs"
                              color="yellow"
                              variant={student.status === 'late' ? 'filled' : 'light'}
                              leftSection={<IconClock size={14} />}
                              loading={saving === student.id}
                              disabled={saving !== null && saving !== student.id}
                              onClick={() => requestCheckin(student, 'late')}
                            >
                              Terlambat
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
        title="Ubah status cek-in?"
        confirmLabel="Ubah status"
        color="yellow"
        loading={saving !== null}
        onConfirm={() => {
          if (pendingCheckin) return checkin(pendingCheckin.student, pendingCheckin.status);
        }}
      >
        <Text size="sm">
          <b>{pendingCheckin?.student.name}</b> pada tanggal {date} sudah tercatat{' '}
          {pendingCheckin?.student.status === 'present' ? 'hadir' : 'terlambat'}. Status akan diubah
          menjadi <b>{pendingCheckin?.status === 'present' ? 'hadir' : 'terlambat'}</b>.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
