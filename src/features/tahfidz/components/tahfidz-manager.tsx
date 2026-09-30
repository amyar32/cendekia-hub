'use client';
import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';

type Group = {
  id: string;
  name: string;
  teacher_id: string;
  teacher_name: string;
  semester_id: string | null;
  time_slot_id: string;
  weekdays: number[];
  location: string;
  quota: number;
  status: 'draft' | 'active' | 'completed';
  student_ids: string[];
  participant_count: number;
  semester_name: string;
  slot_name: string;
  start_time: string;
  end_time: string;
};
type Form = {
  name: string;
  teacher_id: string;
  semester_id: string;
  time_slot_id: string;
  weekdays: string[];
  location: string;
  quota: number | string;
  status: 'draft' | 'active' | 'completed';
  student_ids: string[];
};
const empty = (): Form => ({
  name: '',
  teacher_id: '',
  semester_id: 'all',
  time_slot_id: '',
  weekdays: ['1', '2', '3', '4', '5'],
  location: '',
  quota: 10,
  status: 'active',
  student_ids: [],
});
const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const endpoint = '/api/modules/tahfidz';
export function TahfidzManager({ writable }: { writable: boolean }) {
  const [year, setYear] = useState('');
  const list = useModuleList<Group>(endpoint, year ? { academic_year_id: year } : {});
  const [editing, setEditing] = useState<Group | null | undefined>();
  const [removing, setRemoving] = useState<Group | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [saving, setSaving] = useState(false);
  const selectedYear = year || list.selected?.academic_year_id || '';
  const open = (row: Group | null) => {
    setForm(
      row
        ? {
            name: row.name,
            teacher_id: row.teacher_id,
            semester_id: row.semester_id || 'all',
            time_slot_id: row.time_slot_id,
            weekdays: row.weekdays.map(String),
            location: row.location,
            quota: row.quota,
            status: row.status,
            student_ids: row.student_ids,
          }
        : empty(),
    );
    setEditing(row);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', {
        ...form,
        id: editing?.id,
        academic_year_id: selectedYear,
        weekdays: form.weekdays.map(Number),
      });
      setEditing(undefined);
      list.reload();
      notifications.show({ color: 'green', message: 'Kelompok halaqah disimpan.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Gagal menyimpan.',
      });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      await moduleMutation(endpoint, 'DELETE', { id: removing.id });
      setRemoving(null);
      list.reload();
      notifications.show({ color: 'green', message: 'Kelompok dihapus.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Gagal menghapus.',
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <ModuleListLayout
        eyebrow="AKADEMIK"
        title="Tahfidz & Halaqah"
        description="Kelompok lintas rombel, pembimbing, jadwal, peserta, dan kuota."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        onAdd={writable ? () => open(null) : undefined}
        addLabel="Tambah halaqah"
        emptyMessage="Belum ada kelompok halaqah."
        note="Jadwal memakai slot waktu sekolah dan mencegah bentrok pembimbing maupun peserta."
        toolbarLeading={
          <Select
            aria-label="Filter tahun ajaran"
            value={selectedYear}
            onChange={(v) => {
              setYear(v || '');
              list.setPage(1);
            }}
            data={list.options?.academic_year_id || []}
            w={220}
          />
        }
      >
        <Table.ScrollContainer minWidth={780}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Kelompok</Table.Th>
                <Table.Th>Pembimbing</Table.Th>
                <Table.Th>Jadwal</Table.Th>
                <Table.Th>Peserta</Table.Th>
                <Table.Th>Status</Table.Th>
                {writable ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Text fw={700}>{row.name}</Text>
                    <Text size="xs" c="dimmed">
                      {row.semester_name}
                      {row.location ? ` · ${row.location}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>{row.teacher_name}</Table.Td>
                  <Table.Td>
                    {row.weekdays.map((weekday) => days[weekday - 1]).join(', ')} · {row.slot_name}
                    <Text size="xs" c="dimmed">
                      {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {row.participant_count}/{row.quota}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={row.status === 'active' ? 'green' : 'gray'}>
                      {row.status === 'active'
                        ? 'Aktif'
                        : row.status === 'draft'
                          ? 'Draft'
                          : 'Selesai'}
                    </Badge>
                  </Table.Td>
                  {writable ? (
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon variant="subtle" onClick={() => open(row)} aria-label="Edit">
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => setRemoving(row)}
                          aria-label="Hapus"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </ModuleListLayout>
      <Modal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Ubah halaqah' : 'Tambah halaqah'}
        size="lg"
      >
        <form onSubmit={save}>
          <Stack>
            <TextInput
              required
              label="Nama kelompok"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
              placeholder="Halaqah A"
            />
            <Select
              required
              searchable
              label="Pembimbing"
              placeholder="Pilih guru pembimbing"
              data={list.options?.teacher_id || []}
              value={form.teacher_id}
              onChange={(v) => setForm({ ...form, teacher_id: v || '' })}
            />
            <Select
              label="Semester"
              placeholder="Pilih semester"
              data={list.options?.semester_id || []}
              value={form.semester_id}
              onChange={(v) => setForm({ ...form, semester_id: v || 'all' })}
            />
            <Group grow align="end">
              <MultiSelect
                required
                label="Hari kegiatan"
                placeholder="Pilih satu atau beberapa hari"
                data={days.map((label, index) => ({ value: String(index + 1), label }))}
                value={form.weekdays}
                onChange={(weekdays) => setForm({ ...form, weekdays })}
              />
              <Select
                required
                searchable
                label="Slot jadwal"
                description="Memakai slot jadwal sekolah"
                placeholder="Pilih, misalnya 07.30–08.00"
                data={list.options?.time_slot_id || []}
                value={form.time_slot_id}
                onChange={(v) => setForm({ ...form, time_slot_id: v || '' })}
              />
            </Group>
            <TextInput
              label="Lokasi"
              placeholder="Contoh: Masjid sekolah"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.currentTarget.value })}
            />
            <Group grow>
              <NumberInput
                required
                min={1}
                max={100}
                label="Kuota"
                placeholder="Contoh: 10"
                value={form.quota}
                onChange={(v) => setForm({ ...form, quota: v })}
              />
              <Select
                label="Status"
                placeholder="Pilih status kelompok"
                data={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'active', label: 'Aktif' },
                  { value: 'completed', label: 'Selesai' },
                ]}
                value={form.status}
                onChange={(v) => setForm({ ...form, status: (v || 'active') as Form['status'] })}
              />
            </Group>
            <MultiSelect
              required
              searchable
              label="Peserta"
              description="Boleh berasal dari rombel dan tingkat yang berbeda."
              placeholder="Cari dan pilih peserta halaqah"
              data={list.options?.student_ids || []}
              value={form.student_ids}
              onChange={(student_ids) => setForm({ ...form, student_ids })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(undefined)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                Simpan
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <ConfirmationDialog
        opened={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={saving}
        title="Hapus kelompok halaqah?"
        confirmLabel="Hapus"
      >
        <Text>Riwayat sesi dan setoran kelompok ini ikut terhapus.</Text>
      </ConfirmationDialog>
    </>
  );
}
