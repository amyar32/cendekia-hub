'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';

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
}: {
  selected: Row | null;
  onChange: (row: Row | null) => void;
  required?: boolean;
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
      error={error || undefined}
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
      if (filterStudent && ['entries', 'summary', 'cases'].includes(tab))
        q.set('student_id', value(filterStudent, 'id'));
      return q;
    },
    [page, term, status, classId, tab, scope, filterStudent],
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
  async function save() {
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
        if (!pickedStudent || !term || !ruleId)
          throw new Error('Pilih murid, semester, dan aturan.');
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
        if (!pickedStudent || !term) throw new Error('Pilih murid dan semester.');
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
        <Group align="end">
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
      </Paper>
      {tab === 'policies' && (
        <Text size="sm" c="dimmed">
          Ambang dievaluasi saat catatan disahkan. Setiap ambang membuat satu kasus per murid per
          semester. Pembatalan poin tidak menutup kasus secara otomatis.
        </Text>
      )}
      <Paper withBorder p="md">
        <Table.ScrollContainer minWidth={700}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {(tab === 'entries'
                  ? ['Murid / kelas', 'Kejadian', 'Jenis / poin', 'Status', 'Pencatat', '']
                  : tab === 'summary'
                    ? ['Murid', 'NIS', 'Apresiasi', 'Pelanggaran', 'Pembinaan aktif']
                    : tab === 'cases'
                      ? ['Murid', 'Pembinaan', 'Penanggung jawab', 'Status', 'Tenggat', '']
                      : tab === 'rules'
                        ? ['Aturan', 'Kategori', 'Jenis', 'Poin', 'Status', '']
                        : ['Tindak lanjut', 'Ambang', 'Status', '']
                ).map((h, i) => (
                  <Table.Th key={i}>{h}</Table.Th>
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
                        <Badge variant="light">{labels[value(row, 'status')]}</Badge>
                      </Table.Td>
                      <Table.Td>{row.created_by_name}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => openDetail(row, 'entries')}
                        >
                          Detail
                        </Button>
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
                      <Table.Td>{labels[value(row, 'status')]}</Table.Td>
                      <Table.Td>{row.due_date || '—'}</Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openDetail(row, 'cases')}>
                          Detail
                        </Button>
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
                      <Table.Td>{row.is_active ? 'Aktif' : 'Nonaktif'}</Table.Td>
                      <Table.Td>
                        {canWrite && (
                          <Button size="xs" variant="light" onClick={() => reset(tab, row)}>
                            Edit
                          </Button>
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
          <Text ta="center" c="dimmed" py="lg">
            Belum ada data untuk filter ini.
          </Text>
        )}
        <Group justify="space-between" mt="md">
          <Text size="sm">{result.total} data</Text>
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.max(1, Math.ceil(result.total / 20))}
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
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              {modal === 'rules' && (
                <>
                  <Select
                    label="Jenis"
                    value={kind}
                    onChange={(v) => setKind(v || 'appreciation')}
                    data={[
                      { value: 'appreciation', label: 'Apresiasi' },
                      { value: 'violation', label: 'Pelanggaran' },
                    ]}
                  />
                  <TextInput
                    label="Kategori"
                    value={category}
                    onChange={(e) => setCategory(e.currentTarget.value)}
                  />
                </>
              )}
              <NumberInput
                label={modal === 'rules' ? 'Bobot poin' : 'Ambang poin pelanggaran'}
                min={1}
                max={modal === 'rules' ? 1000 : 10000}
                allowDecimal={false}
                value={points}
                onChange={setPoints}
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
              <StudentPicker selected={pickedStudent} onChange={setPickedStudent} />
              <Select
                label="Semester"
                value={term}
                onChange={setTerm}
                data={
                  options?.semesters.map((s) => ({
                    value: value(s, 'id'),
                    label: `${s.academic_year_name} · ${s.name}`,
                  })) || []
                }
                required
              />
              {modal === 'entries' ? (
                <>
                  <Select
                    label="Aturan poin"
                    searchable
                    value={ruleId}
                    onChange={setRuleId}
                    data={rules.map((r) => ({
                      value: value(r, 'id'),
                      label: `${r.name} · ${labels[value(r, 'kind')]} ${r.points} poin`,
                    }))}
                    required
                  />
                  <TextInput
                    type="date"
                    label="Tanggal kejadian"
                    value={date}
                    onChange={(e) => setDate(e.currentTarget.value)}
                    required
                  />
                  <FileInput
                    label="Bukti opsional (maks. 5 MB)"
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
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                  />
                  <TextInput
                    type="date"
                    label="Tenggat opsional"
                    value={due}
                    onChange={(e) => setDue(e.currentTarget.value)}
                  />
                </>
              )}
              <Textarea
                label="Catatan"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                minRows={3}
                required
              />
            </>
          )}
          {modal === 'entry-detail' && selected && (
            <>
              <Text fw={600}>
                {selected.student_name} · {selected.rule_name}
              </Text>
              <Text>
                {labels[value(selected, 'kind')]} {selected.points} poin ·{' '}
                {labels[value(selected, 'status')]} · {selected.occurred_on}
              </Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selected.note}</Text>
              {!!selected.review_reason && <Text>Alasan verifikasi: {selected.review_reason}</Text>}
              {!!selected.void_reason && <Text>Alasan pembatalan: {selected.void_reason}</Text>}
              {attachments.map((file) => (
                <Button
                  key={value(file, 'id')}
                  component="a"
                  variant="light"
                  href={`${base}/entries/${selected.id}/attachments/${file.id}`}
                >
                  Unduh {file.original_name}
                </Button>
              ))}
              {canWrite && !!selected.can_attach && (
                <>
                  <FileInput
                    label="Tambah bukti (pencatat saja, maksimal 3 file)"
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
                      value={reason}
                      onChange={(e) => setReason(e.currentTarget.value)}
                    />
                    <Group>
                      {(selected.status === 'pending' ? ['approve', 'reject'] : ['void']).map(
                        (action) => (
                          <Button
                            key={action}
                            color={action === 'approve' ? 'green' : 'red'}
                            loading={busy}
                            onClick={() =>
                              perform(() =>
                                api(`entries/${selected.id}/${action}`, 'POST', { reason }),
                              )
                            }
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
              <Text fw={600}>
                {selected.student_name} · {selected.title}
              </Text>
              <Text>{selected.note}</Text>
              <Text size="sm">
                Penanggung jawab: {selected.responsible_name || 'Belum ditugaskan'}
              </Text>
              <Select
                label="Status"
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
                value={due}
                onChange={(e) => setDue(e.currentTarget.value)}
              />
              <Textarea
                label="Hasil pembinaan (wajib saat selesai)"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
              <Switch
                label="Jadikan saya penanggung jawab"
                checked={assign}
                onChange={(e) => setAssign(e.currentTarget.checked)}
              />
              {canWrite && (
                <Button
                  loading={busy}
                  onClick={() =>
                    perform(() =>
                      api(`cases/${selected.id}`, 'PATCH', {
                        status: caseStatus,
                        due_date: due || null,
                        resolution: reason,
                        ...(assign ? { assign_to_me: true } : {}),
                      }),
                    )
                  }
                >
                  Simpan pembinaan
                </Button>
              )}
              <Title order={5}>Riwayat tindak lanjut</Title>
              {activities.map((item) => (
                <Paper key={value(item, 'id')} withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    {item.created_by_name} · {item.created_at}
                  </Text>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{item.note}</Text>
                </Paper>
              ))}
              {!activities.length && <Text c="dimmed">Belum ada aktivitas.</Text>}
              {canWrite && (
                <>
                  <Textarea
                    label="Catatan tindak lanjut"
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                  />
                  <Button
                    variant="light"
                    loading={busy}
                    onClick={() =>
                      perform(async () => {
                        await api(`cases/${selected.id}/activities`, 'POST', { note });
                        await openDetail(selected, 'cases');
                      }, true)
                    }
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
