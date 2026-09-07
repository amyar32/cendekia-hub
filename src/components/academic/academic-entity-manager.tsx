'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconEye,
  IconFile,
  IconPencil,
  IconSchool,
  IconTrash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import 'dayjs/locale/id';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';
import { ImageUploader } from '@/components/cms/image-uploader/image-uploader';
import { FileUploader } from '@/components/cms/file-uploader/file-uploader';
import type { UploadScope } from '@/lib/uploads';
import classes from './academic-entity-manager.module.css';

type Value = string | string[] | number | boolean;
export type AcademicRow = {
  id: string;
  is_active?: number;
  [key: string]: string | number | undefined;
};
export type AcademicField = {
  key: string;
  label: string;
  kind?:
    'text' | 'textarea' | 'number' | 'select' | 'date' | 'date-range' | 'image' | 'file' | 'switch';
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  optionsKey?: string;
  /** Allows selecting several values when creating a record. Edits remain one value at a time. */
  multipleKey?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  uploadScope?: UploadScope;
  secondaryKey?: string;
  secondaryLabel?: string;
  secondaryPlaceholder?: string;
};
export type AcademicColumn = {
  key: string;
  label: string;
  kind?: 'text' | 'status' | 'date' | 'code' | 'avatar' | 'file';
};
export type AcademicEntityConfig = {
  endpoint: string;
  title: string;
  singular: string;
  description: string;
  note: string;
  fields: AcademicField[];
  columns: AcademicColumn[];
  defaults: Record<string, Value>;
  eyebrow?: string;
  hasStatus?: boolean;
  academicYearFilter?: boolean;
  groupedRowsReadOnly?: boolean;
  viewStudents?: boolean;
  filters?: Array<{
    key: string;
    label: string;
    optionsKey?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const inputWrapperOrder: Array<'label' | 'input' | 'description' | 'error'> = [
  'label',
  'input',
  'description',
  'error',
];
function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function AcademicEntityManager({
  config,
  writable,
}: {
  config: AcademicEntityConfig;
  writable: boolean;
}) {
  const [academicYearId, setAcademicYearId] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const list = useModuleList<AcademicRow>(config.endpoint, {
    ...(config.academicYearFilter && academicYearId ? { academic_year_id: academicYearId } : {}),
    ...filters,
  });
  const selectedAcademicYearId = academicYearId || list.selected?.academic_year_id || '';
  const [editing, setEditing] = useState<AcademicRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<AcademicRow | null>(null);
  const [viewingStudents, setViewingStudents] = useState<AcademicRow | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; nis: string; name: string }>>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [form, setForm] = useState<Record<string, Value>>(config.defaults);
  const [saving, setSaving] = useState(false);

  function openEditor(row: AcademicRow | null) {
    const values = { ...config.defaults };
    if (!row && config.academicYearFilter && 'academic_year_id' in values)
      values.academic_year_id = selectedAcademicYearId;
    if (row)
      for (const field of config.fields) {
        const value = row[field.key] ?? config.defaults[field.key];
        values[field.key] = field.kind === 'select' ? String(value) : value;
        if (field.kind === 'date-range' && field.secondaryKey) {
          values[field.secondaryKey] =
            row[field.secondaryKey] ?? config.defaults[field.secondaryKey];
        }
      }
    if (config.hasStatus !== false)
      values.is_active = row ? Boolean(row.is_active) : config.defaults.is_active;
    setForm(values);
    setEditing(row);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await moduleMutation(config.endpoint, editing ? 'PATCH' : 'POST', {
        ...form,
        ...(config.academicYearFilter && !editing
          ? { academic_year_id: selectedAcademicYearId }
          : {}),
        id: editing?.id,
      });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: result.created === 0 ? 'blue' : 'green',
        title: result.created === 0 ? 'Tidak ada data baru' : 'Berhasil',
        message:
          result.created == null
            ? `${config.singular} berhasil disimpan.`
            : `${result.created} ${config.singular.toLowerCase()} berhasil ditambahkan.${result.skipped ? ` ${result.skipped} rombel sudah memiliki penugasan yang sama.` : ''}`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: `Gagal menyimpan ${config.singular.toLowerCase()}`,
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setSaving(true);
    try {
      await moduleMutation(config.endpoint, 'DELETE', { id: removing.id });
      setRemoving(null);
      if (list.rows.length === 1 && list.page > 1) list.setPage(list.page - 1);
      else list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: `${config.singular} telah dihapus.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: `Gagal menghapus ${config.singular.toLowerCase()}`,
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }
  async function openStudents(row: AcademicRow) {
    setViewingStudents(row);
    setStudents([]);
    setLoadingStudents(true);
    try {
      const response = await fetch(`${config.endpoint}?view_class_id=${row.id}`);
      const result = (await response.json()) as {
        students?: Array<{ id: string; nis: string; name: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || 'Koneksi gagal.');
      setStudents(result.students || []);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal memuat murid',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
      setViewingStudents(null);
    } finally {
      setLoadingStudents(false);
    }
  }
  function renderCell(row: AcademicRow, column: AcademicColumn) {
    const value = row[column.key];
    if (column.kind === 'status')
      return (
        <Badge variant="dot" color={value ? 'green' : 'gray'}>
          {value ? 'Aktif' : 'Nonaktif'}
        </Badge>
      );
    if (column.kind === 'date') return value ? formatDate(String(value)) : '—';
    if (column.kind === 'avatar')
      return (
        <Avatar src={value ? String(value) : undefined} size={38} radius="xl" color="gray">
          <IconUser size={19} />
        </Avatar>
      );
    if (column.kind === 'file')
      return value ? (
        <Anchor href={String(value)} target="_blank" size="xs">
          <Group gap={5} wrap="nowrap">
            <IconFile size={15} /> Buka
          </Group>
        </Anchor>
      ) : (
        '—'
      );
    if (column.kind === 'code')
      return (
        <Badge variant="light" color="grape">
          {String(value)}
        </Badge>
      );
    return (
      <Text fw={column.key === 'name' ? 600 : 400} size="xs">
        {value === '' || value == null ? '—' : String(value)}
      </Text>
    );
  }
  return (
    <>
      <ModuleListLayout
        eyebrow={config.eyebrow || 'AKADEMIK'}
        title={config.title}
        description={config.description}
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel={`Tambah ${config.singular.toLowerCase()}`}
        onAdd={writable ? () => openEditor(null) : undefined}
        note={config.note}
        toolbarLeading={
          config.academicYearFilter ? (
            <>
              <Select
                aria-label="Filter tahun ajaran"
                placeholder="Pilih tahun ajaran"
                data={list.options?.academic_year_id || []}
                value={selectedAcademicYearId || null}
                onChange={(value) => {
                  setAcademicYearId(value || '');
                  setFilters({});
                  list.setPage(1);
                }}
                allowDeselect={false}
                searchable
                w={210}
              />
              {config.filters?.map((filter) => (
                <Select
                  key={filter.key}
                  aria-label={`Filter ${filter.label.toLowerCase()}`}
                  placeholder={filter.label}
                  data={list.options?.[filter.optionsKey || filter.key] || []}
                  value={filters[filter.key] || null}
                  onChange={(value) => {
                    setFilters((current) => ({
                      ...current,
                      [filter.key]: value || '',
                    }));
                    list.setPage(1);
                  }}
                  clearable
                  searchable
                  w={190}
                />
              ))}
            </>
          ) : undefined
        }
      >
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {config.columns.map((column) => (
                  <Table.Th key={column.key}>{column.label}</Table.Th>
                ))}
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((row) => (
                <Table.Tr key={row.id}>
                  {config.columns.map((column) => (
                    <Table.Td key={column.key}>{renderCell(row, column)}</Table.Td>
                  ))}
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      {config.viewStudents && (
                        <ActionIcon
                          aria-label={`Lihat murid ${row.name}`}
                          variant="subtle"
                          color="blue"
                          onClick={() => openStudents(row)}
                        >
                          <IconEye size={17} />
                        </ActionIcon>
                      )}
                      {writable &&
                      !(config.groupedRowsReadOnly && Number(row.class_count || 0) > 1) ? (
                        <>
                          <ActionIcon
                            aria-label={`Edit ${row.name}`}
                            variant="subtle"
                            color="gray"
                            onClick={() => openEditor(row)}
                          >
                            <IconPencil size={17} />
                          </ActionIcon>
                          <ActionIcon
                            aria-label={`Hapus ${row.name}`}
                            variant="subtle"
                            color="red"
                            onClick={() => setRemoving(row)}
                          >
                            <IconTrash size={17} />
                          </ActionIcon>
                        </>
                      ) : (
                        <Text component="span" c="dimmed" size="xs" lh={1.25} ta="right">
                          {config.groupedRowsReadOnly && Number(row.class_count || 0) > 1
                            ? 'Pilih rombel di filter untuk mengelola'
                            : '—'}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </ModuleListLayout>
      <Modal
        opened={editing !== undefined}
        onClose={() => !saving && setEditing(undefined)}
        centered
        size="lg"
        title={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" size={38} radius="md">
              <IconSchool size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700}>
                {editing ? 'Edit' : 'Tambah'} {config.singular.toLowerCase()}
              </Text>
              <Text c="dimmed" size="xs" fw={400}>
                Lengkapi informasi di bawah ini.
              </Text>
            </Box>
          </Group>
        }
      >
        <form onSubmit={save}>
          <Stack gap="md">
            {config.fields.map((field) => {
              const common = {
                label: field.label,
                description: field.description,
                inputWrapperOrder,
                placeholder: field.placeholder || `Masukkan ${field.label.toLowerCase()}`,
                required: field.required,
                value: form[field.key] as never,
              };
              if (field.kind === 'image')
                return (
                  <ImageUploader
                    key={field.key}
                    label={field.label}
                    description={field.description}
                    scope={field.uploadScope!}
                    value={String(form[field.key] || '')}
                    onChange={(value) => setForm({ ...form, [field.key]: value })}
                    disabled={saving}
                  />
                );
              if (field.kind === 'file')
                return (
                  <FileUploader
                    key={field.key}
                    label={field.label}
                    description={field.description}
                    scope={field.uploadScope!}
                    value={String(form[field.key] || '')}
                    onChange={(value) => setForm({ ...form, [field.key]: value })}
                    disabled={saving}
                  />
                );
              if (field.kind === 'switch')
                return (
                  <Switch
                    key={field.key}
                    label={field.label}
                    description={field.description}
                    checked={Boolean(form[field.key])}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.currentTarget.checked })
                    }
                  />
                );
              if (field.kind === 'textarea')
                return (
                  <Textarea
                    key={field.key}
                    {...common}
                    maxLength={500}
                    minRows={3}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.currentTarget.value })
                    }
                  />
                );
              if (field.kind === 'number')
                return (
                  <NumberInput
                    key={field.key}
                    {...common}
                    min={field.min}
                    max={field.max}
                    allowDecimal={false}
                    onChange={(value) => setForm({ ...form, [field.key]: value })}
                  />
                );
              if (field.kind === 'select')
                if (field.multipleKey && !editing)
                  return (
                    <MultiSelect
                      key={field.key}
                      label={field.label}
                      description={field.description}
                      inputWrapperOrder={inputWrapperOrder}
                      placeholder={field.placeholder || `Pilih ${field.label.toLowerCase()}`}
                      required={field.required}
                      data={field.options || list.options?.[field.optionsKey || field.key] || []}
                      searchable
                      nothingFoundMessage="Data belum tersedia"
                      disabled={saving}
                      value={(form[field.multipleKey] as string[]) || []}
                      onChange={(value) => setForm({ ...form, [field.multipleKey!]: value })}
                    />
                  );
                else
                  return (
                    <Select
                      key={field.key}
                      {...common}
                      placeholder={field.placeholder || `Pilih ${field.label.toLowerCase()}`}
                      data={field.options || list.options?.[field.optionsKey || field.key] || []}
                      searchable
                      allowDeselect={!field.required}
                      nothingFoundMessage="Data belum tersedia"
                      disabled={saving}
                      onChange={(value) => setForm({ ...form, [field.key]: value || '' })}
                    />
                  );
              if (field.kind === 'date')
                return (
                  <DateInput
                    key={field.key}
                    {...common}
                    placeholder={field.placeholder || 'Pilih tanggal'}
                    locale="id"
                    valueFormat="D MMMM YYYY"
                    popoverProps={{ withinPortal: true }}
                    onChange={(value) => setForm({ ...form, [field.key]: value || '' })}
                  />
                );
              if (field.kind === 'date-range')
                return (
                  <SimpleGrid key={field.key} cols={{ base: 1, sm: 2 }} spacing="md">
                    <DateInput
                      {...common}
                      placeholder={field.placeholder || 'Pilih tanggal mulai'}
                      locale="id"
                      valueFormat="D MMMM YYYY"
                      popoverProps={{ withinPortal: true }}
                      onChange={(value) => setForm({ ...form, [field.key]: value || '' })}
                    />
                    <DateInput
                      label={field.secondaryLabel || 'Tanggal selesai'}
                      placeholder={field.secondaryPlaceholder || 'Pilih tanggal selesai'}
                      locale="id"
                      valueFormat="D MMMM YYYY"
                      popoverProps={{ withinPortal: true }}
                      value={form[field.secondaryKey!] as never}
                      onChange={(value) => setForm({ ...form, [field.secondaryKey!]: value || '' })}
                    />
                  </SimpleGrid>
                );
              return (
                <TextInput
                  key={field.key}
                  {...common}
                  maxLength={field.maxLength || 100}
                  onChange={(event) => setForm({ ...form, [field.key]: event.currentTarget.value })}
                />
              );
            })}
            {config.hasStatus !== false && (
              <Box className={classes.statusCard}>
                <Switch
                  label="Status aktif"
                  description="Data nonaktif tetap tersimpan tetapi tidak digunakan sebagai pilihan aktif."
                  checked={Boolean(form.is_active)}
                  onChange={(event) => setForm({ ...form, is_active: event.currentTarget.checked })}
                />
              </Box>
            )}
          </Stack>
          <Group className={classes.actions} justify="flex-end" mt="xl">
            <Button variant="default" disabled={saving} onClick={() => setEditing(undefined)}>
              Batal
            </Button>
            <Button type="submit" loading={saving} leftSection={<IconCheck size={17} />}>
              Simpan
            </Button>
          </Group>
        </form>
      </Modal>
      <Modal
        opened={!!viewingStudents}
        onClose={() => !loadingStudents && setViewingStudents(null)}
        centered
        size="md"
        title={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="blue" size={38} radius="md">
              <IconUsers size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700}>Murid di rombel {viewingStudents?.name}</Text>
              <Text c="dimmed" size="xs">
                {students.length} murid dengan penempatan aktif
              </Text>
            </Box>
          </Group>
        }
      >
        {loadingStudents ? (
          <Text c="dimmed" size="sm">
            Memuat daftar murid...
          </Text>
        ) : students.length ? (
          <Table.ScrollContainer minWidth={400}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>MURID</Table.Th>
                  <Table.Th>NIS</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {students.map((student) => (
                  <Table.Tr key={student.id}>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {student.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{student.nis}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text c="dimmed" size="sm">
            Belum ada murid yang memiliki penempatan aktif di rombel ini.
          </Text>
        )}
      </Modal>
      <Modal
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title={`Hapus ${config.singular.toLowerCase()}?`}
        centered
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>
          . Data yang sudah memiliki relasi tidak dapat dihapus.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" disabled={saving} onClick={() => setRemoving(null)}>
            Batal
          </Button>
          <Button color="red" loading={saving} onClick={remove}>
            Hapus
          </Button>
        </Group>
      </Modal>
    </>
  );
}
