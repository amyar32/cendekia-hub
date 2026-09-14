'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconDownload,
  IconPrinter,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { ReportPanelHeader, ReportSummaryCard } from './report-elements';
import styles from './report-common.module.css';

type Severity = 'high' | 'medium' | 'low';
type Option = { value: string; label: string };
type Issue = {
  category: string;
  label: string;
  severity: Severity;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  detail: string;
  path: string;
};
type DataQuality = {
  metadata: { generated_at: string; school: { name: string } };
  selected: { academic_year_id: string };
  options: { academic_year_id: Option[] };
  summary: { issues: number; high: number; medium: number; low: number; entities_checked: number };
  categories: Array<{ category: string; label: string; severity: Severity; count: number }>;
  issues: Issue[];
};

const severity = {
  high: { label: 'Penting', color: 'red' },
  medium: { label: 'Perlu dilengkapi', color: 'orange' },
  low: { label: 'Penyempurnaan', color: 'blue' },
} as const;

export function DataQualityReport() {
  const [data, setData] = useState<DataQuality | null>(null);
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (academicYearId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (academicYearId) params.set('academic_year_id', academicYearId);
      const response = await fetch(`/api/reports/data-quality?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Laporan tidak dapat dimuat.');
      setData(result);
      setYear(result.selected.academic_year_id);
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
    const timer = setTimeout(() => void load(''), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visibleIssues = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('id-ID');
    return (data?.issues || []).filter(
      (issue) =>
        (!category || issue.category === category) &&
        (!level || issue.severity === level) &&
        (!normalized ||
          `${issue.entity_name} ${issue.label} ${issue.detail}`
            .toLocaleLowerCase('id-ID')
            .includes(normalized)),
    );
  }, [data, category, level, query]);

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet('Kelengkapan data');
      const yearLabel =
        data.options.academic_year_id.find((item) => item.value === year)?.label || '';
      sheet.addRow([data.metadata.school.name]);
      sheet.addRow(['Laporan Kelengkapan Data']);
      sheet.addRow([yearLabel]);
      sheet.addRow([`Total ${visibleIssues.length} temuan dari filter aktif`]);
      sheet.addRow([]);
      sheet.addRow(['Prioritas', 'Kategori', 'Jenis data', 'Nama', 'Tindakan']);
      for (const issue of visibleIssues)
        sheet.addRow([
          severity[issue.severity].label,
          issue.label,
          issue.entity_type,
          issue.entity_name,
          issue.detail,
        ]);
      sheet.getRow(6).font = { bold: true };
      sheet.columns.forEach((column, index) => {
        column.width = index === 4 ? 44 : index === 3 ? 28 : 20;
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
      anchor.download = `kelengkapan-data-${year}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifications.show({
        color: 'green',
        title: 'Excel siap',
        message: `${visibleIssues.length} temuan berhasil diekspor.`,
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

  return (
    <>
      <Link href="/reports" className={styles.backLink}>
        <IconArrowLeft size={16} /> Pusat Laporan
      </Link>
      <PageHeading
        eyebrow="KUALITAS DATA"
        title="Kelengkapan data"
        description="Temukan hambatan data sebelum memengaruhi kartu identitas, absensi, jadwal, dan proses akademik."
        action={
          <Group className={`${styles.pageActions} ${styles.screenOnly}`}>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={exportExcel}
              loading={exporting}
              disabled={!visibleIssues.length}
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
          description="Pilih tahun ajaran, kategori, prioritas, atau cari data tertentu."
        />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <Select
            label="Tahun ajaran"
            placeholder="Pilih tahun ajaran"
            data={data?.options.academic_year_id || []}
            value={year}
            onChange={(value) => setYear(value || '')}
          />
          <Select
            label="Kategori"
            placeholder="Semua kategori"
            clearable
            searchable
            data={(data?.categories || []).map((item) => ({
              value: item.category,
              label: `${item.label} (${item.count})`,
            }))}
            value={category}
            onChange={(value) => setCategory(value || '')}
          />
          <Select
            label="Prioritas"
            placeholder="Semua prioritas"
            clearable
            data={Object.entries(severity).map(([value, item]) => ({ value, label: item.label }))}
            value={level}
            onChange={(value) => setLevel(value || '')}
          />
          <TextInput
            label="Cari data"
            placeholder="Nama atau masalah"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </SimpleGrid>
        <Group className={styles.filterActions} mt="md">
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={() => void load(year)}
          >
            Muat tahun ajaran
          </Button>
        </Group>
      </Paper>

      {loading && !data ? (
        <div className={styles.empty}>
          <Loader />
        </div>
      ) : (
        data && (
          <>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} className={styles.summaryGrid}>
              <ReportSummaryCard
                label="Total temuan"
                value={data.summary.issues.toLocaleString('id-ID')}
                color="gray"
              />
              <ReportSummaryCard
                label="Penting"
                value={data.summary.high.toLocaleString('id-ID')}
                color="red"
              />
              <ReportSummaryCard
                label="Perlu dilengkapi"
                value={data.summary.medium.toLocaleString('id-ID')}
                color="orange"
              />
              <ReportSummaryCard
                label="Penyempurnaan"
                value={data.summary.low.toLocaleString('id-ID')}
                color="blue"
              />
              <ReportSummaryCard
                label="Entitas diperiksa"
                value={data.summary.entities_checked.toLocaleString('id-ID')}
                color="green"
              />
            </SimpleGrid>

            <Paper withBorder className={styles.panel}>
              <ReportPanelHeader
                title="Ringkasan masalah"
                description="Pilih kategori untuk menyaring daftar tindakan"
                aside={<Badge variant="light">{data.categories.length} kategori</Badge>}
              />
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {data.categories.map((item) => (
                  <Paper
                    component="button"
                    type="button"
                    withBorder
                    p="md"
                    key={item.category}
                    onClick={() => setCategory(category === item.category ? '' : item.category)}
                    className={`${styles.categoryCard} ${category === item.category ? styles.categoryCardActive : ''}`}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Text fw={700} size="sm">
                          {item.label}
                        </Text>
                        <Badge color={severity[item.severity].color} variant="light" mt={8}>
                          {severity[item.severity].label}
                        </Badge>
                      </div>
                      <Text fw={750} fz={26}>
                        {item.count}
                      </Text>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
              {!data.categories.length && (
                <div className={styles.empty}>
                  Semua pemeriksaan berhasil. Tidak ada masalah kelengkapan data.
                </div>
              )}
            </Paper>

            <Paper withBorder className={styles.panel}>
              <ReportPanelHeader
                title="Daftar tindakan"
                description="Hasil mengikuti filter kategori, prioritas, dan pencarian"
                aside={
                  <Badge color={visibleIssues.length ? 'orange' : 'green'} variant="light">
                    {visibleIssues.length} temuan
                  </Badge>
                }
              />
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Prioritas</Table.Th>
                      <Table.Th>Data</Table.Th>
                      <Table.Th>Masalah</Table.Th>
                      <Table.Th>Tindakan</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {visibleIssues.map((issue, index) => (
                      <Table.Tr key={`${issue.category}-${issue.entity_id}-${index}`}>
                        <Table.Td>
                          <Badge color={severity[issue.severity].color} variant="light">
                            {severity[issue.severity].label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={650}>{issue.entity_name}</Text>
                          <Text variant="caption">{issue.entity_type}</Text>
                        </Table.Td>
                        <Table.Td>{issue.label}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{issue.detail}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            component={Link}
                            href={issue.path}
                            variant="subtle"
                            size="compact-sm"
                            rightSection={<IconArrowUpRight size={14} />}
                          >
                            Perbaiki
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {!visibleIssues.length && (
                <div className={styles.empty}>
                  {data.issues.length
                    ? 'Tidak ada temuan yang sesuai filter.'
                    : 'Data sekolah sudah melewati seluruh pemeriksaan.'}
                </div>
              )}
            </Paper>
            <Text ta="right" variant="caption">
              Dihasilkan {new Date(data.metadata.generated_at).toLocaleString('id-ID')}
            </Text>
          </>
        )
      )}
    </>
  );
}
