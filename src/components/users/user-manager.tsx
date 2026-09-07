'use client';

import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Select,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  role_id: string;
  active: number;
};

type UserForm = {
  name: string;
  email: string;
  password: string;
  role_id: string;
  active: boolean;
};

const emptyForm: UserForm = { name: '', email: '', password: '', role_id: '', active: true };
const endpoint = '/api/modules/users';

export function UserManager({
  currentUserId,
  writable,
}: {
  currentUserId: string;
  writable: boolean;
}) {
  const list = useModuleList<UserRow>(endpoint);
  const [editing, setEditing] = useState<UserRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(user: UserRow | null) {
    setForm(
      user
        ? {
            name: user.name,
            email: user.email,
            password: '',
            role_id: user.role_id,
            active: Boolean(user.active),
          }
        : emptyForm,
    );
    setEditing(user);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', {
        ...form,
        password: form.password || undefined,
        id: editing?.id,
      });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Pengguna berhasil disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan pengguna',
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
      notifications.show({ color: 'green', title: 'Berhasil', message: 'Pengguna telah dihapus.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus pengguna',
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
        title="Pengguna"
        description="Kelola anggota dan akses ke workspace."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah pengguna"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Setiap perubahan data akan tercatat di audit trail."
      >
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>ROLE</Table.Th>
                <Table.Th>STATUS</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar color="brand" radius="xl">
                        {user.name.slice(0, 2).toUpperCase()}
                      </Avatar>
                      <div>
                        <Text fw={600} size="xs">
                          {user.name}
                        </Text>
                        <Text variant="caption" mt={5}>
                          {user.email}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue">
                      {user.role}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={user.active ? 'brand' : 'gray'}>
                      {user.active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      {writable && user.id !== currentUserId ? (
                        <>
                          <ActionIcon
                            aria-label={`Edit ${user.name}`}
                            variant="subtle"
                            color="gray"
                            onClick={() => openEditor(user)}
                          >
                            <IconPencil size={17} />
                          </ActionIcon>
                          <ActionIcon
                            aria-label={`Hapus ${user.name}`}
                            variant="subtle"
                            color="red"
                            onClick={() => setRemoving(user)}
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
        title={`${editing ? 'Edit' : 'Tambah'} pengguna`}
        centered
      >
        <form onSubmit={save}>
          <TextInput
            label="Nama"
            placeholder="Masukkan nama lengkap"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
            required
            minLength={2}
            maxLength={100}
            mb="md"
          />
          <TextInput
            label="Email"
            placeholder="nama@sekolah.sch.id"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
            required
            mb="md"
          />
          <Select
            label="Role"
            placeholder="Pilih role"
            data={(list.roles || []).map((role) => ({ value: role.id, label: role.name }))}
            value={form.role_id}
            onChange={(value) => setForm({ ...form, role_id: value || '' })}
            required
            mb="md"
          />
          <PasswordInput
            label={editing ? 'Kata sandi baru (opsional)' : 'Kata sandi'}
            placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Masukkan kata sandi'}
            description="Minimal 12 karakter."
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.currentTarget.value })}
            required={!editing}
            minLength={12}
            maxLength={128}
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

      <ConfirmationDialog
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus pengguna?"
        loading={saving}
        onConfirm={remove}
        confirmLabel="Hapus pengguna"
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>
          . Data yang masih digunakan tidak dapat dihapus.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
