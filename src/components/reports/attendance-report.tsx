'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconCalendar,
  IconDownload,
  IconPrinter,
  IconRefresh,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { ReportPanelHeader, ReportSummaryCard } from './report-elements';
import styles from './report-common.module.css';

type Option = { value: string; label: string };
type Counts = Record<'total' | 'present' | 'late' | 'sick' | 'excused' | 'absent', number>;
type AttendanceRow = Counts & {
  student_id?: string;
  nis?: string;
  name?: string;
  class_id?: string;
  class_name: string;
  sessions?: number;
  attendance_rate: number;
};
type AttendanceData = {
  metadata: { generated_at: string; school: { name: string } };
  selected: {
    academic_year_id: string;
    semester_id: string;
    class_id: string;
    subject_id: string;
    date_from: string;
    date_to: string;
  };
  options: {
    academic_year_id: Option[];
    semester_id: Option[];
    class_id: Option[];
    subject_id: Option[];
  };
  summary: {
    lesson: Counts;
    sessions: { total: number; open: number; closed: number };
    student_gateway: Pick<Counts, 'total' | 'present' | 'late' | 'absent'>;
    teacher_gateway: Pick<Counts, 'total' | 'present' | 'late' | 'absent'>;
    attendance_rate: number;
  };
  daily: Array<Counts & { date: string }>;
  classes: AttendanceRow[];
  students: AttendanceRow[];
};

const statusLabels = {
  present: 'Hadir',
  late: 'Terlambat',
  sick: 'Sakit',
  excused: 'Izin',
  absent: 'Alpa',
} as const;

const number = (value: number | undefined) => (value || 0).toLocaleString('id-ID');
const localDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );

export function AttendanceReport() {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    academic_year_id: '',
    semester_id: '',
    class_id: '',
    subject_id: '',
    date_from: '',
    date_to: '',
  });

  const load = useCallback(async (requested: typeof filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.entries(requested).filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
      const response = await fetch(`/api/reports/attendance?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Laporan tidak dapat dimuat.');
      setData(result);
      setFilters(result.selected);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Laporan gagal dimuat',
        message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void load({
          academic_year_id: '',
          semester_id: '',
          class_id: '',
          subject_id: '',
          date_from: '',
          date_to: '',
        }),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);

  const selectedLabels = useMemo(() => {
    const find = (options: Option[], value: string) =>
      options.find((item) => item.value === value)?.label;
    return data
      ? {
          year: find(data.options.academic_year_id, filters.academic_year_id),
          semester: find(data.options.semester_id, filters.semester_id),
          classroom: find(data.options.class_id, filters.class_id) || 'Semua rombel',
          subject: find(data.options.subject_id, filters.subject_id) || 'Semua mata pelajaran',
        }
      : null;
  }, [data, filters]);

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet('Kehadiran murid');
      sheet.addRow([data.metadata.school.name]);
      sheet.addRow(['Laporan Kehadiran Terpadu']);
      sheet.addRow([
        `${selectedLabels?.year || ''} · ${selectedLabels?.semester || ''} · ${selectedLabels?.classroom || ''} · ${selectedLabels?.subject || ''}`,
      ]);
      sheet.addRow([`Periode ${localDate(filters.date_from)}–${localDate(filters.date_to)}`]);
      sheet.addRow([]);
      sheet.addRow([
        'NIS',
        'Nama murid',
        'Rombel',
        'Catatan',
        'Hadir',
        'Terlambat',
        'Sakit',
        'Izin',
        'Alpa',
        'Kehadiran (%)',
      ]);
      for (const row of data.students)
        sheet.addRow([
          row.nis,
          row.name,
          row.class_name,
          row.total,
          row.present,
          row.late,
          row.sick,
          row.excused,
          row.absent,
          row.attendance_rate,
        ]);
      sheet.getRow(6).font = { bold: true };
      sheet.columns.forEach((column, index) => {
        column.width = index === 1 ? 28 : index === 2 ? 20 : 14;
      });
      sheet.views = [{ state: 'frozen', ySplit: 6 }];
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `laporan-kehadiran-${filters.date_from}-${filters.date_to}.xlsx`;
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
        title: 'Export gagal',
        message: error instanceof Error ? error.message : 'Excel tidak dapat dibuat.',
      });
    } finally {
      setExporting(false);
    }
  }

  const maxDaily = Math.max(...(data?.daily.map((row) => row.total) || [1]), 1);
  const lesson = data?.summary.lesson;

  return (
    <>
      <Link href="/reports" className={styles.backLink}>
        <IconArrowLeft size={16} /> Pusat Laporan
      </Link>
      <PageHeading
        eyebrow="LAPORAN KEHADIRAN"
        title="Kehadiran terpadu"
        description="Gabungkan absensi pelajaran dan check-in gerbang untuk membaca pola kehadiran sekolah."
        action={
          <Group className={`${styles.pageActions} ${styles.screenOnly}`}>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={exportExcel}
              loading={exporting}
              disabled={!data?.students.length}
            >
              Excel
            </Button>
            <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>
              Cetak
            </Button>
          </Group>
        }
      />

      <Paper withBorder className={`${styles.filterPanel} ${styles.screenOnly}`}>
        <ReportPanelHeader
          title="Filter laporan"
          description="Sesuaikan periode, rombel, dan mata pelajaran yang ingin dianalisis."
        />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          <Select
            label="Tahun ajaran"
            placeholder="Pilih tahun ajaran"
            data={data?.options.academic_year_id || []}
            value={filters.academic_year_id}
            onChange={(value) =>
              setFilters({
                ...filters,
                academic_year_id: value || '',
                semester_id: '',
                class_id: '',
                subject_id: '',
                date_from: '',
                date_to: '',
              })
            }
          />
          <Select
            label="Semester"
            placeholder="Semua semester"
            clearable
            data={data?.options.semester_id || []}
            value={filters.semester_id}
            onChange={(value) =>
              setFilters({
                ...filters,
                semester_id: value || '',
                subject_id: '',
                date_from: '',
                date_to: '',
              })
            }
          />
          <Select
            label="Rombel"
            placeholder="Semua rombel"
            clearable
            searchable
            data={data?.options.class_id || []}
            value={filters.class_id}
            onChange={(value) => setFilters({ ...filters, class_id: value || '' })}
          />
          <Select
            label="Mata pelajaran"
            placeholder="Semua mata pelajaran"
            clearable
            searchable
            data={data?.options.subject_id || []}
            value={filters.subject_id}
            onChange={(value) => setFilters({ ...filters, subject_id: value || '' })}
          />
          <DateInput
            label="Dari tanggal"
            placeholder="Pilih tanggal awal"
            value={filters.date_from || null}
            maxDate={filters.date_to || undefined}
            onChange={(value) => setFilters({ ...filters, date_from: value || '' })}
            valueFormat="D MMMM YYYY"
            locale="id"
            leftSection={<IconCalendar size={16} />}
            popoverProps={{ withinPortal: true }}
          />
          <DateInput
            label="Sampai tanggal"
            placeholder="Pilih tanggal akhir"
            value={filters.date_to || null}
            minDate={filters.date_from || undefined}
            onChange={(value) => setFilters({ ...filters, date_to: value || '' })}
            valueFormat="D MMMM YYYY"
            locale="id"
            leftSection={<IconCalendar size={16} />}
            popoverProps={{ withinPortal: true }}
          />
        </SimpleGrid>
        <Group className={styles.filterActions} mt="md">
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void load(filters)}
            loading={loading}
          >
            Terapkan filter
          </Button>
        </Group>
      </Paper>

      {loading && !data ? (
        <div className={styles.empty}>
          <Loader />
        </div>
      ) : !data ? (
        <Alert color="red">Laporan belum dapat ditampilkan.</Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} className={styles.summaryGrid}>
            <ReportSummaryCard
              label="Kehadiran"
              value={`${data.summary.attendance_rate}%`}
              color="blue"
            />
            <ReportSummaryCard label="Hadir" value={number(lesson?.present)} color="green" />
            <ReportSummaryCard label="Terlambat" value={number(lesson?.late)} color="yellow" />
            <ReportSummaryCard
              label="Sakit / izin"
              value={number((lesson?.sick || 0) + (lesson?.excused || 0))}
              color="cyan"
            />
            <ReportSummaryCard label="Alpa" value={number(lesson?.absent)} color="red" />
            <ReportSummaryCard
              label="Sesi terbuka"
              value={number(data.summary.sessions.open)}
              color="orange"
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Paper withBorder className={styles.panel}>
              <ReportPanelHeader
                title="Aktivitas gerbang"
                description="Check-in selama periode yang dipilih"
              />
              <SimpleGrid cols={2}>
                <Stack gap={4}>
                  <Text variant="label">Murid</Text>
                  <Text fw={750} fz={24}>
                    {number(data.summary.student_gateway.total)}
                  </Text>
                  <Text variant="caption">
                    {number(data.summary.student_gateway.late)} terlambat ·{' '}
                    {number(data.summary.student_gateway.absent)} tidak hadir
                  </Text>
                </Stack>
                <Stack gap={4}>
                  <Text variant="label">Guru</Text>
                  <Text fw={750} fz={24}>
                    {number(data.summary.teacher_gateway.total)}
                  </Text>
                  <Text variant="caption">
                    {number(data.summary.teacher_gateway.late)} terlambat ·{' '}
                    {number(data.summary.teacher_gateway.absent)} tidak hadir
                  </Text>
                </Stack>
              </SimpleGrid>
            </Paper>
            <Paper withBorder className={styles.panel}>
              <ReportPanelHeader
                title="Tren catatan pelajaran"
                description="Jumlah catatan absensi per hari"
              />
              {data.daily.length ? (
                <div className={styles.trendList}>
                  {data.daily.slice(-10).map((row) => (
                    <div className={styles.trendRow} key={row.date}>
                      <span>{localDate(row.date)}</span>
                      <div className={styles.trendTrack}>
                        <div
                          className={styles.trendBar}
                          style={{ width: `${(100 * row.total) / maxDaily}%` }}
                        />
                      </div>
                      <b>{number(row.total)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>Belum ada sesi absensi pada periode ini.</div>
              )}
            </Paper>
          </SimpleGrid>

          <Paper withBorder className={styles.panel}>
            <ReportPanelHeader
              title="Ringkasan per rombel"
              description="Kehadiran berdasarkan catatan absensi pelajaran"
              aside={<Badge variant="light">{data.classes.length} rombel</Badge>}
            />
            <Table.ScrollContainer minWidth={760}>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rombel</Table.Th>
                    <Table.Th>Sesi</Table.Th>
                    {Object.values(statusLabels).map((label) => (
                      <Table.Th key={label}>{label}</Table.Th>
                    ))}
                    <Table.Th>Kehadiran</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.classes.map((row) => (
                    <Table.Tr key={row.class_id}>
                      <Table.Td>
                        <Text fw={650}>{row.class_name}</Text>
                      </Table.Td>
                      <Table.Td>{number(row.sessions)}</Table.Td>
                      <Table.Td>{number(row.present)}</Table.Td>
                      <Table.Td>{number(row.late)}</Table.Td>
                      <Table.Td>{number(row.sick)}</Table.Td>
                      <Table.Td>{number(row.excused)}</Table.Td>
                      <Table.Td>{number(row.absent)}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            row.attendance_rate >= 90
                              ? 'green'
                              : row.attendance_rate >= 75
                                ? 'yellow'
                                : 'red'
                          }
                        >
                          {row.attendance_rate || 0}%
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!data.classes.length && (
              <div className={styles.empty}>Belum ada data rombel untuk filter ini.</div>
            )}
          </Paper>

          <Paper withBorder className={styles.panel}>
            <ReportPanelHeader
              title="Perhatian per murid"
              description="Diurutkan dari tingkat kehadiran terendah"
              aside={
                <Badge color="gray" variant="light">
                  Maks. 500 murid
                </Badge>
              }
            />
            <Table.ScrollContainer minWidth={900}>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Murid</Table.Th>
                    <Table.Th>Rombel</Table.Th>
                    <Table.Th>Catatan</Table.Th>
                    {Object.values(statusLabels).map((label) => (
                      <Table.Th key={label}>{label}</Table.Th>
                    ))}
                    <Table.Th>Kehadiran</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.students.map((row) => (
                    <Table.Tr key={`${row.student_id}-${row.class_name}`}>
                      <Table.Td>
                        <Text fw={650}>{row.name}</Text>
                        <Text variant="caption">{row.nis}</Text>
                      </Table.Td>
                      <Table.Td>{row.class_name}</Table.Td>
                      <Table.Td>{number(row.total)}</Table.Td>
                      <Table.Td>{number(row.present)}</Table.Td>
                      <Table.Td>{number(row.late)}</Table.Td>
                      <Table.Td>{number(row.sick)}</Table.Td>
                      <Table.Td>{number(row.excused)}</Table.Td>
                      <Table.Td>{number(row.absent)}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            row.attendance_rate >= 90
                              ? 'green'
                              : row.attendance_rate >= 75
                                ? 'yellow'
                                : 'red'
                          }
                        >
                          {row.attendance_rate || 0}%
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!data.students.length && (
              <div className={styles.empty}>Belum ada catatan kehadiran murid.</div>
            )}
          </Paper>
          <Text ta="right" variant="caption">
            Dihasilkan {new Date(data.metadata.generated_at).toLocaleString('id-ID')}
          </Text>
        </>
      )}
    </>
  );
}
