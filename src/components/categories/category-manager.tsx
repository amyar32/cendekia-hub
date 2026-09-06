'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type Category = {
  id: string;
  name: string;
  description: string;
  active: number;
};

type CategoryForm = { name: string; description: string; active: boolean };
const emptyForm: CategoryForm = { name: '', description: '', active: true };
const endpoint = '/api/modules/categories';

export function CategoryManager({ writable }: { writable: boolean }) {
  const list = useModuleList<Category>(endpoint);
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(category: Category | null) {
    setForm(
      category
        ? {
            name: category.name,
            description: category.description || '',
            active: Boolean(category.active),
          }
        : emptyForm,
    );
    setEditing(category);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', { ...form, id: editing?.id });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Kategori berhasil disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan kategori',
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
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Kategori telah dihapus.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus kategori',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModuleListLayout
        eyebrow="MASTER DATA"
        title="Kategori"
        description="Kelola kategori untuk mengorganisir data Anda."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah kategori"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Setiap perubahan data akan tercatat di audit trail."
      >
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>DESKRIPSI</Table.Th>
                <Table.Th>STATUS</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((category) => (
                <Table.Tr key={category.id}>
                  <Table.Td>
                    <Text fw={600} size="xs">
                      {category.name}
                    </Text>
                  </Table.Td>
                  <Table.Td c="dimmed">{category.description || '—'}</Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={category.active ? 'brand' : 'gray'}>
                      {category.active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      {writable ? (
                        <>
                          <ActionIcon
                            aria-label={`Edit ${category.name}`}
                            variant="subtle"
                            color="gray"
                            onClick={() => openEditor(category)}
                          >
                            <IconPencil size={17} />
                          </ActionIcon>
                          <ActionIcon
                            aria-label={`Hapus ${category.name}`}
                            variant="subtle"
                            color="red"
                            onClick={() => setRemoving(category)}
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
        title={`${editing ? 'Edit' : 'Tambah'} kategori`}
        centered
      >
        <form onSubmit={save}>
          <TextInput
            label="Nama"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
            required
            minLength={2}
            maxLength={100}
            mb="md"
          />
          <Textarea
            label="Deskripsi"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.currentTarget.value })}
            maxLength={500}
            mb="md"
          />
          <Checkbox
            label="Aktif"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.currentTarget.checked })}
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
        title="Hapus kategori?"
        centered
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>
          . Data yang masih digunakan tidak dapat dihapus.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" disabled={saving} onClick={() => setRemoving(null)}>
            Batal
          </Button>
          <Button color="red" loading={saving} onClick={remove}>
            Hapus kategori
          </Button>
        </Group>
      </Modal>
    </>
  );
}
