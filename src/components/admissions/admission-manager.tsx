'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarPlus,
  IconCheck,
  IconEye,
  IconPencil,
  IconUserPlus,
} from '@tabler/icons-react';
import 'dayjs/locale/id';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';
import styles from './admission-manager.module.css';

type Option = { value: string; label: string };
type Period = {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  name: string;
  start_date: string;
  end_date: string;
  quota: number;
  status: 'draft' | 'open' | 'closed';
  registration_prefix: string;
  application_count: number;
  accepted_count: number;
};
type Guardian = {
  name: string;
  relation: string;
  phone: string;
  email: string;
  is_primary: number;
};
type Document = {
  id: string;
  type: string;
  file_url: string;
  description: string;
  verified: number;
  verification_notes: string;
};
type History = {
  id: string;
  from_status?: string;
  to_status: string;
  notes: string;
  actor: string;
  created_at: string;
};
type Application = {
  id: string;
  registration_number: string;
  name: string;
  nik: string;
  nisn: string;
  gender_label: string;
  phone: string;
  email: string;
  period_name: string;
  academic_year_id: string;
  target_grade_name: string;
  status: Status;
  admission_path: string;
  verification_notes: string;
  decision_notes: string;
  assessment_test: number | null;
  assessment_interview: number | null;
  assessment_final: number | null;
  ranking: number | null;
  converted_student_id?: string;
  guardians: Guardian[];
  documents: Document[];
  history: History[];
};
type Status =
  | 'draft'
  | 'submitted'
  | 'needs_revision'
  | 'verified'
  | 'selection'
  | 'accepted'
  | 'waitlisted'
  | 'rejected'
  | 'reregistered'
  | 'converted';

const statusLabels: Record<Status, string> = {
  draft: 'Draft',
  submitted: 'Dikirim',
  needs_revision: 'Perlu perbaikan',
  verified: 'Terverifikasi',
  selection: 'Seleksi',
  accepted: 'Diterima',
  waitlisted: 'Cadangan',
  rejected: 'Tidak diterima',
  reregistered: 'Daftar ulang',
  converted: 'Menjadi murid',
};
const statusColors: Record<Status, string> = {
  draft: 'gray',
  submitted: 'blue',
  needs_revision: 'orange',
  verified: 'cyan',
  selection: 'violet',
  accepted: 'green',
  waitlisted: 'yellow',
  rejected: 'red',
  reregistered: 'teal',
  converted: 'grape',
};
const nextStatuses: Partial<Record<Status, Status[]>> = {
  draft: ['submitted'],
  submitted: ['needs_revision', 'verified'],
  needs_revision: ['submitted', 'verified'],
  verified: ['selection'],
  selection: ['accepted', 'waitlisted', 'rejected'],
  accepted: ['reregistered'],
  waitlisted: ['accepted', 'rejected'],
};
const blankPeriod = () => ({
  academic_year_id: '',
  name: '',
  start_date: '',
  end_date: '',
  quota: 0,
  status: 'draft' as Period['status'],
  registration_prefix: 'PMB',
});

export function AdmissionManager({ writable }: { writable: boolean }) {
  const [view, setView] = useState<'applications' | 'periods'>('applications');
  const [periodId, setPeriodId] = useState('');
  const [status, setStatus] = useState('');
  const list = useModuleList<Application>('/api/modules/admissions', {
    ...(periodId ? { period_id: periodId } : {}),
    ...(status ? { status } : {}),
  });
  const periods = (list.periods || []) as Period[];
  const [selected, setSelected] = useState<Application | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<Period | null | undefined>(undefined);
  const [periodForm, setPeriodForm] = useState(blankPeriod);
  const [notes, setNotes] = useState('');
  const [testScore, setTestScore] = useState<number | string>('');
  const [interviewScore, setInterviewScore] = useState<number | string>('');
  const [ranking, setRanking] = useState<number | string>('');
  const [nis, setNis] = useState('');
  const [classId, setClassId] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState('');
  const [saving, setSaving] = useState(false);
  const options = list.options || {};

  function openApplication(row: Application) {
    setSelected(row);
    setNotes(row.decision_notes || row.verification_notes || '');
    setTestScore(row.assessment_test ?? '');
    setInterviewScore(row.assessment_interview ?? '');
    setRanking(row.ranking ?? '');
    setNis('');
    setClassId('');
    setEnrollmentDate('');
  }
  function openPeriod(period?: Period) {
    setEditingPeriod(period || null);
    setPeriodForm(
      period
        ? {
            academic_year_id: period.academic_year_id,
            name: period.name,
            start_date: period.start_date,
            end_date: period.end_date,
            quota: period.quota,
            status: period.status,
            registration_prefix: period.registration_prefix,
          }
        : blankPeriod(),
    );
  }
  async function mutate(method: string, body: unknown, success: string) {
    setSaving(true);
    try {
      await moduleMutation('/api/modules/admissions', method, body);
      notifications.show({ color: 'green', title: 'Berhasil', message: success });
      setSelected(null);
      setEditingPeriod(undefined);
      list.reload();
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Tindakan gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }
  async function savePeriod(event: React.FormEvent) {
    event.preventDefault();
    await mutate(
      editingPeriod ? 'PATCH' : 'POST',
      { entity: 'period', id: editingPeriod?.id, ...periodForm },
      'Periode penerimaan berhasil disimpan.',
    );
  }
  const statusOptions = useMemo(
    () => Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
    [],
  );

  return (
    <>
      <ModuleListLayout
        eyebrow="PENERIMAAN"
        title="Penerimaan Murid Baru"
        description="Kelola pendaftaran dari formulir masuk hingga calon murid resmi ditempatkan ke rombel."
        total={view === 'applications' ? list.total : periods.length}
        page={view === 'applications' ? list.page : 1}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        note="Setiap perubahan status dicatat. Data pendaftaran tetap terpisah dari data murid sampai proses konversi selesai."
        navigation={
          <Tabs
            value={view}
            onChange={(value) => value && setView(value as typeof view)}
            className={styles.tabs}
          >
            <Tabs.List>
              <Tabs.Tab value="periods" leftSection={<IconCalendarPlus size={17} />}>
                Periode
              </Tabs.Tab>
              <Tabs.Tab value="applications" leftSection={<IconUserPlus size={17} />}>
                Calon Murid
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
        }
        toolbarLeading={
          view === 'applications' ? (
            <Group gap="xs" wrap="wrap">
              <Select
                placeholder="Semua periode"
                clearable
                searchable
                size="sm"
                w={200}
                value={periodId || null}
                data={(options.period_id || []) as Option[]}
                onChange={(value) => {
                  setPeriodId(value || '');
                  list.setPage(1);
                }}
              />
              <Select
                placeholder="Semua status"
                clearable
                size="sm"
                w={200}
                value={status || null}
                data={statusOptions}
                onChange={(value) => {
                  setStatus(value || '');
                  list.setPage(1);
                }}
              />
            </Group>
          ) : undefined
        }
        addLabel={view === 'periods' ? 'Tambah periode' : 'Formulir publik'}
        onAdd={
          view === 'periods'
            ? writable
              ? () => openPeriod()
              : undefined
            : () => window.open('/admissions/apply', '_blank', 'noopener,noreferrer')
        }
      >
        {view === 'applications' ? (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>NO. DAFTAR</Table.Th>
                  <Table.Th>NAMA</Table.Th>
                  <Table.Th>PERIODE</Table.Th>
                  <Table.Th>TINGKAT/JALUR</Table.Th>
                  <Table.Th>STATUS</Table.Th>
                  <Table.Th>NILAI</Table.Th>
                  <Table.Th ta="right">AKSI</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Badge variant="light">{row.registration_number}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {row.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {row.nisn || row.nik || 'Identitas belum lengkap'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{row.period_name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{row.target_grade_name}</Text>
                      <Text size="xs" c="dimmed">
                        {row.admission_path}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColors[row.status]} variant="light">
                        {statusLabels[row.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {row.assessment_final == null
                          ? '—'
                          : Number(row.assessment_final).toFixed(1)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} justify="flex-end">
                        <ActionIcon
                          variant="subtle"
                          aria-label={`Lihat ${row.name}`}
                          onClick={() => openApplication(row)}
                        >
                          <IconEye size={17} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>PERIODE</Table.Th>
                  <Table.Th>TAHUN AJARAN</Table.Th>
                  <Table.Th>JADWAL</Table.Th>
                  <Table.Th>KUOTA</Table.Th>
                  <Table.Th>PENDAFTAR</Table.Th>
                  <Table.Th>STATUS</Table.Th>
                  <Table.Th ta="right">AKSI</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {periods.map((period) => (
                  <Table.Tr key={period.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {period.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {period.registration_prefix}
                      </Text>
                    </Table.Td>
                    <Table.Td>{period.academic_year_name}</Table.Td>
                    <Table.Td>
                      {period.start_date} – {period.end_date}
                    </Table.Td>
                    <Table.Td>{period.quota || 'Tak terbatas'}</Table.Td>
                    <Table.Td>
                      {period.application_count} ({period.accepted_count} diterima)
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={
                          period.status === 'open'
                            ? 'green'
                            : period.status === 'draft'
                              ? 'gray'
                              : 'red'
                        }
                      >
                        {period.status === 'open'
                          ? 'Dibuka'
                          : period.status === 'draft'
                            ? 'Draft'
                            : 'Ditutup'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} justify="flex-end">
                        <ActionIcon
                          variant="subtle"
                          disabled={!writable}
                          aria-label={`Edit periode ${period.name}`}
                          onClick={() => openPeriod(period)}
                        >
                          <IconPencil size={17} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </ModuleListLayout>

      <Modal
        opened={editingPeriod !== undefined}
        onClose={() => !saving && setEditingPeriod(undefined)}
        title={
          <Group>
            <ThemeIcon variant="light">
              <IconCalendarPlus size={18} />
            </ThemeIcon>
            <Text fw={700}>{editingPeriod ? 'Edit periode' : 'Tambah periode'}</Text>
          </Group>
        }
        centered
        size="lg"
      >
        <form onSubmit={savePeriod}>
          <Stack>
            <TextInput
              required
              label="Nama periode"
              placeholder="Contoh: PPDB Gelombang 1"
              value={periodForm.name}
              onChange={(e) => setPeriodForm({ ...periodForm, name: e.currentTarget.value })}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                required
                searchable
                label="Tahun ajaran tujuan"
                data={(options.academic_year_id || []) as Option[]}
                value={periodForm.academic_year_id || null}
                onChange={(value) =>
                  setPeriodForm({ ...periodForm, academic_year_id: value || '' })
                }
              />
              <Select
                required
                label="Status"
                data={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'open', label: 'Dibuka' },
                  { value: 'closed', label: 'Ditutup' },
                ]}
                value={periodForm.status}
                onChange={(value) =>
                  setPeriodForm({ ...periodForm, status: (value || 'draft') as Period['status'] })
                }
              />
              <DateInput
                required
                label="Tanggal mulai"
                value={periodForm.start_date}
                valueFormat="D MMMM YYYY"
                locale="id"
                onChange={(value) => setPeriodForm({ ...periodForm, start_date: value || '' })}
              />
              <DateInput
                required
                label="Tanggal selesai"
                value={periodForm.end_date}
                valueFormat="D MMMM YYYY"
                locale="id"
                onChange={(value) => setPeriodForm({ ...periodForm, end_date: value || '' })}
              />
              <NumberInput
                label="Kuota (0 = tak terbatas)"
                min={0}
                value={periodForm.quota}
                onChange={(value) => setPeriodForm({ ...periodForm, quota: Number(value) || 0 })}
              />
              <TextInput
                required
                label="Prefix nomor pendaftaran"
                value={periodForm.registration_prefix}
                onChange={(e) =>
                  setPeriodForm({
                    ...periodForm,
                    registration_prefix: e.currentTarget.value.toUpperCase(),
                  })
                }
              />
            </SimpleGrid>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditingPeriod(undefined)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                Simpan periode
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(selected)}
        onClose={() => !saving && setSelected(null)}
        title={selected ? `${selected.registration_number} — ${selected.name}` : ''}
        size="xl"
        centered
      >
        {selected && (
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  STATUS
                </Text>
                <Badge mt="xs" color={statusColors[selected.status]}>
                  {statusLabels[selected.status]}
                </Badge>
              </Paper>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  TINGKAT TUJUAN
                </Text>
                <Text fw={600}>{selected.target_grade_name}</Text>
              </Paper>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  KONTAK
                </Text>
                <Text fw={600}>{selected.phone || selected.email || '—'}</Text>
              </Paper>
            </SimpleGrid>
            <Divider label="Orang tua / wali" />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {selected.guardians.map((guardian, index) => (
                <Paper key={`${guardian.name}-${index}`} withBorder p="sm">
                  <Text fw={600}>
                    {guardian.name} {guardian.is_primary ? '(utama)' : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {guardian.relation} · {guardian.phone || 'tanpa telepon'}
                  </Text>
                </Paper>
              ))}
            </SimpleGrid>
            <Divider label="Dokumen" />
            {selected.documents.length ? (
              selected.documents.map((document) => (
                <Paper key={document.id} withBorder p="sm">
                  <Group justify="space-between">
                    <Box>
                      <Text
                        component="a"
                        href={document.file_url}
                        target="_blank"
                        fw={600}
                        size="sm"
                      >
                        {document.type}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {document.verification_notes || document.description || 'Tanpa catatan'}
                      </Text>
                    </Box>
                    {writable && (
                      <Button
                        size="xs"
                        variant={document.verified ? 'light' : 'outline'}
                        color={document.verified ? 'green' : 'gray'}
                        leftSection={document.verified ? <IconCheck size={14} /> : undefined}
                        onClick={() =>
                          mutate(
                            'PATCH',
                            {
                              entity: 'document',
                              id: document.id,
                              verified: !document.verified,
                              notes: document.verification_notes || '',
                            },
                            'Verifikasi dokumen diperbarui.',
                          )
                        }
                      >
                        {document.verified ? 'Terverifikasi' : 'Verifikasi'}
                      </Button>
                    )}
                  </Group>
                </Paper>
              ))
            ) : (
              <Text c="dimmed" size="sm">
                Belum ada dokumen.
              </Text>
            )}
            {writable &&
              ['verified', 'selection', 'accepted', 'waitlisted'].includes(selected.status) && (
                <>
                  <Divider label="Penilaian seleksi" />
                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <NumberInput
                      label="Nilai tes"
                      min={0}
                      max={100}
                      value={testScore}
                      onChange={setTestScore}
                    />
                    <NumberInput
                      label="Nilai wawancara"
                      min={0}
                      max={100}
                      value={interviewScore}
                      onChange={setInterviewScore}
                    />
                    <NumberInput label="Peringkat" min={1} value={ranking} onChange={setRanking} />
                  </SimpleGrid>
                  <Button
                    variant="light"
                    onClick={() =>
                      mutate(
                        'PATCH',
                        {
                          entity: 'assessment',
                          id: selected.id,
                          assessment_test: testScore === '' ? null : Number(testScore),
                          assessment_interview:
                            interviewScore === '' ? null : Number(interviewScore),
                          ranking: ranking === '' ? null : Number(ranking),
                          notes,
                        },
                        'Nilai seleksi disimpan.',
                      )
                    }
                  >
                    Simpan penilaian
                  </Button>
                </>
              )}
            {writable && nextStatuses[selected.status]?.length ? (
              <>
                <Divider label="Proses status" />
                <Textarea
                  label="Catatan untuk riwayat / pendaftar"
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                />
                <Group>
                  {nextStatuses[selected.status]!.map((next) => (
                    <Button
                      key={next}
                      color={statusColors[next]}
                      variant="light"
                      onClick={() =>
                        mutate(
                          'PATCH',
                          { entity: 'status', id: selected.id, status: next, notes },
                          `Status diubah menjadi ${statusLabels[next]}.`,
                        )
                      }
                    >
                      {statusLabels[next]}
                    </Button>
                  ))}
                </Group>
              </>
            ) : null}
            {writable && selected.status === 'reregistered' && (
              <>
                <Divider label="Jadikan murid aktif" />
                <Text size="sm" c="dimmed">
                  Konversi menyalin identitas, wali, dan dokumen, lalu membuat penempatan rombel.
                  Proses ini tidak dapat diulang.
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <TextInput
                    required
                    label="NIS baru"
                    value={nis}
                    onChange={(e) => setNis(e.currentTarget.value)}
                  />
                  <Select
                    searchable
                    required
                    label="Rombel"
                    data={(options.class_id || []) as Option[]}
                    value={classId || null}
                    onChange={(value) => setClassId(value || '')}
                  />
                  <DateInput
                    required
                    label="Tanggal masuk"
                    value={enrollmentDate}
                    valueFormat="D MMMM YYYY"
                    locale="id"
                    onChange={(value) => setEnrollmentDate(value || '')}
                  />
                </SimpleGrid>
                <Button
                  color="green"
                  disabled={!nis || !classId || !enrollmentDate}
                  onClick={() =>
                    mutate(
                      'POST',
                      {
                        entity: 'convert',
                        id: selected.id,
                        nis,
                        class_id: classId,
                        enrollment_date: enrollmentDate,
                      },
                      'Calon murid berhasil menjadi murid aktif.',
                    )
                  }
                >
                  Konversi ke murid aktif
                </Button>
              </>
            )}
            <Divider label="Riwayat" />
            {selected.history.map((item) => (
              <Box key={item.id}>
                <Text size="sm" fw={600}>
                  {statusLabels[item.to_status as Status] || item.to_status}
                </Text>
                <Text size="xs" c="dimmed">
                  {item.created_at} · {item.actor}
                  {item.notes ? ` · ${item.notes}` : ''}
                </Text>
              </Box>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
}
