'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
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
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabaseOff, IconRefresh, IconSearch } from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './academic-report.module.css';

type Option = { value: string; label: string };
type ReportRow = {
  id: string;
  nis: string;
  nisn: string;
  name: string;
  class_name: string;
  grade_name: string;
  start_date: string;
  end_date?: string;
  status_label: string;
  academic_status: string;
};
type ReportData = {
  rows: ReportRow[];
  summary: Record<string, number>;
  selected: { academic_year_id: string; class_id: string; status: string };
  options: { academic_year_id: Option[]; class_id: Option[]; status: Option[] };
};

export function AcademicReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [year, setYear] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year_id: year,
        class_id: classId,
        status,
        q: query,
      });
      const response = await fetch(`/api/modules/academic-reports?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      if (!year) setYear(result.selected.academic_year_id);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Laporan gagal dimuat',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setLoading(false);
    }
  }, [year, classId, status, query]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Stack gap="lg">
      <PageHeading
        eyebrow="LAPORAN"
        title="Laporan Akademik Murid"
        description="Data penempatan dibaca dari riwayat pada tahun ajaran yang dipilih."
      />

      <Paper component="section" className={styles.panel} withBorder>
        <div className={styles.toolbar}>
          <Stack gap={5}>
            <Title order={3}>Filter laporan</Title>
            <Text variant="caption">Sesuaikan hasil berdasarkan periode, rombel, dan status.</Text>
          </Stack>
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconRefresh size={16} />}
              onClick={load}
              loading={loading}
            >
              Muat ulang
            </Button>
          </Group>
        </div>

        <Stack p="lg" gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Select
              label="Tahun ajaran"
              required
              searchable
              placeholder="Pilih tahun ajaran"
              data={data?.options.academic_year_id || []}
              value={year}
              onChange={(value) => {
                setYear(value || '');
                setClassId('');
              }}
              leftSection={<IconSearch size={16} />}
            />
            <Select
              label="Rombel"
              clearable
              searchable
              placeholder="Semua rombel"
              data={data?.options.class_id || []}
              value={classId}
              onChange={(value) => setClassId(value || '')}
            />
            <Select
              label="Status akademik"
              clearable
              placeholder="Semua status"
              data={data?.options.status || []}
              value={status}
              onChange={(value) => setStatus(value || '')}
            />
            <TextInput
              label="Cari murid"
              placeholder="Nama, NIS, atau NISN"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </SimpleGrid>
        </Stack>
      </Paper>

      <Group gap="sm" className={styles.summaryBar}>
        <Badge size="lg" variant="light">
          Total {data?.summary.total || 0}
        </Badge>
        <Badge size="lg" variant="light" color="green">
          Aktif {data?.summary.active || 0}
        </Badge>
        <Badge size="lg" variant="light" color="blue">
          Naik {data?.summary.promoted || 0}
        </Badge>
        <Badge size="lg" variant="light" color="orange">
          Tinggal {data?.summary.retained || 0}
        </Badge>
        <Badge size="lg" variant="light" color="grape">
          Lulus {data?.summary.graduated || 0}
        </Badge>
      </Group>

      <Paper component="section" className={styles.tablePanel} withBorder>
        {loading ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <Loader size="sm" />
            <Text variant="description">Memuat laporan...</Text>
          </Stack>
        ) : data && data.rows.length === 0 ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <div
              style={{
                borderRadius: 16,
                padding: 17,
                background: 'var(--app-color-brand-soft)',
                display: 'inline-flex',
                color: 'var(--app-color-brand)',
              }}
            >
              <IconDatabaseOff size={32} />
            </div>
            <Title order={3}>Data tidak ditemukan</Title>
            <Text variant="description">Tidak ada data untuk filter yang dipilih.</Text>
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={780}>
            <Table striped highlightOnHover verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>NIS</Table.Th>
                  <Table.Th>Nama</Table.Th>
                  <Table.Th>Tingkat</Table.Th>
                  <Table.Th>Rombel</Table.Th>
                  <Table.Th>Mulai</Table.Th>
                  <Table.Th>Selesai</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{row.nis}</Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {row.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{row.grade_name}</Table.Td>
                    <Table.Td>{row.class_name}</Table.Td>
                    <Table.Td>{row.start_date}</Table.Td>
                    <Table.Td>{row.end_date || '—'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{row.status_label}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </Stack>
  );
}
