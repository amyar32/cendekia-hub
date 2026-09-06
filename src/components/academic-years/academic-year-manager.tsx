'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type AcademicYear = {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
};

type AcademicYearForm = {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const emptyForm: AcademicYearForm = {
  name: '',
  start_date: '',
  end_date: '',
  is_active: false,
};
const endpoint = '/api/modules/academic-years';
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

export function AcademicYearManager({ writable }: { writable: boolean }) {
  const list = useModuleList<AcademicYear>(endpoint);
  const [editing, setEditing] = useState<AcademicYear | null | undefined>(undefined);
  const [removing, setRemoving] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState<AcademicYearForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(year: AcademicYear | null) {
    setForm(
      year
        ? {
            name: year.name,
            start_date: year.start_date,
            end_date: year.end_date,
            is_active: Boolean(year.is_active),
          }
        : emptyForm,
    );
    setEditing(year);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', {
        ...form,
        id: editing?.id,
      });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Tahun ajaran berhasil disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan tahun ajaran',
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
      if (list.rows.length === 1 && list.page > 1) list.setPage(list.page - 1);
      else list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Tahun ajaran telah dihapus.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus tahun ajaran',
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
        title="Tahun Ajaran"
        description="Kelola periode tahun ajaran dan tentukan periode yang sedang aktif."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah tahun ajaran"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Hanya satu tahun ajaran yang dapat aktif pada satu waktu."
      >
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>TANGGAL MULAI</Table.Th>
                <Table.Th>TANGGAL SELESAI</Table.Th>
                <Table.Th>STATUS</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((year) => (
                <Table.Tr key={year.id}>
                  <Table.Td>
                    <Text fw={600} size="xs">
                      {year.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>{formatDate(year.start_date)}</Table.Td>
                  <Table.Td>{formatDate(year.end_date)}</Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={year.is_active ? 'brand' : 'gray'}>
                      {year.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      {writable ? (
                        <>
                          <ActionIcon
                            aria-label={`Edit ${year.name}`}
                            variant="subtle"
                            color="gray"
                            onClick={() => openEditor(year)}
                          >
                            <IconPencil size={17} />
                          </ActionIcon>
                          <ActionIcon
                            aria-label={`Hapus ${year.name}`}
                            variant="subtle"
                            color="red"
                            onClick={() => setRemoving(year)}
                          >
                            <IconTrash size={17} />
                          </ActionIcon>
                        </>
                      ) : (
                        <Text component="span" c="dimmed">
                          —
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
        title={`${editing ? 'Edit' : 'Tambah'} tahun ajaran`}
        centered
      >
        <form onSubmit={save}>
          <TextInput
            label="Nama tahun ajaran"
            placeholder="Contoh: 2026/2027"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
            required
            minLength={4}
            maxLength={50}
            mb="md"
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
            <TextInput
              type="date"
              label="Tanggal mulai"
              value={form.start_date}
              max={form.end_date || undefined}
              onChange={(event) => setForm({ ...form, start_date: event.currentTarget.value })}
              required
            />
            <TextInput
              type="date"
              label="Tanggal selesai"
              value={form.end_date}
              min={form.start_date || undefined}
              onChange={(event) => setForm({ ...form, end_date: event.currentTarget.value })}
              required
            />
          </SimpleGrid>
          <Switch
            label="Jadikan tahun ajaran aktif"
            description="Tahun ajaran lain yang aktif akan dinonaktifkan otomatis."
            checked={form.is_active}
            onChange={(event) => setForm({ ...form, is_active: event.currentTarget.checked })}
            mb="md"
          />
          <Group justify="flex-end" mt="xl">
            <Button variant="default" disabled={saving} onClick={() => setEditing(undefined)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan
            </Button>
          </Group>
        </form>
      </Modal>

      <Modal
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus tahun ajaran?"
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
            Hapus tahun ajaran
          </Button>
        </Group>
      </Modal>
    </>
  );
}
