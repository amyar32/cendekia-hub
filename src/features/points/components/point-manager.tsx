'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconCalendar,
  IconEye,
  IconFileDescription,
  IconPaperclip,
  IconPencil,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import 'dayjs/locale/id';

type Row = Record<string, string | number | null>;
type Options = {
  capabilities: { can_write: boolean; can_manage: boolean; homeroom_class_id: string | null };
  semesters: Row[];
  classes: Row[];
};
type List = { rows: Row[]; total: number; page: number; page_size: number };
const base = '/api/modules/points';
const labels: Record<string, string> = {
  pending: 'Menunggu',
  approved: 'Disahkan',
  rejected: 'Ditolak',
  voided: 'Dibatalkan',
  open: 'Terbuka',
  in_progress: 'Ditangani',
  resolved: 'Selesai',
  appreciation: 'Apresiasi',
  violation: 'Pelanggaran',
};
const statusColors: Record<
  string,
  'orange' | 'teal' | 'red' | 'gray' | 'blue' | 'yellow' | 'green'
> = {
  pending: 'orange',
  approved: 'teal',
  rejected: 'red',
  voided: 'gray',
  open: 'blue',
  in_progress: 'yellow',
  resolved: 'green',
};
function StatusBadge({ status, size = 'lg' }: { status: string; size?: 'sm' | 'lg' }) {
  return (
    <Badge color={statusColors[status] || 'gray'} variant="filled" size={size} radius="sm">
      {labels[status] || status}
    </Badge>
  );
}
const value = (r: Row, key: string) => String(r[key] ?? '');
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(base + '/' + path, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || 'Gagal memuat data.');
  return json.data;
}
function StudentPicker({
  selected,
  onChange,
  required = true,
  validationError,
}: {
  selected: Row | null;
  onChange: (row: Row | null) => void;
  required?: boolean;
  validationError?: string;
}) {
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search, 250);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<List>('students?search=' + encodeURIComponent(query))
      .then((data) => {
        if (active) {
          setRows(data.rows);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query]);
  const options = [...(selected ? [selected] : []), ...rows.filter((r) => r.id !== selected?.id)];
  return (
    <Select
      label="Murid"
      placeholder="Cari nama atau NIS"
      searchable
      clearable
      searchValue={search}
      onSearchChange={setSearch}
      value={selected ? value(selected, 'id') : null}
      data={options.map((r) => ({
        value: value(r, 'id'),
        label: `${r.name} · ${r.nis} · ${r.class_name || 'Belum ada kelas'}`,
      }))}
      onChange={(id) => onChange(options.find((r) => r.id === id) || null)}
      error={validationError || error || undefined}
      nothingFoundMessage="Murid tidak ditemukan"
      required={required}
    />
  );
}
export function PointManager() {
  const [options, setOptions] = useState<Options | null>(null);
  const [tab, setTab] = useState('entries');
  const [term, setTerm] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ruleKindFilter, setRuleKindFilter] = useState<string | null>(null);
  const [policySearch, setPolicySearch] = useState('');
  const [scope, setScope] = useState('accessible');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<List>({ rows: [], total: 0, page: 1, page_size: 20 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [pickedStudent, setPickedStudent] = useState<Row | null>(null);
  const [filterStudent, setFilterStudent] = useState<Row | null>(null);
  const [rules, setRules] = useState<Row[]>([]);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('appreciation');
  const [points, setPoints] = useState<number | string>(5);
  const [category, setCategory] = useState('');
  const [active, setActive] = useState(true);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [activities, setActivities] = useState<Row[]>([]);
  const [caseStatus, setCaseStatus] = useState('open');
  const [assign, setAssign] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    api<Options>('options')
      .then((data) => {
        setOptions(data);
        setTerm(
          value(
            data.semesters.find((s) => s.is_active && s.year_active) || data.semesters[0] || {},
            'id',
          ) || null,
        );
      })
      .catch((e) => setError(e.message));
  }, []);
  const query = useCallback(
    (targetPage = page) => {
      const q = new URLSearchParams({ page: String(targetPage) });
      if (term && ['entries', 'summary', 'cases'].includes(tab)) q.set('semester_id', term);
      if (status && ['entries', 'cases'].includes(tab)) q.set('status', status);
      if (classId && ['entries', 'summary'].includes(tab)) q.set('class_id', classId);
      if (tab === 'entries') q.set('scope', scope);
      if (tab === 'rules' && ruleKindFilter) q.set('kind', ruleKindFilter);
      if (tab === 'policies' && policySearch.trim()) q.set('search', policySearch.trim());
      if (filterStudent && ['entries', 'summary', 'cases'].includes(tab))
        q.set('student_id', value(filterStudent, 'id'));
      return q;
    },
    [page, term, status, classId, tab, scope, filterStudent, ruleKindFilter, policySearch],
  );
  const reload = useCallback(async () => {
    if (!options || (tab === 'summary' && !term)) return;
    setLoading(true);
    try {
      setResult(await api<List>(`${tab}?${query()}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [options, tab, term, query]);
  useEffect(() => {
    let active = true;
    if (!options || (tab === 'summary' && !term)) return;
    api<List>(`${tab}?${query()}`)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [options, tab, term, query]);
  const close = () => {
    if (!busy) setModal(null);
  };
  function reset(action: string, row: Row | null = null) {
    setError('');
    setFormErrors({});
    setSelected(row);
    setPickedStudent(null);
    setName(row ? value(row, 'name') : '');
    setKind(row ? value(row, 'kind') || 'appreciation' : 'appreciation');
    setPoints(row ? Number(row.points ?? row.threshold ?? 5) : 5);
    setCategory(row ? value(row, 'category') : '');
    setActive(row ? !!row.is_active : true);
    setNote('');
    setReason('');
    setDue(row ? value(row, 'due_date') : '');
    setDate('');
    setRuleId(null);
    setAttachment(null);
    setRequestId(crypto.randomUUID());
    setAssign(false);
    setModal(action);
  }
  async function loadRules() {
    const all: Row[] = [];
    let p = 1;
    for (;;) {
      const data = await api<List>(`rules?page_size=100&page=${p++}`);
      all.push(...data.rows);
      if (all.length >= data.total) break;
    }
    setRules(all.filter((r) => r.is_active));
  }
  async function openDetail(row: Row, resource: 'entries' | 'cases') {
    try {
      const detail = await api<
        { attachments?: Row[]; activities?: Row[] } & Record<string, string | number | null | Row[]>
      >(`${resource}/${row.id}`);
      const { attachments: files, activities: events, ...record } = detail;
      setSelected(record as Row);
      setAttachments(files || []);
      setActivities(events || []);
      setNote('');
      setReason(value(record as Row, resource === 'cases' ? 'resolution' : 'review_reason'));
      setDue(value(record as Row, 'due_date'));
      setCaseStatus(value(record as Row, 'status'));
      setAssign(false);
      setAttachment(null);
      setFormErrors({});
      setModal(resource === 'entries' ? 'entry-detail' : 'case-detail');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function perform(task: () => Promise<unknown>, keep = false) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await task();
      setSuccess('Perubahan berhasil disimpan.');
      if (!keep) setModal(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canManage = !!options?.capabilities.can_manage;
  const canWrite = !!options?.capabilities.can_write;
  const canCoach = canManage || !!options?.capabilities.homeroom_class_id;
  function validate(fields: Record<string, string | undefined>) {
    const next = Object.fromEntries(
      Object.entries(fields).filter(([, message]) => Boolean(message)),
    ) as Record<string, string>;
    setFormErrors(next);
    return Object.keys(next).length === 0;
  }
  async function save() {
    let valid = true;
    if (modal === 'rules')
      valid = validate({
        name: name.trim() ? undefined : 'Nama aturan wajib diisi.',
        category: category.trim() ? undefined : 'Kategori wajib diisi.',
        points:
          Number(points) >= 1 && Number(points) <= 1000
            ? undefined
            : 'Bobot harus antara 1–1000 poin.',
      });
    if (modal === 'policies')
      valid = validate({
        name: name.trim() ? undefined : 'Tindak lanjut wajib diisi.',
        points:
          Number(points) >= 1 && Number(points) <= 10000
            ? undefined
            : 'Ambang harus antara 1–10000 poin.',
      });
    if (modal === 'entries')
      valid = validate({
        student: pickedStudent ? undefined : 'Pilih murid terlebih dahulu.',
        semester: term ? undefined : 'Pilih semester.',
        rule: ruleId ? undefined : 'Pilih aturan poin.',
        date: date ? undefined : 'Tanggal kejadian wajib diisi.',
        note: note.trim() ? undefined : 'Catatan wajib diisi.',
      });
    if (modal === 'cases')
      valid = validate({
        student: pickedStudent ? undefined : 'Pilih murid terlebih dahulu.',
        semester: term ? undefined : 'Pilih semester.',
        name: name.trim() ? undefined : 'Judul pembinaan wajib diisi.',
        note: note.trim() ? undefined : 'Catatan wajib diisi.',
      });
    if (!valid) return;
    await perform(async () => {
      if (modal === 'rules')
        return api(`rules${selected ? '/' + selected.id : ''}`, selected ? 'PATCH' : 'POST', {
          name,
          kind,
          points: Number(points),
          category,
          is_active: active,
        });
      if (modal === 'policies')
        return api(`policies${selected ? '/' + selected.id : ''}`, selected ? 'PATCH' : 'POST', {
          name,
          threshold: Number(points),
          is_active: active,
        });
      if (modal === 'entries') {
        if (!pickedStudent || !term || !ruleId) return;
        const entry = await api<Row>('entries', 'POST', {
          student_id: pickedStudent.id,
          semester_id: term,
          rule_id: ruleId,
          occurred_on: date,
          note,
          client_request_id: requestId,
        });
        if (attachment) {
          const form = new FormData();
          form.set('file', attachment);
          try {
            await api(`entries/${entry.id}/attachments`, 'POST', form);
          } catch (e) {
            setSelected(entry);
            setAttachments([]);
            setModal('entry-detail');
            throw new Error(
              `Catatan sudah tersimpan. Unggah bukti gagal: ${(e as Error).message}. Coba unggah melalui detail catatan.`,
            );
          }
        }
        return entry;
      }
      if (modal === 'cases') {
        if (!pickedStudent || !term) return;
        return api('cases', 'POST', {
          student_id: pickedStudent.id,
          semester_id: term,
          title: name,
          note,
          due_date: due || null,
        });
      }
    });
  }
  async function exportReport() {
    await perform(async () => {
      const rows: Row[] = [];
      let p = 1;
      for (;;) {
        const q = query(p++);
        q.set('page_size', '100');
        const data = await api<List>(`${tab}?${q}`);
        rows.push(...data.rows);
        if (rows.length >= data.total) break;
      }
      const fields =
        tab === 'summary'
          ? ['name', 'nis', 'appreciation', 'violation', 'open_cases']
          : [
              'student_name',
              'class_name',
              'occurred_on',
              'rule_name',
              'kind',
              'points',
              'status',
              'note',
            ];
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Poin Murid');
      sheet.columns = fields.map((field) => ({ header: field, key: field, width: 24 }));
      for (const row of rows)
        sheet.addRow(Object.fromEntries(fields.map((field) => [field, row[field] ?? ''])));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(buffer)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `poin-${tab}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    }, true);
  }
  const statuses =
    tab === 'cases'
      ? ['open', 'in_progress', 'resolved']
      : ['pending', 'approved', 'rejected', 'voided'];
  const managerOfSelected = !!selected?.can_review;
  return (
    <Stack>
      <div>
        <Title order={2}>Poin & Pembinaan Murid</Title>
        <Text c="dimmed">
          Apresiasi dan pelanggaran dihitung terpisah. Hanya catatan yang disahkan masuk rekap.
        </Text>
      </div>
      {error && !modal && (
        <Alert color="red" title="Periksa kembali">
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v || 'entries');
          setPage(1);
          setStatus(null);
          setRuleKindFilter(null);
          setPolicySearch('');
          setResult({ rows: [], total: 0, page: 1, page_size: 20 });
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="entries">Catatan & Verifikasi</Tabs.Tab>
          {canCoach && <Tabs.Tab value="summary">Rekap Semester</Tabs.Tab>}
          {canCoach && <Tabs.Tab value="cases">Pembinaan</Tabs.Tab>}
          {canManage && <Tabs.Tab value="rules">Aturan Poin</Tabs.Tab>}
          {canManage && <Tabs.Tab value="policies">Ambang Pembinaan</Tabs.Tab>}
        </Tabs.List>
      </Tabs>
      <Paper withBorder p="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {['entries', 'summary', 'cases'].includes(tab) && (
              <StudentPicker
                selected={filterStudent}
                required={false}
                onChange={(row) => {
                  setFilterStudent(row);
                  setPage(1);
                }}
              />
            )}
            {['entries', 'summary', 'cases'].includes(tab) && (
              <Select
                label="Semester"
                placeholder="Pilih semester"
                value={term}
                onChange={(v) => {
                  setTerm(v);
                  setPage(1);
                }}
                data={
                  options?.semesters.map((s) => ({
                    value: value(s, 'id'),
                    label: `${s.academic_year_name} · ${s.name}`,
                  })) || []
                }
              />
            )}
            {['entries', 'summary'].includes(tab) && (
              <Select
                label="Kelas"
                clearable
                placeholder="Semua yang dapat diakses"
                value={classId}
                onChange={(v) => {
                  setClassId(v);
                  setPage(1);
                }}
                data={(options?.classes || [])
                  .filter(
                    (c) =>
                      tab !== 'summary' ||
                      canManage ||
                      c.id === options?.capabilities.homeroom_class_id,
                  )
                  .map((c) => ({ value: value(c, 'id'), label: value(c, 'name') }))}
              />
            )}
            {['entries', 'cases'].includes(tab) && (
              <Select
                label="Status"
                clearable
                placeholder="Semua status"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                data={statuses.map((s) => ({ value: s, label: labels[s] }))}
              />
            )}
            {tab === 'entries' && (
              <Select
                label="Cakupan"
                placeholder="Pilih cakupan data"
                value={scope}
                onChange={(v) => {
                  setScope(v || 'accessible');
                  setPage(1);
                }}
                data={[
                  { value: 'accessible', label: 'Semua yang dapat diakses' },
                  { value: 'mine', label: 'Pengajuan saya' },
                  ...(options?.capabilities.homeroom_class_id
                    ? [{ value: 'homeroom', label: 'Kelas wali saya' }]
                    : []),
                ]}
              />
            )}
            {tab === 'rules' && (
              <Select
                label="Jenis aturan"
                placeholder="Semua jenis aturan"
                clearable
                value={ruleKindFilter}
                onChange={(value) => {
                  setRuleKindFilter(value);
                  setPage(1);
                }}
                data={[
                  { value: 'appreciation', label: 'Apresiasi' },
                  { value: 'violation', label: 'Pelanggaran' },
                ]}
              />
            )}
            {tab === 'policies' && (
              <TextInput
                label="Cari ambang pembinaan"
                placeholder="Cari nama tindak lanjut"
                value={policySearch}
                onChange={(event) => {
                  setPolicySearch(event.currentTarget.value);
                  setPage(1);
                }}
                leftSection={<IconSearch size={16} />}
              />
            )}
          </SimpleGrid>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" loading={loading} onClick={reload}>
              Perbarui
            </Button>
            {['entries', 'summary'].includes(tab) && (
              <Button variant="default" loading={busy} onClick={exportReport}>
                Ekspor Excel
              </Button>
            )}
            {canWrite && tab !== 'summary' && (
              <Button
                onClick={() => {
                  reset(tab);
                  if (tab === 'entries') loadRules().catch((e) => setError(e.message));
                }}
              >
                Tambah{' '}
                {tab === 'entries'
                  ? 'catatan'
                  : tab === 'cases'
                    ? 'pembinaan'
                    : tab === 'rules'
                      ? 'aturan'
                      : 'ambang'}
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
      {tab === 'policies' && (
        <Text size="sm" c="dimmed">
          Ambang dievaluasi saat catatan disahkan. Setiap ambang membuat satu kasus per murid per
          semester. Pembatalan poin tidak menutup kasus secara otomatis.
        </Text>
      )}
      <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={tab === 'entries' ? 960 : tab === 'cases' ? 840 : 720}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover fz="xs">
            <Table.Thead>
              <Table.Tr>
                {(tab === 'entries'
                  ? ['Murid / kelas', 'Kejadian', 'Jenis / poin', 'Status', 'Pencatat', 'Aksi']
                  : tab === 'summary'
                    ? ['Murid', 'NIS', 'Apresiasi', 'Pelanggaran', 'Pembinaan aktif']
                    : tab === 'cases'
                      ? ['Murid', 'Pembinaan', 'Penanggung jawab', 'Status', 'Tenggat', 'Aksi']
                      : tab === 'rules'
                        ? ['Aturan', 'Kategori', 'Jenis', 'Poin', 'Status', 'Aksi']
                        : ['Tindak lanjut', 'Ambang', 'Status', 'Aksi']
                ).map((h, i) => (
                  <Table.Th key={i} ta={h === 'Aksi' ? 'right' : undefined}>
                    {h.toUpperCase()}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.rows.map((row) => (
                <Table.Tr key={value(row, 'id')}>
                  {tab === 'entries' ? (
                    <>
                      <Table.Td>
                        {row.student_name}
                        <Text size="xs" c="dimmed">
                          {row.class_name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {row.rule_name}
                        <Text size="xs">{row.occurred_on}</Text>
                      </Table.Td>
                      <Table.Td>
                        {labels[value(row, 'kind')]} · {row.points}
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge status={value(row, 'status')} size="sm" />
                      </Table.Td>
                      <Table.Td>{row.created_by_name}</Table.Td>
                      <Table.Td ta="right">
                        <ActionIcon
                          aria-label={`Lihat detail catatan ${row.student_name}`}
                          title="Lihat detail"
                          variant="subtle"
                          color="blue"
                          onClick={() => openDetail(row, 'entries')}
                        >
                          <IconEye size={17} />
                        </ActionIcon>
                      </Table.Td>
                    </>
                  ) : tab === 'summary' ? (
                    <>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{row.nis}</Table.Td>
                      <Table.Td>{row.appreciation}</Table.Td>
                      <Table.Td>{row.violation}</Table.Td>
                      <Table.Td>{row.open_cases}</Table.Td>
                    </>
                  ) : tab === 'cases' ? (
                    <>
                      <Table.Td>{row.student_name}</Table.Td>
                      <Table.Td>{row.title}</Table.Td>
                      <Table.Td>{row.responsible_name || 'Belum ditugaskan'}</Table.Td>
                      <Table.Td>
                        <StatusBadge status={value(row, 'status')} size="sm" />
                      </Table.Td>
                      <Table.Td>{row.due_date || '—'}</Table.Td>
                      <Table.Td ta="right">
                        <ActionIcon
                          aria-label={`Lihat detail pembinaan ${row.student_name}`}
                          title="Lihat detail"
                          variant="subtle"
                          color="blue"
                          onClick={() => openDetail(row, 'cases')}
                        >
                          <IconEye size={17} />
                        </ActionIcon>
                      </Table.Td>
                    </>
                  ) : (
                    <>
                      <Table.Td>{row.name}</Table.Td>
                      {tab === 'rules' && (
                        <>
                          <Table.Td>{row.category}</Table.Td>
                          <Table.Td>{labels[value(row, 'kind')]}</Table.Td>
                        </>
                      )}
                      <Table.Td>{row.points ?? row.threshold}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={row.is_active ? 'green' : 'gray'}
                          variant="filled"
                          size="sm"
                          radius="sm"
                        >
                          {row.is_active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        {canWrite && (
                          <ActionIcon
                            aria-label={`Edit ${row.name}`}
                            title="Edit"
                            variant="subtle"
                            color="gray"
                            onClick={() => reset(tab, row)}
                          >
                            <IconPencil size={17} />
                          </ActionIcon>
                        )}
                      </Table.Td>
                    </>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!result.rows.length && (
          <Text ta="center" c="dimmed" py="xl" px="md">
            Belum ada data untuk filter ini.
          </Text>
        )}
        <Group
          justify="space-between"
          px={24}
          py={18}
          style={{ borderTop: '1px solid var(--app-color-border)' }}
        >
          <Text variant="label">
            {result.total
              ? `${(page - 1) * result.page_size + 1}–${Math.min(page * result.page_size, result.total)} dari ${result.total} data`
              : '0 data'}
          </Text>
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.max(1, Math.ceil(result.total / result.page_size))}
            size="sm"
          />
        </Group>
      </Paper>
      <Modal
        opened={!!modal}
        onClose={close}
        title={
          modal === 'entry-detail'
            ? 'Detail catatan'
            : modal === 'case-detail'
              ? 'Detail pembinaan'
              : selected
                ? 'Edit pengaturan'
                : 'Tambah data'
        }
        size="lg"
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          {(modal === 'rules' || modal === 'policies') && (
            <>
              <TextInput
                label={modal === 'rules' ? 'Nama aturan' : 'Tindak lanjut'}
                placeholder={
                  modal === 'rules'
                    ? 'Contoh: Datang tepat waktu'
                    : 'Contoh: Konseling dengan wali kelas'
                }
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={formErrors.name}
                required
              />
              {modal === 'rules' && (
                <>
                  <Select
                    label="Jenis"
                    placeholder="Pilih jenis poin"
                    value={kind}
                    onChange={(v) => setKind(v || 'appreciation')}
                    data={[
                      { value: 'appreciation', label: 'Apresiasi' },
                      { value: 'violation', label: 'Pelanggaran' },
                    ]}
                  />
                  <TextInput
                    label="Kategori"
                    placeholder="Contoh: Kedisiplinan"
                    value={category}
                    onChange={(e) => setCategory(e.currentTarget.value)}
                    error={formErrors.category}
                    required
                  />
                </>
              )}
              <NumberInput
                label={modal === 'rules' ? 'Bobot poin' : 'Ambang poin pelanggaran'}
                placeholder="Masukkan jumlah poin"
                min={1}
                max={modal === 'rules' ? 1000 : 10000}
                allowDecimal={false}
                value={points}
                onChange={setPoints}
                error={formErrors.points}
                required
              />
              <Switch
                label="Aktif"
                checked={active}
                onChange={(e) => setActive(e.currentTarget.checked)}
              />
            </>
          )}
          {(modal === 'entries' || modal === 'cases') && (
            <>
              <StudentPicker
                selected={pickedStudent}
                onChange={setPickedStudent}
                validationError={formErrors.student}
              />
              <Select
                label="Semester"
                placeholder="Pilih semester"
                value={term}
                onChange={setTerm}
                data={
                  options?.semesters.map((s) => ({
                    value: value(s, 'id'),
                    label: `${s.academic_year_name} · ${s.name}`,
                  })) || []
                }
                required
                error={formErrors.semester}
              />
              {modal === 'entries' ? (
                <>
                  <Select
                    label="Aturan poin"
                    placeholder="Pilih aturan poin"
                    searchable
                    value={ruleId}
                    onChange={setRuleId}
                    data={rules.map((r) => ({
                      value: value(r, 'id'),
                      label: `${r.name} · ${labels[value(r, 'kind')]} ${r.points} poin`,
                    }))}
                    required
                    error={formErrors.rule}
                  />
                  <DateInput
                    label="Tanggal kejadian"
                    placeholder="Pilih tanggal kejadian"
                    value={date || null}
                    onChange={(value) => setDate(value || '')}
                    valueFormat="DD MMMM YYYY"
                    locale="id"
                    maxDate={new Date()}
                    required
                    error={formErrors.date}
                  />
                  <FileInput
                    label="Bukti opsional (maks. 5 MB)"
                    placeholder="Pilih gambar atau PDF"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    value={attachment}
                    onChange={setAttachment}
                    clearable
                  />
                </>
              ) : (
                <>
                  <TextInput
                    label="Judul pembinaan"
                    placeholder="Contoh: Pembinaan kedisiplinan"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                    error={formErrors.name}
                  />
                  <TextInput
                    type="date"
                    label="Tenggat opsional"
                    placeholder="Pilih tanggal tenggat"
                    value={due}
                    onChange={(e) => setDue(e.currentTarget.value)}
                  />
                </>
              )}
              <Textarea
                label="Catatan"
                placeholder={
                  modal === 'entries'
                    ? 'Jelaskan kejadian yang dicatat'
                    : 'Jelaskan tujuan atau konteks pembinaan'
                }
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                minRows={3}
                required
                error={formErrors.note}
              />
            </>
          )}
          {modal === 'entry-detail' && selected && (
            <>
              <Paper withBorder p="md" radius="md" bg="var(--mantine-color-gray-0)">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Catatan poin murid
                    </Text>
                    <Title order={4} mt={4}>
                      {selected.student_name}
                    </Title>
                    <Text c="dimmed" mt={2}>
                      {selected.class_name || 'Kelas tidak tercatat'}
                    </Text>
                  </div>
                  <StatusBadge status={value(selected, 'status')} />
                </Group>
                <Divider my="md" />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <div>
                    <Group gap={6} c="dimmed">
                      <IconFileDescription size={16} />
                      <Text size="xs" fw={700} tt="uppercase">
                        Aturan poin
                      </Text>
                    </Group>
                    <Text fw={600} mt={3}>
                      {selected.rule_name}
                    </Text>
                    <Badge
                      mt={6}
                      color={value(selected, 'kind') === 'violation' ? 'red' : 'teal'}
                      variant="light"
                    >
                      {labels[value(selected, 'kind')]} · {selected.points} poin
                    </Badge>
                  </div>
                  <div>
                    <Group gap={6} c="dimmed">
                      <IconCalendar size={16} />
                      <Text size="xs" fw={700} tt="uppercase">
                        Tanggal kejadian
                      </Text>
                    </Group>
                    <Text fw={600} mt={3}>
                      {selected.occurred_on}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Dicatat oleh {selected.created_by_name || '—'}
                    </Text>
                  </div>
                </SimpleGrid>
              </Paper>
              <Paper withBorder p="md" radius="md">
                <Text size="sm" fw={700} mb={6}>
                  Catatan kejadian
                </Text>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{selected.note}</Text>
              </Paper>
              {!!selected.review_reason && (
                <Alert color="blue" title="Alasan verifikasi">
                  {selected.review_reason}
                </Alert>
              )}
              {!!selected.void_reason && (
                <Alert color="gray" title="Alasan pembatalan">
                  {selected.void_reason}
                </Alert>
              )}
              {!!attachments.length && (
                <Paper withBorder p="md" radius="md">
                  <Group gap={6} mb="sm">
                    <IconPaperclip size={17} />
                    <Text size="sm" fw={700}>
                      Bukti lampiran ({attachments.length})
                    </Text>
                  </Group>
                  <Stack gap="xs">
                    {attachments.map((file) => (
                      <Button
                        key={value(file, 'id')}
                        component="a"
                        variant="light"
                        justify="space-between"
                        rightSection={<IconPaperclip size={16} />}
                        href={`${base}/entries/${selected.id}/attachments/${file.id}`}
                      >
                        {file.original_name}
                      </Button>
                    ))}
                  </Stack>
                </Paper>
              )}
              {canWrite && !!selected.can_attach && (
                <>
                  <FileInput
                    label="Tambah bukti (pencatat saja, maksimal 3 file)"
                    placeholder="Pilih gambar atau PDF"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    value={attachment}
                    onChange={setAttachment}
                  />
                  <Button
                    variant="light"
                    disabled={!attachment}
                    loading={busy}
                    onClick={() =>
                      perform(async () => {
                        const form = new FormData();
                        form.set('file', attachment!);
                        await api(`entries/${selected.id}/attachments`, 'POST', form);
                        await openDetail(selected, 'entries');
                      }, true)
                    }
                  >
                    Unggah bukti
                  </Button>
                </>
              )}
              {canWrite &&
                managerOfSelected &&
                ['pending', 'approved'].includes(value(selected, 'status')) && (
                  <>
                    <Textarea
                      label="Alasan (wajib untuk penolakan/pembatalan)"
                      placeholder="Tuliskan alasan penolakan atau pembatalan"
                      value={reason}
                      onChange={(e) => setReason(e.currentTarget.value)}
                      error={formErrors.reason}
                    />
                    <Group>
                      {(selected.status === 'pending' ? ['approve', 'reject'] : ['void']).map(
                        (action) => (
                          <Button
                            key={action}
                            color={action === 'approve' ? 'green' : 'red'}
                            loading={busy}
                            onClick={() => {
                              if (
                                action !== 'approve' &&
                                !validate({
                                  reason: reason.trim() ? undefined : 'Alasan wajib diisi.',
                                })
                              )
                                return;
                              perform(() =>
                                api(`entries/${selected.id}/${action}`, 'POST', { reason }),
                              );
                            }}
                          >
                            {action === 'approve'
                              ? 'Sahkan'
                              : action === 'reject'
                                ? 'Tolak'
                                : 'Batalkan poin'}
                          </Button>
                        ),
                      )}
                    </Group>
                  </>
                )}
            </>
          )}
          {modal === 'case-detail' && selected && (
            <>
              <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-0)">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Pembinaan murid
                    </Text>
                    <Title order={4} mt={4}>
                      {selected.student_name}
                    </Title>
                    <Text c="dimmed" mt={2}>
                      {selected.title}
                    </Text>
                  </div>
                  <StatusBadge status={value(selected, 'status')} />
                </Group>
                <Divider my="md" />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <div>
                    <Group gap={6} c="dimmed">
                      <IconUser size={16} />
                      <Text size="xs" fw={700} tt="uppercase">
                        Penanggung jawab
                      </Text>
                    </Group>
                    <Text fw={600} mt={3}>
                      {selected.responsible_name || 'Belum ditugaskan'}
                    </Text>
                  </div>
                  <div>
                    <Group gap={6} c="dimmed">
                      <IconCalendar size={16} />
                      <Text size="xs" fw={700} tt="uppercase">
                        Tenggat
                      </Text>
                    </Group>
                    <Text fw={600} mt={3}>
                      {selected.due_date || 'Belum ditentukan'}
                    </Text>
                  </div>
                </SimpleGrid>
              </Paper>
              <Paper withBorder p="md" radius="md">
                <Text size="sm" fw={700} mb={6}>
                  Konteks pembinaan
                </Text>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{selected.note}</Text>
              </Paper>
              <Divider label="Perbarui pembinaan" labelPosition="center" />
              <Select
                label="Status"
                placeholder="Pilih status pembinaan"
                value={caseStatus}
                onChange={(v) => setCaseStatus(v || 'open')}
                data={['open', 'in_progress', 'resolved'].map((s) => ({
                  value: s,
                  label: labels[s],
                }))}
              />
              <TextInput
                type="date"
                label="Tenggat"
                placeholder="Pilih tanggal tenggat"
                value={due}
                onChange={(e) => setDue(e.currentTarget.value)}
              />
              <Textarea
                label="Hasil pembinaan (wajib saat selesai)"
                placeholder="Tuliskan hasil atau kesepakatan pembinaan"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                error={formErrors.resolution}
              />
              <Switch
                label="Jadikan saya penanggung jawab"
                checked={assign}
                onChange={(e) => setAssign(e.currentTarget.checked)}
              />
              {canWrite && (
                <Button
                  loading={busy}
                  onClick={() => {
                    if (
                      caseStatus === 'resolved' &&
                      !validate({
                        resolution: reason.trim()
                          ? undefined
                          : 'Hasil pembinaan wajib diisi saat status selesai.',
                      })
                    )
                      return;
                    perform(() =>
                      api(`cases/${selected.id}`, 'PATCH', {
                        status: caseStatus,
                        due_date: due || null,
                        resolution: reason,
                        ...(assign ? { assign_to_me: true } : {}),
                      }),
                    );
                  }}
                >
                  Simpan pembinaan
                </Button>
              )}
              <Divider label="Riwayat tindak lanjut" labelPosition="center" />
              {activities.map((item) => (
                <Paper key={value(item, 'id')} withBorder p="md" radius="md">
                  <Group justify="space-between" mb={6}>
                    <Text size="sm" fw={600}>
                      {item.created_by_name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {item.created_at}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {item.note}
                  </Text>
                </Paper>
              ))}
              {!activities.length && (
                <Text ta="center" c="dimmed" py="sm">
                  Belum ada aktivitas tindak lanjut.
                </Text>
              )}
              {canWrite && (
                <>
                  <Textarea
                    label="Catatan tindak lanjut"
                    placeholder="Tuliskan perkembangan atau tindak lanjut"
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                    error={formErrors.activity}
                  />
                  <Button
                    variant="light"
                    loading={busy}
                    onClick={() => {
                      if (
                        !validate({
                          activity: note.trim() ? undefined : 'Catatan tindak lanjut wajib diisi.',
                        })
                      )
                        return;
                      perform(async () => {
                        await api(`cases/${selected.id}/activities`, 'POST', { note });
                        await openDetail(selected, 'cases');
                      }, true);
                    }}
                  >
                    Tambah aktivitas
                  </Button>
                </>
              )}
            </>
          )}
          {['rules', 'policies', 'entries', 'cases'].includes(modal || '') && (
            <Button loading={busy} onClick={save}>
              Simpan
            </Button>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
