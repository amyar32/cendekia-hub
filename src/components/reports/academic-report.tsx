'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
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
import {
  IconDatabaseOff,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
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

const statusColors: Record<string, string> = {
  active: 'green',
  promoted: 'blue',
  retained: 'orange',
  graduated: 'grape',
  withdrawn: 'red',
};

const reportColumns = [
  'NIS',
  'NISN',
  'Nama murid',
  'Tingkat',
  'Rombel',
  'Mulai',
  'Selesai',
  'Status',
];

function formatReportDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(parsed);
}

function exportRows(rows: ReportRow[]) {
  return rows.map((row) => [
    row.nis || '—',
    row.nisn || '—',
    row.name,
    row.grade_name,
    row.class_name,
    formatReportDate(row.start_date),
    formatReportDate(row.end_date),
    row.status_label,
  ]);
}

export function AcademicReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [year, setYear] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
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

  const selectedYear = useMemo(
    () =>
      data?.options.academic_year_id.find(
        (option) => option.value === data.selected.academic_year_id,
      )?.label,
    [data],
  );
  const selectedClass = useMemo(
    () => data?.options.class_id.find((option) => option.value === classId)?.label,
    [classId, data],
  );
  const reportTitle = `Laporan Akademik${selectedYear ? ` — ${selectedYear}` : ''}${selectedClass ? ` — ${selectedClass}` : ''}`;
  const hasFilters = Boolean(classId || status || query);

  const downloadExcel = async () => {
    if (!data?.rows.length) return;
    setExporting('excel');
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Laporan Akademik');
      worksheet.mergeCells(1, 1, 1, reportColumns.length);
      worksheet.getCell('A1').value = reportTitle;
      worksheet.getCell('A1').font = { bold: true, size: 14 };
      worksheet.getCell('A2').value =
        `Diekspor: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`;
      const header = worksheet.addRow(reportColumns);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1971C2' } };
      exportRows(data.rows).forEach((row) => worksheet.addRow(row));
      worksheet.columns = [14, 18, 30, 16, 20, 15, 15, 18].map((width) => ({ width }));
      worksheet.views = [{ state: 'frozen', ySplit: 3 }];
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `laporan-akademik-${data.selected.academic_year_id}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifications.show({
        color: 'green',
        title: 'Excel siap',
        message: 'Laporan berhasil diunduh.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Ekspor gagal',
        message: error instanceof Error ? error.message : 'Tidak dapat membuat Excel.',
      });
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    if (!data?.rows.length) return;
    setExporting('pdf');
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const autoTable = autoTableModule.default;
      pdf.setFontSize(15);
      pdf.text(reportTitle, 14, 16);
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      pdf.text(
        `Total murid: ${data.summary.total || 0}  |  Dicetak ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`,
        14,
        22,
      );
      autoTable(pdf, {
        head: [reportColumns],
        body: exportRows(data.rows),
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [25, 113, 194] },
        columnStyles: { 0: { cellWidth: 19 }, 1: { cellWidth: 25 }, 2: { cellWidth: 43 } },
        didDrawPage: ({ pageNumber }) => {
          pdf.setFontSize(7);
          pdf.setTextColor(110);
          pdf.text(`Halaman ${pageNumber}`, 282, 204, { align: 'right' });
        },
      });
      pdf.save(`laporan-akademik-${data.selected.academic_year_id}.pdf`);
      notifications.show({
        color: 'green',
        title: 'PDF siap',
        message: 'Laporan berhasil diunduh.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Ekspor gagal',
        message: error instanceof Error ? error.message : 'Tidak dapat membuat PDF.',
      });
    } finally {
      setExporting(null);
    }
  };

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
            {hasFilters && (
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconX size={16} />}
                onClick={() => {
                  setClassId('');
                  setStatus('');
                  setQuery('');
                }}
              >
                Reset filter
              </Button>
            )}
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

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} className={styles.summaryGrid}>
        {[
          ['Total murid', 'total', 'dark'],
          ['Aktif', 'active', 'green'],
          ['Naik kelas', 'promoted', 'blue'],
          ['Tinggal kelas', 'retained', 'orange'],
          ['Lulus', 'graduated', 'grape'],
          ['Pindah / keluar', 'withdrawn', 'red'],
        ].map(([label, key, color]) => (
          <Paper key={key} className={styles.summaryCard} withBorder>
            <Text size="xs" c="dimmed" fw={600}>
              {label}
            </Text>
            <Text size="xl" fw={800} c={color}>
              {data?.summary[key] || 0}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>

      <Paper component="section" className={styles.tablePanel} withBorder>
        <div className={styles.tableHeader}>
          <Group gap="sm">
            <span className={styles.tableIcon}>
              <IconUsers size={18} />
            </span>
            <div>
              <Title order={3}>Daftar murid</Title>
              <Text size="sm" c="dimmed">
                {reportTitle}
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconFileSpreadsheet size={16} />}
              onClick={downloadExcel}
              loading={exporting === 'excel'}
              disabled={!data?.rows.length}
            >
              Excel
            </Button>
            <Button
              leftSection={<IconFileTypePdf size={16} />}
              onClick={downloadPdf}
              loading={exporting === 'pdf'}
              disabled={!data?.rows.length}
            >
              PDF
            </Button>
          </Group>
        </div>
        <Divider />
        {loading && !data ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <Loader size="sm" />
            <Text variant="description">Memuat laporan...</Text>
          </Stack>
        ) : !data || data.rows.length === 0 ? (
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
                  <Table.Th>NISN</Table.Th>
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
                    <Table.Td>{row.nisn || '—'}</Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {row.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{row.grade_name}</Table.Td>
                    <Table.Td>{row.class_name}</Table.Td>
                    <Table.Td>{formatReportDate(row.start_date)}</Table.Td>
                    <Table.Td>{formatReportDate(row.end_date)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={statusColors[row.academic_status] || 'gray'}>
                        {row.status_label}
                      </Badge>
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
