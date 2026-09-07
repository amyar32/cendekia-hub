'use client';

import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEye, IconLock, IconPencil, IconTrash } from '@tabler/icons-react';
import { permissions } from '@/config/modules';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type RoleRow = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  system: number;
};

type RoleForm = { name: string; description: string; permissions: string[] };
const emptyForm: RoleForm = { name: '', description: '', permissions: [] };
const endpoint = '/api/modules/roles';

export function RoleManager({
  currentRoleId,
  userPermissions,
  writable,
}: {
  currentRoleId: string;
  userPermissions: string[];
  writable: boolean;
}) {
  const list = useModuleList<RoleRow>(endpoint);
  const [editing, setEditing] = useState<RoleRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<RoleRow | null>(null);
  const [detail, setDetail] = useState<RoleRow | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(role: RoleRow | null) {
    setForm(
      role
        ? { name: role.name, description: role.description || '', permissions: role.permissions }
        : emptyForm,
    );
    setEditing(role);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', { ...form, id: editing?.id });
      setEditing(undefined);
      list.reload();
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Role berhasil disimpan.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan role',
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
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Role telah dihapus.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus role',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModuleListLayout
        eyebrow="ADMINISTRASI"
        title="Role & permission"
        description="Tentukan apa yang dapat diakses oleh setiap role."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah role"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Setiap perubahan data akan tercatat di audit trail."
      >
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>DESKRIPSI</Table.Th>
                <Table.Th>PERMISSION</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((role) => {
                const locked = Boolean(role.system) || role.id === currentRoleId;
                return (
                  <Table.Tr key={role.id}>
                    <Table.Td>
                      <Group gap="sm">
                        <Text fw={600} size="xs">
                          {role.name}
                        </Text>
                        {role.system === 1 && (
                          <IconLock size={15} color="var(--app-color-muted-soft)" />
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td c="dimmed">{role.description || '—'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="grape">
                        {role.permissions.length} permission
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} justify="flex-end">
                        <ActionIcon
                          aria-label="Lihat detail"
                          variant="subtle"
                          color="gray"
                          onClick={() => setDetail(role)}
                        >
                          <IconEye size={17} />
                        </ActionIcon>
                        {writable && !locked && (
                          <>
                            <ActionIcon
                              aria-label={`Edit ${role.name}`}
                              variant="subtle"
                              color="gray"
                              onClick={() => openEditor(role)}
                            >
                              <IconPencil size={17} />
                            </ActionIcon>
                            <ActionIcon
                              aria-label={`Hapus ${role.name}`}
                              variant="subtle"
                              color="red"
                              onClick={() => setRemoving(role)}
                            >
                              <IconTrash size={17} />
                            </ActionIcon>
                          </>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </ModuleListLayout>

      <Modal
        opened={editing !== undefined}
        onClose={() => !saving && setEditing(undefined)}
        title={`${editing ? 'Edit' : 'Tambah'} role & permission`}
        centered
      >
        <form onSubmit={save}>
          <TextInput
            label="Nama"
            placeholder="Contoh: Operator akademik"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
            required
            minLength={2}
            maxLength={100}
            mb="md"
          />
          <Textarea
            label="Deskripsi"
            placeholder="Jelaskan tanggung jawab role ini"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.currentTarget.value })}
            maxLength={500}
            mb="md"
          />
          <MultiSelect
            label="Permission"
            placeholder="Pilih permission"
            description="Pilih akses baca dan tulis yang diperlukan."
            data={permissions.filter((permission) => userPermissions.includes(permission))}
            value={form.permissions}
            onChange={(value) => setForm({ ...form, permissions: value })}
            searchable
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

      <ConfirmationDialog
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus role?"
        loading={saving}
        onConfirm={remove}
        confirmLabel="Hapus role"
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>
          . Data yang masih digunakan tidak dapat dihapus.
        </Text>
      </ConfirmationDialog>

      <Modal
        opened={!!detail}
        onClose={() => setDetail(null)}
        title="Permission role"
        centered
        size="lg"
      >
        <Group gap="xs">
          {detail?.permissions.map((permission) => (
            <Badge key={permission} variant="light">
              {permission}
            </Badge>
          ))}
        </Group>
      </Modal>
    </>
  );
}
