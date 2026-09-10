'use client';

import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent, IconCheck, IconCopy, IconPencil, IconTrash } from '@tabler/icons-react';
import 'dayjs/locale/id';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { moduleMutation, useModuleList } from '@/hooks/use-module-list';
import { publishAcademicContext } from '@/lib/academic-context-client';
import classes from './academic-year-manager.module.css';

type SemesterForm = {
  id?: string;
  name: string;
  period: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};
type ClassroomForm = {
  id?: string;
  grade_id: string;
  grade_name?: string;
  name: string;
  is_active: boolean;
  student_count?: number;
};
type AcademicYear = {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  semesters: Array<Omit<SemesterForm, 'is_active'> & { is_active: number }>;
  classrooms: Array<Omit<ClassroomForm, 'is_active'> & { is_active: number }>;
  student_count: number;
};
type AcademicYearForm = {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  copy_from_academic_year_id: string;
  copy_semesters: boolean;
  copy_classrooms: boolean;
  copy_teaching_assignments: boolean;
  copy_homeroom_assignments: boolean;
  copy_schedules: boolean;
  copy_extracurricular_assignments: boolean;
  copy_extracurricular_schedules: boolean;
};

const emptyForm = (): AcademicYearForm => ({
  name: '',
  start_date: '',
  end_date: '',
  is_active: false,
  copy_from_academic_year_id: '',
  copy_semesters: true,
  copy_classrooms: true,
  copy_teaching_assignments: true,
  copy_homeroom_assignments: true,
  copy_schedules: true,
  copy_extracurricular_assignments: true,
  copy_extracurricular_schedules: true,
});
const endpoint = '/api/modules/academic-years';
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
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
            copy_from_academic_year_id: '',
            copy_semesters: false,
            copy_classrooms: false,
            copy_teaching_assignments: false,
            copy_homeroom_assignments: false,
            copy_schedules: false,
            copy_extracurricular_assignments: false,
            copy_extracurricular_schedules: false,
          }
        : emptyForm(),
    );
    setEditing(year);
  }

  function selectCopySource(value: string | null) {
    setForm((current) => ({ ...current, copy_from_academic_year_id: value || '' }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await moduleMutation(endpoint, editing ? 'PATCH' : 'POST', { ...form, id: editing?.id });
      if (form.is_active) {
        publishAcademicContext({
          academic_year: form.name,
          semester: editing?.is_active ? undefined : null,
        });
      }
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
        description="Pantau periode, kesiapan struktur akademik, dan jumlah murid setiap tahun ajaran."
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
        note="Jumlah murid dihitung dari penempatan aktif. Semester dan rombel dikelola dari menu Data Akademik."
      >
        <Table.ScrollContainer minWidth={980}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>NAMA</Table.Th>
                <Table.Th>PERIODE</Table.Th>
                <Table.Th>SEMESTER</Table.Th>
                <Table.Th>ROMBEL</Table.Th>
                <Table.Th>MURID</Table.Th>
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
                  <Table.Td>
                    <Text size="xs">
                      {formatDate(year.start_date)} – {formatDate(year.end_date)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{year.semesters.length}</Table.Td>
                  <Table.Td>{year.classrooms.length}</Table.Td>
                  <Table.Td>
                    <Text fw={600} size="xs">
                      {year.student_count} murid
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={year.is_active ? 'green' : 'gray'}>
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
        title={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" size={38} radius="md">
              <IconCalendarEvent size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700}>{editing ? 'Edit' : 'Tambah'} tahun ajaran</Text>
              <Text c="dimmed" size="xs">
                Lengkapi periode tahun ajaran sebelum menyimpan.
              </Text>
            </Box>
          </Group>
        }
        centered
        size="xl"
      >
        <form onSubmit={save}>
          <Stack gap="xl">
            <Stack gap="md">
              <Text fw={700}>Informasi tahun ajaran</Text>
              <TextInput
                label="Nama tahun ajaran"
                description="Gunakan nama yang mudah dikenali."
                placeholder="Contoh: 2026/2027"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
                required
                minLength={4}
                maxLength={50}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <DateInput
                  label="Tanggal mulai"
                  placeholder="Pilih tanggal mulai"
                  value={form.start_date || null}
                  maxDate={form.end_date || undefined}
                  onChange={(value) => setForm({ ...form, start_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  popoverProps={{ withinPortal: true }}
                  required
                />
                <DateInput
                  label="Tanggal selesai"
                  placeholder="Pilih tanggal selesai"
                  value={form.end_date || null}
                  minDate={form.start_date || undefined}
                  onChange={(value) => setForm({ ...form, end_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  popoverProps={{ withinPortal: true }}
                  required
                />
              </SimpleGrid>
              <Box className={classes.statusCard}>
                <Switch
                  label="Jadikan tahun ajaran aktif"
                  description="Tahun ajaran lain yang aktif akan dinonaktifkan otomatis."
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.currentTarget.checked })}
                />
              </Box>
            </Stack>

            {!editing && list.rows.length > 0 && (
              <>
                <Divider />
                <Stack gap="md">
                  <Box>
                    <Group gap="xs">
                      <IconCopy size={19} />
                      <Text fw={700}>Salin dari tahun ajaran sebelumnya</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Pilihan yang dicentang akan langsung disalin ketika tahun ajaran disimpan.
                    </Text>
                  </Box>
                  <Select
                    label="Tahun ajaran sumber"
                    placeholder="Pilih tahun ajaran"
                    data={list.options?.academic_year_id || []}
                    value={form.copy_from_academic_year_id || null}
                    onChange={selectCopySource}
                    searchable
                    clearable
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Checkbox
                      label="Salin semester"
                      checked={form.copy_semesters}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setForm({
                          ...form,
                          copy_semesters: checked,
                          copy_schedules: checked ? form.copy_schedules : false,
                          copy_extracurricular_assignments: checked
                            ? form.copy_extracurricular_assignments
                            : false,
                          copy_extracurricular_schedules: checked
                            ? form.copy_extracurricular_schedules
                            : false,
                        });
                      }}
                    />
                    <Checkbox
                      label="Salin rombel"
                      checked={form.copy_classrooms}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setForm({
                          ...form,
                          copy_classrooms: checked,
                          copy_schedules: checked ? form.copy_schedules : false,
                        });
                      }}
                    />
                    <Checkbox
                      label="Salin penugasan mengajar"
                      checked={form.copy_teaching_assignments}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setForm({
                          ...form,
                          copy_teaching_assignments: checked,
                          copy_schedules: checked ? form.copy_schedules : false,
                        });
                      }}
                    />
                    <Checkbox
                      label="Salin wali kelas"
                      checked={form.copy_homeroom_assignments}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          copy_homeroom_assignments: event.currentTarget.checked,
                        })
                      }
                    />
                    <Checkbox
                      label="Salin jadwal pelajaran"
                      description="Mengikuti semester, rombel, dan penugasan yang disalin"
                      checked={form.copy_schedules}
                      disabled={
                        !form.copy_semesters ||
                        !form.copy_classrooms ||
                        !form.copy_teaching_assignments
                      }
                      onChange={(event) =>
                        setForm({ ...form, copy_schedules: event.currentTarget.checked })
                      }
                    />
                    <Checkbox
                      label="Salin penugasan ekstrakurikuler"
                      description="Pembina, lokasi, dan kuota disalin sebagai draft; peserta dikosongkan"
                      checked={form.copy_extracurricular_assignments}
                      disabled={!form.copy_semesters}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setForm({
                          ...form,
                          copy_extracurricular_assignments: checked,
                          copy_extracurricular_schedules: checked
                            ? form.copy_extracurricular_schedules
                            : false,
                        });
                      }}
                    />
                    <Checkbox
                      label="Salin jadwal ekstrakurikuler"
                      description="Mengikuti slot dan pemetaan semester yang disalin"
                      checked={form.copy_extracurricular_schedules}
                      disabled={!form.copy_semesters || !form.copy_extracurricular_assignments}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          copy_extracurricular_schedules: event.currentTarget.checked,
                        })
                      }
                    />
                  </SimpleGrid>
                </Stack>
              </>
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

      <ConfirmationDialog
        opened={!!removing}
        onClose={() => !saving && setRemoving(null)}
        title="Hapus tahun ajaran?"
        loading={saving}
        onConfirm={remove}
        confirmLabel="Hapus tahun ajaran"
      >
        <Text>
          Anda akan menghapus{' '}
          <Text component="span" inherit fw={700}>
            {removing?.name}
          </Text>
          . Semester dan rombel yang masih digunakan oleh data lain tidak dapat dihapus.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
