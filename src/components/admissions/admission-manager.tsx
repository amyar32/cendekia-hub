'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
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
  IconAlertTriangle,
  IconCalendarPlus,
  IconCheck,
  IconEye,
  IconExternalLink,
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
  nik: string;
  relation: string;
  birth_place: string;
  birth_date: string;
  last_education: string;
  occupation: string;
  monthly_income: number;
  phone: string;
  email: string;
  address: string;
  address_matches_student: number;
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
  photo_url: string;
  name: string;
  nik: string;
  nisn: string;
  gender_label: string;
  birth_date: string;
  birth_place: string;
  family_card_number: string;
  religion: string;
  citizenship: string;
  child_order: number;
  sibling_count: number;
  birth_certificate_number: string;
  has_special_needs: number;
  special_needs_type: string;
  address: string;
  province_code: string;
  province_name: string;
  regency_code: string;
  regency_name: string;
  district_code: string;
  district_name: string;
  village_code: string;
  village_name: string;
  rt: string;
  rw: string;
  postal_code: string;
  domicile_matches_family_card: number;
  latitude: number | null;
  longitude: number | null;
  home_distance_km: number | null;
  phone: string;
  email: string;
  previous_school_name: string;
  previous_school_npsn: string;
  previous_school_address: string;
  previous_school_last_grade: string;
  previous_school_graduation_year: string;
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
  submitted_at: string;
  created_at: string;
  updated_at: string;
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
type ActionConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  color?: string;
  action: () => void;
};

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

const dateOnlyFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function displayDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : dateOnlyFormatter.format(parsed);
}

function displayValue(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" fw={500} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {displayValue(value)}
      </Text>
    </Box>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}>
      <Text fw={700} mb="md">
        {title}
      </Text>
      {children}
    </Paper>
  );
}

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
  const [pendingAction, setPendingAction] = useState('');
  const [confirmation, setConfirmation] = useState<ActionConfirmation | null>(null);
  const options = list.options || {};

  function runConfirmedAction() {
    const action = confirmation?.action;
    setConfirmation(null);
    action?.();
  }

  function openApplication(row: Application) {
    setSelected(row);
    setNotes(row.decision_notes || row.verification_notes || '');
    setTestScore(row.assessment_test ?? '');
    setInterviewScore(row.assessment_interview ?? '');
    setRanking(row.ranking ?? '');
    setNis('');
    setClassId('');
    setEnrollmentDate('');
    void refreshApplication(row.id).catch((error) => {
      notifications.show({
        color: 'yellow',
        title: 'Detail belum diperbarui',
        message:
          error instanceof Error ? error.message : 'Muat ulang halaman untuk melihat data terbaru.',
      });
    });
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
  async function refreshApplication(id: string) {
    const response = await fetch(`/api/modules/admissions?id=${encodeURIComponent(id)}`);
    const result = (await response.json()) as { application?: Application; error?: string };
    if (!response.ok || !result.application)
      throw new Error(result.error || 'Detail calon murid gagal dimuat ulang.');
    setSelected(result.application);
    setNotes(result.application.decision_notes || result.application.verification_notes || '');
    setTestScore(result.application.assessment_test ?? '');
    setInterviewScore(result.application.assessment_interview ?? '');
    setRanking(result.application.ranking ?? '');
  }

  async function mutate(
    method: string,
    body: unknown,
    success: string,
    behavior: {
      actionKey: string;
      closePeriod?: boolean;
      closeApplication?: boolean;
    },
  ) {
    setSaving(true);
    setPendingAction(behavior.actionKey);
    try {
      await moduleMutation('/api/modules/admissions', method, body);
      list.reload();
      if (behavior.closePeriod) setEditingPeriod(undefined);
      if (behavior.closeApplication) setSelected(null);
      notifications.show({ color: 'green', title: 'Berhasil', message: success });
      if (!behavior.closeApplication && selected) {
        try {
          await refreshApplication(selected.id);
        } catch (error) {
          notifications.show({
            color: 'yellow',
            title: 'Detail belum diperbarui',
            message:
              error instanceof Error
                ? error.message
                : 'Muat ulang detail untuk melihat data terbaru.',
          });
        }
      }
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Tindakan gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
      setPendingAction('');
    }
  }
  async function savePeriod(event: React.FormEvent) {
    event.preventDefault();
    await mutate(
      editingPeriod ? 'PATCH' : 'POST',
      { entity: 'period', id: editingPeriod?.id, ...periodForm },
      'Periode penerimaan berhasil disimpan.',
      { actionKey: 'period', closePeriod: true },
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
                placeholder="Pilih tahun ajaran"
                data={(options.academic_year_id || []) as Option[]}
                value={periodForm.academic_year_id || null}
                onChange={(value) =>
                  setPeriodForm({ ...periodForm, academic_year_id: value || '' })
                }
              />
              <Select
                required
                label="Status"
                placeholder="Pilih status periode"
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
                placeholder="Pilih tanggal mulai"
                value={periodForm.start_date}
                valueFormat="D MMMM YYYY"
                locale="id"
                onChange={(value) => setPeriodForm({ ...periodForm, start_date: value || '' })}
              />
              <DateInput
                required
                label="Tanggal selesai"
                placeholder="Pilih tanggal selesai"
                value={periodForm.end_date}
                valueFormat="D MMMM YYYY"
                locale="id"
                onChange={(value) => setPeriodForm({ ...periodForm, end_date: value || '' })}
              />
              <NumberInput
                label="Kuota (0 = tak terbatas)"
                placeholder="Contoh: 100"
                min={0}
                value={periodForm.quota}
                onChange={(value) => setPeriodForm({ ...periodForm, quota: Number(value) || 0 })}
              />
              <TextInput
                required
                label="Prefix nomor pendaftaran"
                placeholder="Contoh: PMB"
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
              <Button type="submit" loading={pendingAction === 'period'}>
                Simpan periode
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(selected)}
        onClose={() => !saving && setSelected(null)}
        title={
          selected ? (
            <Box>
              <Text fw={700}>Detail calon murid</Text>
              <Text size="xs" c="dimmed">
                {selected.registration_number}
              </Text>
            </Box>
          ) : null
        }
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ backgroundOpacity: 0.45, blur: 2 }}
      >
        {selected && (
          <Stack gap="lg">
            <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}>
              <Group wrap="nowrap" align="flex-start">
                <Avatar
                  src={selected.photo_url || null}
                  name={selected.name}
                  size={72}
                  radius="md"
                />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" align="flex-start" gap="xs">
                    <Box>
                      <Text fw={700} size="lg">
                        {selected.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {selected.target_grade_name} · {selected.admission_path}
                      </Text>
                    </Box>
                    <Badge color={statusColors[selected.status]} variant="light">
                      {statusLabels[selected.status]}
                    </Badge>
                  </Group>
                  <Text size="sm" mt="sm">
                    {selected.period_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Dikirim {displayDate(selected.submitted_at || selected.created_at)}
                  </Text>
                </Box>
              </Group>
            </Paper>

            <DetailSection title="Informasi pendaftaran">
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
                <DetailItem label="Nomor pendaftaran" value={selected.registration_number} />
                <DetailItem label="Periode" value={selected.period_name} />
                <DetailItem label="Tingkat tujuan" value={selected.target_grade_name} />
                <DetailItem label="Jalur pendaftaran" value={selected.admission_path} />
                <DetailItem label="Status" value={statusLabels[selected.status]} />
                <DetailItem label="Terakhir diperbarui" value={displayDate(selected.updated_at)} />
              </SimpleGrid>
            </DetailSection>

            <DetailSection title="Identitas calon murid">
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
                <DetailItem label="Nama lengkap" value={selected.name} />
                <DetailItem label="NISN" value={selected.nisn} />
                <DetailItem label="NIK" value={selected.nik} />
                <DetailItem label="Jenis kelamin" value={selected.gender_label} />
                <DetailItem label="Tempat lahir" value={selected.birth_place} />
                <DetailItem label="Tanggal lahir" value={displayDate(selected.birth_date)} />
                <DetailItem label="Nomor KK" value={selected.family_card_number} />
                <DetailItem label="Nomor akta lahir" value={selected.birth_certificate_number} />
                <DetailItem label="Agama" value={selected.religion} />
                <DetailItem label="Kewarganegaraan" value={selected.citizenship} />
                <DetailItem label="Anak ke" value={selected.child_order || '—'} />
                <DetailItem label="Jumlah saudara" value={selected.sibling_count || '—'} />
                <DetailItem
                  label="Kebutuhan khusus"
                  value={selected.has_special_needs ? selected.special_needs_type || 'Ya' : 'Tidak'}
                />
                <DetailItem label="No. HP" value={selected.phone} />
                <DetailItem label="Email" value={selected.email} />
              </SimpleGrid>
            </DetailSection>

            <DetailSection title="Alamat calon murid">
              <Stack gap="md">
                <DetailItem label="Alamat lengkap" value={selected.address} />
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
                  <DetailItem
                    label="Provinsi"
                    value={
                      selected.province_name
                        ? `${selected.province_name} (${selected.province_code})`
                        : ''
                    }
                  />
                  <DetailItem
                    label="Kabupaten/Kota"
                    value={
                      selected.regency_name
                        ? `${selected.regency_name} (${selected.regency_code})`
                        : ''
                    }
                  />
                  <DetailItem
                    label="Kecamatan"
                    value={
                      selected.district_name
                        ? `${selected.district_name} (${selected.district_code})`
                        : ''
                    }
                  />
                  <DetailItem
                    label="Kelurahan/Desa"
                    value={
                      selected.village_name
                        ? `${selected.village_name} (${selected.village_code})`
                        : ''
                    }
                  />
                  <DetailItem
                    label="RT / RW"
                    value={[selected.rt, selected.rw].filter(Boolean).join(' / ')}
                  />
                  <DetailItem label="Kode pos" value={selected.postal_code} />
                  <DetailItem
                    label="Domisili sesuai KK"
                    value={selected.domicile_matches_family_card ? 'Ya' : 'Tidak'}
                  />
                  <DetailItem label="Latitude" value={selected.latitude} />
                  <DetailItem label="Longitude" value={selected.longitude} />
                  <DetailItem
                    label="Jarak ke sekolah"
                    value={
                      selected.home_distance_km == null ? '—' : `${selected.home_distance_km} km`
                    }
                  />
                </SimpleGrid>
              </Stack>
            </DetailSection>

            <DetailSection title="Orang tua / wali">
              <Stack gap="sm">
                {selected.guardians.map((guardian, index) => (
                  <Paper key={`${guardian.name}-${index}`} withBorder radius="md" p="md">
                    <Group justify="space-between" mb="md">
                      <Text fw={700}>{guardian.name}</Text>
                      {guardian.is_primary ? <Badge variant="light">Wali utama</Badge> : null}
                    </Group>
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
                      <DetailItem label="Hubungan" value={guardian.relation} />
                      <DetailItem label="NIK" value={guardian.nik} />
                      <DetailItem label="Tempat lahir" value={guardian.birth_place} />
                      <DetailItem label="Tanggal lahir" value={displayDate(guardian.birth_date)} />
                      <DetailItem label="Pendidikan terakhir" value={guardian.last_education} />
                      <DetailItem label="Pekerjaan" value={guardian.occupation} />
                      <DetailItem
                        label="Penghasilan per bulan"
                        value={
                          guardian.monthly_income
                            ? currencyFormatter.format(guardian.monthly_income)
                            : '—'
                        }
                      />
                      <DetailItem label="No. HP" value={guardian.phone} />
                      <DetailItem label="Email" value={guardian.email} />
                      <DetailItem
                        label="Alamat"
                        value={
                          guardian.address_matches_student
                            ? `Sama dengan alamat calon murid${guardian.address ? ` — ${guardian.address}` : ''}`
                            : guardian.address
                        }
                      />
                    </SimpleGrid>
                  </Paper>
                ))}
              </Stack>
            </DetailSection>

            <DetailSection title="Sekolah asal">
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
                <DetailItem label="Nama sekolah" value={selected.previous_school_name} />
                <DetailItem label="NPSN" value={selected.previous_school_npsn} />
                <DetailItem label="Kelas terakhir" value={selected.previous_school_last_grade} />
                <DetailItem label="Tahun lulus" value={selected.previous_school_graduation_year} />
                <DetailItem label="Alamat sekolah" value={selected.previous_school_address} />
              </SimpleGrid>
            </DetailSection>

            <DetailSection title={`Dokumen (${selected.documents.length})`}>
              <Stack gap="sm">
                {selected.documents.length ? (
                  <Text size="xs" c="dimmed">
                    Gunakan tombol “Lihat dokumen” untuk membuka berkas di tab baru.
                  </Text>
                ) : null}
                {selected.documents.length ? (
                  selected.documents.map((document) => (
                    <Paper key={document.id} withBorder radius="md" p="sm">
                      <Group justify="space-between" align="center" wrap="wrap">
                        <Box style={{ minWidth: 180, flex: 1 }}>
                          <Text fw={600} size="sm">
                            {document.type}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {document.verification_notes || document.description || 'Tanpa catatan'}
                          </Text>
                        </Box>
                        <Group gap="xs">
                          <Button
                            component="a"
                            href={document.file_url}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                            variant="subtle"
                            leftSection={<IconExternalLink size={14} />}
                          >
                            Lihat dokumen
                          </Button>
                          {writable && (
                            <Button
                              size="xs"
                              variant={document.verified ? 'light' : 'outline'}
                              color={document.verified ? 'green' : 'gray'}
                              disabled={saving}
                              leftSection={document.verified ? <IconCheck size={14} /> : undefined}
                              onClick={() =>
                                setConfirmation({
                                  title: document.verified
                                    ? 'Batalkan verifikasi dokumen?'
                                    : 'Verifikasi dokumen?',
                                  message: `${document.type} akan ditandai ${document.verified ? 'belum terverifikasi' : 'sudah terverifikasi'}.`,
                                  confirmLabel: document.verified
                                    ? 'Batalkan verifikasi'
                                    : 'Ya, verifikasi',
                                  color: document.verified ? 'orange' : 'green',
                                  action: () =>
                                    void mutate(
                                      'PATCH',
                                      {
                                        entity: 'document',
                                        id: document.id,
                                        verified: !document.verified,
                                        notes: document.verification_notes || '',
                                      },
                                      'Verifikasi dokumen diperbarui.',
                                      { actionKey: `document:${document.id}` },
                                    ),
                                })
                              }
                              loading={pendingAction === `document:${document.id}`}
                            >
                              {document.verified ? 'Terverifikasi' : 'Verifikasi'}
                            </Button>
                          )}
                        </Group>
                      </Group>
                    </Paper>
                  ))
                ) : (
                  <Text c="dimmed" size="sm">
                    Belum ada dokumen.
                  </Text>
                )}
              </Stack>
            </DetailSection>
            {writable &&
              ['verified', 'selection', 'accepted', 'waitlisted'].includes(selected.status) && (
                <>
                  <Divider label="Penilaian seleksi" />
                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <NumberInput
                      label="Nilai tes"
                      placeholder="0–100"
                      min={0}
                      max={100}
                      value={testScore}
                      onChange={setTestScore}
                    />
                    <NumberInput
                      label="Nilai wawancara"
                      placeholder="0–100"
                      min={0}
                      max={100}
                      value={interviewScore}
                      onChange={setInterviewScore}
                    />
                    <NumberInput
                      label="Peringkat"
                      placeholder="Contoh: 1"
                      min={1}
                      value={ranking}
                      onChange={setRanking}
                    />
                  </SimpleGrid>
                  <Button
                    variant="light"
                    disabled={saving}
                    onClick={() =>
                      setConfirmation({
                        title: 'Simpan penilaian seleksi?',
                        message: `Nilai seleksi ${selected.name} akan diperbarui dengan data yang terisi saat ini.`,
                        confirmLabel: 'Ya, simpan nilai',
                        action: () =>
                          void mutate(
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
                            { actionKey: 'assessment' },
                          ),
                      })
                    }
                    loading={pendingAction === 'assessment'}
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
                  placeholder="Tambahkan catatan hasil verifikasi atau keputusan..."
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                />
                <Group>
                  {nextStatuses[selected.status]!.map((next) => (
                    <Button
                      key={next}
                      color={statusColors[next]}
                      variant="light"
                      disabled={saving}
                      onClick={() =>
                        setConfirmation({
                          title: `Ubah status menjadi ${statusLabels[next]}?`,
                          message: `Status ${selected.name} akan berubah dari ${statusLabels[selected.status]} menjadi ${statusLabels[next]}. Perubahan akan dicatat dalam riwayat.`,
                          confirmLabel: `Ya, ${statusLabels[next]}`,
                          color: statusColors[next],
                          action: () =>
                            void mutate(
                              'PATCH',
                              { entity: 'status', id: selected.id, status: next, notes },
                              `Status diubah menjadi ${statusLabels[next]}.`,
                              { actionKey: `status:${next}` },
                            ),
                        })
                      }
                      loading={pendingAction === `status:${next}`}
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
                    placeholder="Contoh: S-2030-001"
                    value={nis}
                    onChange={(e) => setNis(e.currentTarget.value)}
                  />
                  <Select
                    searchable
                    required
                    label="Rombel"
                    placeholder="Pilih rombel tujuan"
                    data={(options.class_id || []) as Option[]}
                    value={classId || null}
                    onChange={(value) => setClassId(value || '')}
                  />
                  <DateInput
                    required
                    label="Tanggal masuk"
                    placeholder="Pilih tanggal masuk"
                    value={enrollmentDate}
                    valueFormat="D MMMM YYYY"
                    locale="id"
                    onChange={(value) => setEnrollmentDate(value || '')}
                  />
                </SimpleGrid>
                <Button
                  color="green"
                  disabled={saving || !nis || !classId || !enrollmentDate}
                  onClick={() =>
                    setConfirmation({
                      title: 'Konversi menjadi murid aktif?',
                      message: `${selected.name} akan dibuat sebagai murid aktif dengan NIS ${nis}. Identitas, wali, dokumen, dan penempatan rombel akan disalin.`,
                      confirmLabel: 'Ya, jadikan murid aktif',
                      color: 'green',
                      action: () =>
                        void mutate(
                          'POST',
                          {
                            entity: 'convert',
                            id: selected.id,
                            nis,
                            class_id: classId,
                            enrollment_date: enrollmentDate,
                          },
                          'Calon murid berhasil menjadi murid aktif.',
                          { actionKey: 'convert', closeApplication: true },
                        ),
                    })
                  }
                  loading={pendingAction === 'convert'}
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

      <Modal
        opened={Boolean(confirmation)}
        onClose={() => !saving && setConfirmation(null)}
        title={confirmation?.title || 'Konfirmasi tindakan'}
        size="sm"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 2 }}
      >
        {confirmation && (
          <Stack gap="lg">
            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon color={confirmation.color || 'blue'} variant="light" size="lg" radius="xl">
                <IconAlertTriangle size={19} />
              </ThemeIcon>
              <Text size="sm" style={{ flex: 1 }}>
                {confirmation.message}
              </Text>
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmation(null)}>
                Batal
              </Button>
              <Button color={confirmation.color || 'blue'} onClick={runConfirmedAction}>
                {confirmation.confirmLabel}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
