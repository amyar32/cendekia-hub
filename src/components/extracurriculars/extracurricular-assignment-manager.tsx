'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Anchor,
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
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconPencil, IconTrash, IconUsersGroup } from '@tabler/icons-react';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type Assignment = {
  id: string;
  name: string;
  extracurricular_id: string;
  extracurricular_name: string;
  extracurricular_code: string;
  teacher_id: string;
  teacher_name: string;
  academic_year_id: string;
  semester_id: string | null;
  semester_name: string;
  location: string;
  map_url: string;
  quota: number;
  status: 'draft' | 'active' | 'completed';
  status_label: string;
  participant_count: number;
  schedule_count: number;
  student_ids: string[];
};

type AssignmentForm = {
  extracurricular_id: string;
  teacher_id: string;
  semester_id: string;
  location: string;
  map_url: string;
  quota: number | string;
  status: 'draft' | 'active' | 'completed';
  student_ids: string[];
};

const emptyForm = (): AssignmentForm => ({
  extracurricular_id: '',
  teacher_id: '',
  semester_id: 'all',
  location: '',
  map_url: '',
  quota: 0,
  status: 'draft',
  student_ids: [],
});

const statusColors = { draft: 'gray', active: 'green', completed: 'blue' } as const;
const endpoint = '/api/modules/extracurricular-assignments';
const inputWrapperOrder: Array<'label' | 'input' | 'description' | 'error'> = [
  'label',
  'input',
  'description',
  'error',
];

export function ExtracurricularAssignmentManager({ writable }: { writable: boolean }) {
  const [academicYearId, setAcademicYearId] = useState('');
  const list = useModuleList<Assignment>(
    endpoint,
    academicYearId ? { academic_year_id: academicYearId } : {},
  );
  const selectedYearId = academicYearId || list.selected?.academic_year_id || '';
  const [editing, setEditing] = useState<Assignment | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const [form, setForm] = useState<AssignmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(row: Assignment | null) {
    setForm(
      row
        ? {
            extracurricular_id: row.extracurricular_id,
            teacher_id: row.teacher_id,
            semester_id: row.semester_id || 'all',
            location: row.location,
            map_url: row.map_url,
            quota: row.quota,
            status: row.status,
            student_ids: row.student_ids,
          }
        : emptyForm(),
    );
    setEditing(row);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', {
        ...form,
        academic_year_id: selectedYearId,
        id: editing?.id,
      });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Penugasan ekstrakurikuler berhasil disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan penugasan',
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
      await moduleMutation(endpoint, 'DELETE', { id: removing.id });
      setRemoving(null);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Penugasan telah dihapus.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus penugasan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModuleListLayout
        eyebrow="AKADEMIK"
        title="Penugasan Ekstrakurikuler"
        description="Kelola pembina, peserta, lokasi, kuota, dan periode kegiatan."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah penugasan"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Atur jadwal dari menu Jadwal Pelajaran pada tab Ekstrakurikuler."
        toolbarLeading={
          <Select
            aria-label="Filter tahun ajaran"
            data={list.options?.academic_year_id || []}
            value={selectedYearId || null}
            onChange={(value) => {
              setAcademicYearId(value || '');
              list.setPage(1);
            }}
            allowDeselect={false}
            searchable
            w={220}
          />
        }
      >
        <Table.ScrollContainer minWidth={940}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>EKSTRAKURIKULER</Table.Th>
                <Table.Th>PEMBINA</Table.Th>
                <Table.Th>PERIODE</Table.Th>
                <Table.Th>LOKASI</Table.Th>
                <Table.Th>JADWAL</Table.Th>
                <Table.Th>PESERTA</Table.Th>
                <Table.Th>STATUS</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Text fw={600} size="xs">
                      {row.extracurricular_name}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {row.extracurricular_code}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.teacher_name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.semester_name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.location || '—'}</Text>
                    {row.map_url && (
                      <Anchor href={row.map_url} target="_blank" size="xs">
                        Buka Maps
                      </Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.schedule_count} slot</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {row.participant_count}
                      {row.quota ? ` / ${row.quota}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={statusColors[row.status]}>
                      {row.status_label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      {writable ? (
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
                        <Text c="dimmed">—</Text>
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
        size="xl"
        title={
          <Group gap="sm">
            <ThemeIcon variant="light" size={38} radius="md">
              <IconUsersGroup size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700}>{editing ? 'Edit' : 'Tambah'} penugasan ekstrakurikuler</Text>
              <Text c="dimmed" size="xs">
                Atur pembina, periode, peserta, dan informasi lokasi kegiatan.
              </Text>
            </Box>
          </Group>
        }
      >
        <form onSubmit={save}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label="Ekstrakurikuler"
                required
                searchable
                data={list.options?.extracurricular_id || []}
                value={form.extracurricular_id || null}
                onChange={(value) => setForm({ ...form, extracurricular_id: value || '' })}
              />
              <Select
                label="Pembina"
                required
                searchable
                data={list.options?.teacher_id || []}
                value={form.teacher_id || null}
                onChange={(value) => setForm({ ...form, teacher_id: value || '' })}
              />
              <Select
                label="Periode"
                required
                data={list.options?.semester_id || []}
                value={form.semester_id}
                allowDeselect={false}
                onChange={(value) => {
                  setForm({ ...form, semester_id: value || 'all' });
                }}
              />
              <Select
                label="Status"
                required
                allowDeselect={false}
                data={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'active', label: 'Aktif' },
                  { value: 'completed', label: 'Selesai' },
                ]}
                value={form.status}
                onChange={(value) =>
                  setForm({ ...form, status: (value || 'draft') as AssignmentForm['status'] })
                }
              />
              <TextInput
                label="Lokasi"
                placeholder="Contoh: Lapangan sekolah"
                value={form.location}
                maxLength={100}
                onChange={(event) => setForm({ ...form, location: event.currentTarget.value })}
              />
              <TextInput
                label="Link Google Maps"
                description="Opsional, gunakan tautan lokasi dari Google Maps."
                inputWrapperOrder={inputWrapperOrder}
                placeholder="https://maps.google.com/..."
                value={form.map_url}
                maxLength={1000}
                onChange={(event) => setForm({ ...form, map_url: event.currentTarget.value })}
              />
              <NumberInput
                label="Kuota peserta"
                description="Isi 0 jika tidak dibatasi"
                inputWrapperOrder={inputWrapperOrder}
                min={0}
                max={1000}
                allowDecimal={false}
                value={form.quota}
                onChange={(value) => setForm({ ...form, quota: value })}
              />
            </SimpleGrid>

            <MultiSelect
              label="Peserta"
              description="Hanya murid aktif yang sudah memiliki rombel pada tahun ajaran ini."
              inputWrapperOrder={inputWrapperOrder}
              searchable
              clearable
              hidePickedOptions
              data={list.options?.student_ids || []}
              value={form.student_ids}
              onChange={(student_ids) => setForm({ ...form, student_ids })}
              nothingFoundMessage="Murid tidak ditemukan"
            />
          </Stack>
          <Group justify="flex-end" mt="xl">
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
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus penugasan?"
        centered
      >
        <Text>
          Jadwal dan daftar peserta pada penugasan{' '}
          <Text component="span" inherit fw={700}>
            {removing?.extracurricular_name}
          </Text>{' '}
          juga akan dihapus.
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
