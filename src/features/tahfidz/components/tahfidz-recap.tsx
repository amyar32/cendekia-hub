'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from '@/features/reports/components/report-common.module.css';
import type { TahfidzRecap, TahfidzRecapFilters } from '../recap-types';
import {
  createTahfidzExcel,
  createTahfidzPdf,
  recapHeaders,
  recapRows,
  recapFilterLabels,
} from '../recap-export';

const initial: TahfidzRecapFilters = {
  academic_year_id: '',
  date_from: '',
  date_to: '',
  group_id: '',
  student_id: '',
  session_status: 'closed',
};
export function TahfidzRecapPanel() {
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [state, setState] = useState<{ key: string; data?: TahfidzRecap; error?: string }>({
    key: '',
  });
  const key = JSON.stringify([filters, page, revision]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ...filters, page: String(page) });
    fetch(`/api/reports/tahfidz?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Rekap gagal dimuat.');
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            key,
            error: error instanceof Error ? error.message : 'Rekap gagal dimuat.',
          }));
      });
    return () => controller.abort();
  }, [filters, page, revision, key]);
  const loading = state.key !== key;
  const data = state.key === key ? state.data : undefined;
  async function download(format: 'xlsx' | 'pdf') {
    if (!data || exporting) return;
    setExporting(format);
    try {
      const params = new URLSearchParams({ ...data.filters, export: '1' });
      const response = await fetch(`/api/reports/tahfidz?${params}`);
      const full: TahfidzRecap & { error?: string } = await response.json();
      if (!response.ok) throw new Error(full.error || 'Ekspor gagal.');
      const bytes =
        format === 'xlsx' ? await createTahfidzExcel(full) : await createTahfidzPdf(full);
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type:
            format === 'xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/pdf',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rekap-tahfidz-${full.filters.date_from}-${full.filters.date_to}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifications.show({ color: 'green', message: 'Rekap berhasil diunduh.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Ekspor gagal.',
      });
    } finally {
      setExporting(null);
    }
  }
  return (
    <Stack>
      <Link href="/reports" className={styles.backLink}>
        <IconArrowLeft size={16} /> Pusat Laporan
      </Link>
      <PageHeading
        eyebrow="LAPORAN TAHFIDZ"
        title="Rekap Tahfidz"
        description="Pantau kehadiran, kegiatan hafalan, dan hasil setoran siswa per periode."
      />
      <Text size="sm" c="dimmed">
        Kehadiran mencakup hadir dan telat. Hafalan baru, murajaah, dan hasil dihitung per catatan
        setoran, bukan jumlah ayat unik.
      </Text>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({
            ...draft,
            date_from: draft.date_from || state.data?.filters.date_from || '',
            date_to: draft.date_to || state.data?.filters.date_to || '',
          });
          setPage(1);
          setRevision((value) => value + 1);
        }}
      >
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          <Select
            label="Tahun ajaran"
            allowDeselect={false}
            value={draft.academic_year_id || state.data?.filters.academic_year_id || null}
            data={[
              { value: 'all', label: 'Semua tahun ajaran' },
              ...(state.data?.options.academic_years || []),
            ]}
            onChange={(value) => {
              const next = {
                ...draft,
                academic_year_id: value || '',
                group_id: '',
                student_id: '',
              };
              setDraft(next);
              setFilters(next);
              setPage(1);
            }}
          />
          <TextInput
            required
            type="date"
            label="Tanggal awal"
            value={draft.date_from || state.data?.filters.date_from || ''}
            onChange={(event) => setDraft({ ...draft, date_from: event.currentTarget.value })}
          />
          <TextInput
            required
            type="date"
            label="Tanggal akhir"
            value={draft.date_to || state.data?.filters.date_to || ''}
            onChange={(event) => setDraft({ ...draft, date_to: event.currentTarget.value })}
          />
          <Select
            label="Status sesi"
            value={draft.session_status}
            onChange={(value) =>
              setDraft({ ...draft, session_status: value as TahfidzRecapFilters['session_status'] })
            }
            allowDeselect={false}
            data={[
              { value: 'closed', label: 'Ditutup' },
              { value: 'open', label: 'Terbuka (sementara)' },
              { value: 'all', label: 'Semua sesi' },
            ]}
          />
          <Select
            searchable
            clearable
            label="Kelompok"
            placeholder="Semua kelompok"
            value={draft.group_id || null}
            data={state.data?.options.groups || []}
            onChange={(value) => setDraft({ ...draft, group_id: value || '' })}
          />
          <Select
            searchable
            clearable
            label="Siswa"
            placeholder="Semua siswa"
            value={draft.student_id || null}
            data={state.data?.options.students || []}
            onChange={(value) => setDraft({ ...draft, student_id: value || '' })}
          />
          <Group align="end">
            <Button type="submit" disabled={Boolean(exporting)}>
              Tampilkan rekap
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={Boolean(exporting)}
              onClick={() => {
                setDraft(initial);
                setFilters(initial);
                setPage(1);
                setRevision((value) => value + 1);
              }}
            >
              Reset filter
            </Button>
          </Group>
        </SimpleGrid>
      </form>
      {loading ? (
        <Loader size="sm" />
      ) : state.error ? (
        <Alert color="red" title="Rekap gagal dimuat">
          {state.error}
          <Button mt="sm" variant="light" onClick={() => setRevision((value) => value + 1)}>
            Coba lagi
          </Button>
        </Alert>
      ) : data ? (
        <>
          <Text size="sm" fw={600}>
            {recapFilterLabels(data).join(' · ')}
          </Text>
          {data.summary.open_sessions > 0 ? (
            <Alert color="orange">
              Rekap menyertakan {data.summary.open_sessions} sesi terbuka. Data masih dapat berubah.
            </Alert>
          ) : null}
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            {[
              ['Sesi', data.summary.sessions],
              ['Siswa', data.summary.students],
              ['Hadir / telat', data.summary.present + data.summary.late],
              ['Lancar / ulang', `${data.summary.fluent} / ${data.summary.repeat}`],
            ].map(([label, value]) => (
              <Paper key={label} withBorder p="sm">
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
                <Text fw={700} size="xl">
                  {value}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
          <Group justify="space-between">
            <Text size="sm">
              {data.total} siswa · {data.summary.total} catatan sesi
            </Text>
            <Group>
              <Button
                variant="light"
                disabled={Boolean(exporting) || data.total === 0}
                loading={exporting === 'xlsx'}
                onClick={() => void download('xlsx')}
              >
                Ekspor Excel
              </Button>
              <Button
                variant="light"
                disabled={Boolean(exporting) || data.total === 0}
                loading={exporting === 'pdf'}
                onClick={() => void download('pdf')}
              >
                Ekspor PDF
              </Button>
            </Group>
          </Group>
          {data.total === 0 ? (
            <Text c="dimmed">Belum ada catatan Tahfidz sesuai filter yang dipilih.</Text>
          ) : (
            <Table.ScrollContainer minWidth={1250}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    {recapHeaders.map((header) => (
                      <Table.Th key={header}>{header}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recapRows(data).map((row, index) => (
                    <Table.Tr key={data.rows[index].student_id}>
                      {row.map((cell, column) => (
                        <Table.Td key={column}>{cell}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {data.total > data.page_size ? (
            <Group justify="center">
              <Pagination
                total={Math.ceil(data.total / data.page_size)}
                value={page}
                onChange={setPage}
              />
            </Group>
          ) : null}
          <Text size="xs" c="dimmed">
            Ekspor mencakup seluruh siswa sesuai filter dan detail setoran, termasuk pembimbing
            serta catatan.
          </Text>
        </>
      ) : null}
    </Stack>
  );
}
