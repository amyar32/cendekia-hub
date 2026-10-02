'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  type TahfidzHistory,
  historyActivities,
  historyResults,
  historyStatuses,
} from '../history-types';

export function TahfidzHistoryPanel({ initialYear = 'all' }: { initialYear?: string }) {
  const [year, setYear] = useState(initialYear);
  const [studentId, setStudentId] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: TahfidzHistory; error?: string }>({
    key: '',
  });
  const key = `${year}:${studentId}:${page}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), academic_year_id: year });
    if (studentId) params.set('student_id', studentId);
    fetch(`/api/modules/tahfidz/history?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Riwayat gagal dimuat.');
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error: error instanceof Error ? error.message : 'Riwayat gagal dimuat.',
          });
      });
    return () => controller.abort();
  }, [year, studentId, page, revision, key]);
  const data = state.key === key ? state.data : undefined;
  const loading = state.key !== key;
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Riwayat lintas kelompok dan tahun ajaran, dari yang terbaru. Sesi terbuka masih dapat
        berubah.
      </Text>
      <Select
        label="Tahun ajaran"
        value={year}
        data={[
          { value: 'all', label: 'Semua tahun ajaran' },
          ...(state.data?.academic_years || []),
        ]}
        onChange={(value) => {
          setYear(value || 'all');
          setStudentId('');
          setPage(1);
        }}
      />
      <Select
        searchable
        clearable
        label="Siswa"
        placeholder="Cari nama atau NIS siswa"
        data={(state.data?.students || []).map((student) => ({
          value: student.id,
          label: `${student.name} — ${student.nis}`,
        }))}
        value={studentId || null}
        onChange={(value) => {
          setStudentId(value || '');
          setPage(1);
        }}
      />
      {loading ? (
        <Loader size="sm" />
      ) : state.error ? (
        <Alert color="red" title="Riwayat gagal dimuat">
          {state.error}
          <Button mt="sm" variant="light" onClick={() => setRevision((value) => value + 1)}>
            Coba lagi
          </Button>
        </Alert>
      ) : data?.student ? (
        <>
          <Text fw={600}>
            {data.student.name} · {data.total} catatan sesi
          </Text>
          {data.total === 0 ? (
            <Text c="dimmed">Belum ada riwayat setoran untuk siswa ini.</Text>
          ) : (
            <Table.ScrollContainer minWidth={720}>
              <Table striped verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tanggal / kelompok</Table.Th>
                    <Table.Th>Setoran</Table.Th>
                    <Table.Th>Hasil</Table.Th>
                    <Table.Th>Pembimbing / catatan</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.records.map((record) => (
                    <Table.Tr key={record.id}>
                      <Table.Td>
                        <Text size="sm">
                          {new Date(`${record.attendance_date}T12:00:00`).toLocaleDateString(
                            'id-ID',
                          )}
                        </Text>
                        <Text size="xs">
                          {record.group_name} · {record.class_name} · {record.academic_year_name}
                        </Text>
                        <Badge
                          size="xs"
                          color={record.session_status === 'closed' ? 'gray' : 'orange'}
                        >
                          {record.session_status === 'closed' ? 'Ditutup' : 'Terbuka'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{historyActivities[record.activity_type]}</Text>
                        {record.surah_name ? (
                          <Text size="xs">
                            {record.surah_name} · Ayat {record.ayah_from}–{record.ayah_to}
                          </Text>
                        ) : null}
                        <Text size="xs" c="dimmed">
                          {historyStatuses[record.status]}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            record.result === 'fluent'
                              ? 'green'
                              : record.result === 'repeat'
                                ? 'orange'
                                : 'gray'
                          }
                        >
                          {historyResults[record.result]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{record.teacher_name}</Text>
                        <Text
                          size="xs"
                          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                        >
                          {record.note || '—'}
                        </Text>
                      </Table.Td>
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
        </>
      ) : (
        <Text c="dimmed">
          {data?.students.length === 0
            ? 'Belum ada peserta Tahfidz.'
            : 'Pilih siswa untuk melihat riwayat hafalannya.'}
        </Text>
      )}
    </Stack>
  );
}
