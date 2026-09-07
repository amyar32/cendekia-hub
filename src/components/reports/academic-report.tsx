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
  school: { name: string; code: string; npsn: string; address: string } | null;
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

const exportPalette = {
  brand: 'FFE15F37',
  brandStrong: 'FFC94E29',
  brandSoft: 'FFFCEFE9',
  ink: 'FF58595B',
  muted: 'FF858587',
  line: 'FFEBE7E4',
  stripe: 'FFFAF8F7',
};

const exportStatusColors: Record<string, string> = {
  active: 'FFFCEFE9',
  promoted: 'FFFFF4F0',
  retained: 'FFFAF8F7',
  graduated: 'FFFFE4DA',
  withdrawn: 'FFFFC6B4',
};

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

function exportTimestamp() {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(),
  );
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
  const reportPeriod = selectedYear || 'Semua tahun ajaran';
  const reportClass = selectedClass || 'Semua rombel';
  const reportStatus =
    data?.options.status.find((option) => option.value === status)?.label || 'Semua status';
  const schoolName = data?.school?.name || 'Cendekia Hub';
  const schoolIdentifiers = [data?.school?.npsn && `NPSN ${data.school.npsn}`, data?.school?.code]
    .filter(Boolean)
    .join('   •   ');
  const schoolAddress = data?.school?.address || '';
  const schoolHeaderInfo = [schoolIdentifiers, schoolAddress].filter(Boolean).join('   •   ');
  const pdfSchoolHeaderInfo =
    schoolHeaderInfo.length > 132 ? `${schoolHeaderInfo.slice(0, 129)}…` : schoolHeaderInfo;
  const hasFilters = Boolean(classId || status || query);

  const downloadExcel = async () => {
    if (!data?.rows.length) return;
    setExporting('excel');
    try {
      const generatedAt = exportTimestamp();
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Laporan Akademik');
      worksheet.mergeCells(1, 1, 1, reportColumns.length);
      worksheet.getCell('A1').value = schoolName;
      worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: exportPalette.brandStrong },
      };
      worksheet.getCell('A1').alignment = { vertical: 'middle' };
      worksheet.getRow(1).height = 30;
      worksheet.mergeCells(2, 1, 2, reportColumns.length);
      worksheet.getCell('A2').value = schoolHeaderInfo;
      worksheet.getCell('A2').font = { size: 10, color: { argb: exportPalette.muted } };
      worksheet.getCell('A2').alignment = { vertical: 'middle', wrapText: true };
      worksheet.getRow(2).height = 30;
      worksheet.mergeCells(3, 1, 3, reportColumns.length);
      worksheet.getCell('A3').value = reportTitle;
      worksheet.getCell('A3').font = { bold: true, size: 12, color: { argb: exportPalette.ink } };
      worksheet.getRow(3).height = 22;
      worksheet.mergeCells(4, 1, 4, reportColumns.length);
      worksheet.getCell('A4').value =
        `Periode: ${reportPeriod}   •   Rombel: ${reportClass}   •   Status: ${reportStatus}   •   Total murid: ${data.summary.total || 0}   •   Diekspor: ${generatedAt}`;
      worksheet.getCell('A4').font = {
        size: 9,
        italic: true,
        color: { argb: exportPalette.muted },
      };
      worksheet.getRow(4).height = 19;
      const header = worksheet.addRow(reportColumns);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: exportPalette.brand },
      };
      header.alignment = { vertical: 'middle', horizontal: 'center' };
      header.height = 24;
      data.rows.forEach((reportRow, index) => {
        const row = worksheet.addRow(exportRows([reportRow])[0]);
        row.height = 22;
        row.eachCell((cell) => {
          cell.font = { size: 10, color: { argb: exportPalette.ink } };
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.border = {
            bottom: { style: 'thin', color: { argb: exportPalette.line } },
          };
          if (index % 2 === 1) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: exportPalette.stripe },
            };
          }
        });
        row.getCell(3).font = { bold: true, size: 10, color: { argb: exportPalette.ink } };
        row.getCell(8).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: exportStatusColors[reportRow.academic_status] || exportPalette.brandSoft,
          },
        };
      });
      worksheet.columns = [14, 18, 30, 16, 20, 15, 15, 18].map((width) => ({ width }));
      worksheet.autoFilter = { from: 'A5', to: `H${worksheet.rowCount}` };
      worksheet.views = [{ state: 'frozen', ySplit: 5 }];
      worksheet.pageSetup = {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
      };
      worksheet.headerFooter.oddFooter = `&L ${schoolName} &R Halaman &P dari &N`;
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
      const generatedAt = exportTimestamp();
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const autoTable = autoTableModule.default;
      const drawPageHeader = () => {
        pdf.setFillColor(201, 78, 41);
        pdf.rect(0, 0, 297, 27, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.text(schoolName.toUpperCase(), 14, 12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.text(pdfSchoolHeaderInfo || 'Laporan Akademik Murid', 14, 19);
        pdf.text(`Total ${data.summary.total || 0} murid`, 283, 15, { align: 'right' });
        pdf.setTextColor(71, 85, 105);
        pdf.setFontSize(8);
        pdf.text(`LAPORAN AKADEMIK MURID  •  ${reportPeriod}`, 14, 35);
        pdf.text(`Rombel: ${reportClass}   •   Status: ${reportStatus}`, 14, 39);
        pdf.text(`Dibuat ${generatedAt}`, 283, 39, { align: 'right' });
      };
      drawPageHeader();
      autoTable(pdf, {
        head: [reportColumns],
        body: exportRows(data.rows),
        startY: 45,
        margin: { top: 45, right: 14, bottom: 18, left: 14 },
        theme: 'plain',
        styles: {
          fontSize: 7.5,
          cellPadding: 2.4,
          textColor: [88, 89, 91],
          lineColor: [235, 231, 228],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [225, 95, 55],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: { fillColor: [250, 248, 247] },
        columnStyles: {
          0: { cellWidth: 19 },
          1: { cellWidth: 25 },
          2: { cellWidth: 43, fontStyle: 'bold' },
        },
        didDrawPage: ({ pageNumber }) => {
          if (pageNumber > 1) drawPageHeader();
          pdf.setFontSize(7);
          pdf.setTextColor(110);
          pdf.text(`${schoolName}  •  Halaman ${pageNumber}`, 283, 204, { align: 'right' });
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
