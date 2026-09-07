'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
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
  IconPlus,
  IconTrash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import 'dayjs/locale/id';
import { FileUploader } from '@/components/cms/file-uploader/file-uploader';
import { ImageUploader } from '@/components/cms/image-uploader/image-uploader';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';
import classes from '@/components/academic/academic-entity-manager.module.css';

type Guardian = {
  name: string;
  relation: string;
  phone: string;
  email: string;
  address: string;
  is_primary: boolean;
};
type StudentDocument = { type: string; file_url: string; description: string };
type ClassHistory = {
  id: string;
  class_name: string;
  academic_year_name: string;
  start_date: string;
  end_date?: string;
  status_label: string;
};
type StudentForm = {
  photo_url: string;
  nis: string;
  nisn: string;
  name: string;
  gender: string;
  birth_date: string;
  birth_place: string;
  address: string;
  phone: string;
  email: string;
  enrollment_date: string;
  is_active: boolean;
  guardians: Guardian[];
  documents: StudentDocument[];
  placement: { class_id: string; start_date: string };
};
type StudentRow = StudentForm & {
  id: string;
  gender_label: string;
  guardian_name: string;
  document_count: number;
  current_class_name: string;
  history: ClassHistory[];
};

const emptyGuardian = (): Guardian => ({
  name: '',
  relation: '',
  phone: '',
  email: '',
  address: '',
  is_primary: false,
});
const emptyDocument = (): StudentDocument => ({ type: '', file_url: '', description: '' });
const emptyForm = (): StudentForm => ({
  photo_url: '',
  nis: '',
  nisn: '',
  name: '',
  gender: '',
  birth_date: '',
  birth_place: '',
  address: '',
  phone: '',
  email: '',
  enrollment_date: '',
  is_active: true,
  guardians: [],
  documents: [],
  placement: { class_id: '', start_date: '' },
});
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
function formatDate(value?: string) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : '—';
}

export function StudentManager({ writable }: { writable: boolean }) {
  const list = useModuleList<StudentRow>('/api/modules/students');
  const [editing, setEditing] = useState<StudentRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<StudentRow | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openEditor(row: StudentRow | null) {
    setForm(
      row
        ? {
            photo_url: row.photo_url || '',
            nis: row.nis,
            nisn: row.nisn || '',
            name: row.name,
            gender: row.gender,
            birth_date: row.birth_date || '',
            birth_place: row.birth_place || '',
            address: row.address || '',
            phone: row.phone || '',
            email: row.email || '',
            enrollment_date: row.enrollment_date || '',
            is_active: Boolean(row.is_active),
            guardians: row.guardians.map((guardian) => ({
              ...guardian,
              is_primary: Boolean(guardian.is_primary),
            })),
            documents: row.documents.map((document) => ({ ...document })),
            placement: { ...row.placement },
          }
        : emptyForm(),
    );
    setEditing(row);
  }
  function updateGuardian(index: number, changes: Partial<Guardian>) {
    setForm((current) => ({
      ...current,
      guardians: current.guardians.map((guardian, guardianIndex) => {
        if (changes.is_primary && guardianIndex !== index)
          return { ...guardian, is_primary: false };
        return guardianIndex === index ? { ...guardian, ...changes } : guardian;
      }),
    }));
  }
  function updateDocument(index: number, changes: Partial<StudentDocument>) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document, documentIndex) =>
        documentIndex === index ? { ...document, ...changes } : document,
      ),
    }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation('/api/modules/students', editing ? 'PATCH' : 'POST', {
        ...form,
        id: editing?.id,
      });
      setEditing(undefined);
      list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Data murid berhasil disimpan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan murid',
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
      await moduleMutation('/api/modules/students', 'DELETE', { id: removing.id });
      setRemoving(null);
      if (list.rows.length === 1 && list.page > 1) list.setPage(list.page - 1);
      else list.reload();
      notifications.show({
        color: 'green',
        title: 'Berhasil',
        message: 'Data murid telah dihapus.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menghapus murid',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || !writable;
  const placementLocked = Boolean(
    editing &&
    form.placement.class_id &&
    !list.options?.class_id?.some((option) => option.value === form.placement.class_id),
  );
  return (
    <>
      <ModuleListLayout
        eyebrow="MURID"
        title="Data Murid"
        description="Kelola identitas, wali, dokumen, penempatan, dan riwayat kelas murid dalam satu tempat."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        addLabel="Tambah murid"
        onAdd={writable ? () => openEditor(null) : undefined}
        note="Riwayat kelas dibuat otomatis setiap kali penempatan murid berubah."
      >
        <Table.ScrollContainer minWidth={980}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>FOTO</Table.Th>
                <Table.Th>NIS</Table.Th>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>WALI UTAMA</Table.Th>
                <Table.Th>ROMBEL AKTIF</Table.Th>
                <Table.Th>DOKUMEN</Table.Th>
                <Table.Th>STATUS</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Avatar src={row.photo_url} alt={`Foto ${row.name}`} size={36} radius="xl">
                      {row.name
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')}
                    </Avatar>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="grape">
                      {row.nis}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" fw={600}>
                      {row.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.guardian_name || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.current_class_name || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="gray">
                      {row.document_count}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={row.is_active ? 'green' : 'gray'}>
                      {row.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      <ActionIcon
                        aria-label={`Lihat ${row.name}`}
                        variant="subtle"
                        color="gray"
                        onClick={() => openEditor(row)}
                      >
                        {writable ? <IconPencil size={17} /> : <IconEye size={17} />}
                      </ActionIcon>
                      {writable && (
                        <ActionIcon
                          aria-label={`Hapus ${row.name}`}
                          variant="subtle"
                          color="red"
                          onClick={() => setRemoving(row)}
                        >
                          <IconTrash size={17} />
                        </ActionIcon>
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
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" size={38} radius="md">
              <IconUser size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700}>
                {editing ? (writable ? 'Edit murid' : 'Detail murid') : 'Tambah murid'}
              </Text>
              <Text c="dimmed" size="xs" fw={400}>
                Seluruh data murid dikelola dalam satu formulir.
              </Text>
            </Box>
          </Group>
        }
      >
        <form onSubmit={save}>
          <Stack gap="lg">
            <Divider label="Identitas murid" labelPosition="left" />
            <ImageUploader
              label="Foto murid"
              description="PNG, JPEG, atau WebP. Ukuran maksimal 5 MB."
              scope="student.photo"
              value={form.photo_url}
              disabled={disabled}
              onChange={(value) => setForm({ ...form, photo_url: value })}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="NIS"
                placeholder="Contoh: S-001"
                required
                value={form.nis}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, nis: event.currentTarget.value })}
              />
              <TextInput
                label="NISN"
                placeholder="Masukkan NISN (opsional)"
                value={form.nisn}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, nisn: event.currentTarget.value })}
              />
              <TextInput
                label="Nama lengkap"
                placeholder="Masukkan nama lengkap murid"
                required
                value={form.name}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
              />
              <Select
                label="Jenis kelamin"
                placeholder="Pilih jenis kelamin"
                required
                value={form.gender}
                disabled={disabled}
                data={[
                  { value: 'male', label: 'Laki-laki' },
                  { value: 'female', label: 'Perempuan' },
                ]}
                onChange={(value) => setForm({ ...form, gender: value || '' })}
              />
              <TextInput
                label="Tempat lahir"
                placeholder="Contoh: Makassar"
                value={form.birth_place}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, birth_place: event.currentTarget.value })}
              />
              <DateInput
                label="Tanggal lahir"
                placeholder="Pilih tanggal lahir"
                locale="id"
                valueFormat="D MMMM YYYY"
                value={form.birth_date}
                disabled={disabled}
                onChange={(value) => setForm({ ...form, birth_date: value || '' })}
              />
              <TextInput
                label="Nomor telepon"
                placeholder="Contoh: 081234567890"
                value={form.phone}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, phone: event.currentTarget.value })}
              />
              <TextInput
                label="Email"
                placeholder="murid@example.com"
                value={form.email}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
              />
              <DateInput
                label="Tanggal masuk"
                placeholder="Pilih tanggal masuk"
                locale="id"
                valueFormat="D MMMM YYYY"
                value={form.enrollment_date}
                disabled={disabled}
                onChange={(value) => setForm({ ...form, enrollment_date: value || '' })}
              />
            </SimpleGrid>
            <Textarea
              label="Alamat"
              placeholder="Masukkan alamat tempat tinggal murid"
              minRows={2}
              value={form.address}
              disabled={disabled}
              onChange={(event) => setForm({ ...form, address: event.currentTarget.value })}
            />

            <Divider label="Penempatan kelas" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Select
                label="Rombel aktif"
                placeholder="Pilih rombel aktif"
                description={
                  placementLocked
                    ? 'Penempatan historis dikunci. Gunakan Proses Kenaikan Kelas untuk tahun ajaran baru.'
                    : 'Pilihan hanya menampilkan rombel pada tahun ajaran aktif.'
                }
                searchable
                clearable
                data={list.options?.class_id || []}
                value={form.placement.class_id}
                disabled={disabled || placementLocked}
                onChange={(value) =>
                  setForm({ ...form, placement: { ...form.placement, class_id: value || '' } })
                }
              />
              <DateInput
                label="Mulai di kelas"
                placeholder="Pilih tanggal mulai"
                required={Boolean(form.placement.class_id)}
                locale="id"
                valueFormat="D MMMM YYYY"
                value={form.placement.start_date}
                disabled={disabled || placementLocked || !form.placement.class_id}
                onChange={(value) =>
                  setForm({ ...form, placement: { ...form.placement, start_date: value || '' } })
                }
                description="Pilih tanggal mulai penempatan murid di rombel aktif."
              />
            </SimpleGrid>

            <Group justify="space-between">
              <Divider label="Wali murid" labelPosition="left" style={{ flex: 1 }} />
              {writable && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={15} />}
                  onClick={() =>
                    setForm({
                      ...form,
                      guardians: [
                        ...form.guardians,
                        { ...emptyGuardian(), is_primary: form.guardians.length === 0 },
                      ],
                    })
                  }
                >
                  Tambah wali
                </Button>
              )}
            </Group>
            {form.guardians.length === 0 ? (
              <Text c="dimmed" size="sm">
                Belum ada wali.
              </Text>
            ) : (
              form.guardians.map((guardian, index) => (
                <Paper key={index} withBorder p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <IconUsers size={17} />
                        <Text fw={600} size="sm">
                          Wali {index + 1}
                        </Text>
                      </Group>
                      {writable && (
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          aria-label="Hapus wali"
                          onClick={() =>
                            setForm({
                              ...form,
                              guardians: form.guardians.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <TextInput
                        label="Nama wali"
                        placeholder="Masukkan nama lengkap wali"
                        required
                        value={guardian.name}
                        disabled={disabled}
                        onChange={(event) =>
                          updateGuardian(index, { name: event.currentTarget.value })
                        }
                      />
                      <TextInput
                        label="Hubungan"
                        placeholder="Contoh: Ayah, Ibu, atau Kakak"
                        required
                        value={guardian.relation}
                        disabled={disabled}
                        onChange={(event) =>
                          updateGuardian(index, { relation: event.currentTarget.value })
                        }
                      />
                      <TextInput
                        label="Telepon"
                        placeholder="Contoh: 081234567890"
                        value={guardian.phone}
                        disabled={disabled}
                        onChange={(event) =>
                          updateGuardian(index, { phone: event.currentTarget.value })
                        }
                      />
                      <TextInput
                        label="Email"
                        placeholder="wali@example.com"
                        value={guardian.email}
                        disabled={disabled}
                        onChange={(event) =>
                          updateGuardian(index, { email: event.currentTarget.value })
                        }
                      />
                    </SimpleGrid>
                    <Textarea
                      label="Alamat wali"
                      placeholder="Masukkan alamat wali"
                      minRows={2}
                      value={guardian.address}
                      disabled={disabled}
                      onChange={(event) =>
                        updateGuardian(index, { address: event.currentTarget.value })
                      }
                    />
                    <Switch
                      label="Wali utama"
                      checked={guardian.is_primary}
                      disabled={disabled}
                      onChange={(event) =>
                        updateGuardian(index, { is_primary: event.currentTarget.checked })
                      }
                    />
                  </Stack>
                </Paper>
              ))
            )}

            <Group justify="space-between">
              <Divider label="Dokumen murid" labelPosition="left" style={{ flex: 1 }} />
              {writable && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={15} />}
                  onClick={() =>
                    setForm({ ...form, documents: [...form.documents, emptyDocument()] })
                  }
                >
                  Tambah dokumen
                </Button>
              )}
            </Group>
            {form.documents.length === 0 ? (
              <Text c="dimmed" size="sm">
                Belum ada dokumen.
              </Text>
            ) : (
              form.documents.map((document, index) => (
                <Paper key={index} withBorder p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <IconFile size={17} />
                        <Text fw={600} size="sm">
                          Dokumen {index + 1}
                        </Text>
                      </Group>
                      {writable && (
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          aria-label="Hapus dokumen"
                          onClick={() =>
                            setForm({
                              ...form,
                              documents: form.documents.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                    <TextInput
                      label="Jenis dokumen"
                      placeholder="Contoh: Akta kelahiran"
                      required
                      value={document.type}
                      disabled={disabled}
                      onChange={(event) =>
                        updateDocument(index, { type: event.currentTarget.value })
                      }
                    />
                    <FileUploader
                      label="File dokumen"
                      description="PDF, PNG, JPEG, atau WebP; maksimal 10 MB."
                      scope="student.document"
                      value={document.file_url}
                      disabled={disabled}
                      onChange={(value) => updateDocument(index, { file_url: value })}
                    />
                    <Textarea
                      label="Keterangan"
                      placeholder="Tambahkan keterangan dokumen (opsional)"
                      minRows={2}
                      value={document.description}
                      disabled={disabled}
                      onChange={(event) =>
                        updateDocument(index, { description: event.currentTarget.value })
                      }
                    />
                  </Stack>
                </Paper>
              ))
            )}

            {editing && (
              <>
                <Divider label="Riwayat kelas (otomatis)" labelPosition="left" />
                {editing.history.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    Belum ada riwayat kelas.
                  </Text>
                ) : (
                  <Table.ScrollContainer minWidth={600}>
                    <Table withTableBorder>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>TAHUN AJARAN</Table.Th>
                          <Table.Th>ROMBEL</Table.Th>
                          <Table.Th>MULAI</Table.Th>
                          <Table.Th>SELESAI</Table.Th>
                          <Table.Th>STATUS</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {editing.history.map((history) => (
                          <Table.Tr key={history.id}>
                            <Table.Td>{history.academic_year_name}</Table.Td>
                            <Table.Td>{history.class_name}</Table.Td>
                            <Table.Td>{formatDate(history.start_date)}</Table.Td>
                            <Table.Td>{formatDate(history.end_date)}</Table.Td>
                            <Table.Td>
                              <Badge variant="light">{history.status_label}</Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
              </>
            )}
            <Box className={classes.statusCard}>
              <Switch
                label="Status aktif"
                description="Murid nonaktif tetap tersimpan dalam riwayat sekolah."
                checked={form.is_active}
                disabled={disabled}
                onChange={(event) => setForm({ ...form, is_active: event.currentTarget.checked })}
              />
            </Box>
          </Stack>
          <Group className={classes.actions} justify="flex-end" mt="xl">
            <Button variant="default" disabled={saving} onClick={() => setEditing(undefined)}>
              {writable ? 'Batal' : 'Tutup'}
            </Button>
            {writable && (
              <Button type="submit" loading={saving} leftSection={<IconCheck size={17} />}>
                Simpan
              </Button>
            )}
          </Group>
        </form>
      </Modal>

      <Modal
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus murid?"
        centered
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>{' '}
          beserta wali, dokumen, dan riwayat kelasnya.
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
