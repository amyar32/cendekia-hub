'use client';

import { useState } from 'react';
import {
  Avatar,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSchool } from '@tabler/icons-react';
import { ImageUploader } from '@/components/cms/image-uploader/image-uploader';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { formatDate } from '@/lib/format';
import styles from './school-settings.module.css';

export type School = {
  id: string;
  name: string;
  code: string;
  npsn: string;
  address: string;
  email: string;
  phone: string;
  logo_url: string;
  timezone: string;
  checkin_late_after: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type SchoolForm = Omit<School, 'id' | 'created_at' | 'updated_at' | 'is_active'> & {
  is_active: boolean;
};

const emptyForm: SchoolForm = {
  name: '',
  code: '',
  npsn: '',
  address: '',
  email: '',
  phone: '',
  logo_url: '',
  timezone: 'Asia/Jakarta',
  checkin_late_after: '07:15',
  is_active: true,
};

const timezoneOptions = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura (UTC+9)' },
];

function toForm(school: School | null): SchoolForm {
  if (!school) return emptyForm;
  return {
    name: school.name,
    code: school.code,
    npsn: school.npsn,
    address: school.address,
    email: school.email,
    phone: school.phone,
    logo_url: school.logo_url,
    timezone: school.timezone,
    checkin_late_after: school.checkin_late_after || '07:15',
    is_active: Boolean(school.is_active),
  };
}

export function SchoolSettings({
  initialSchool,
  writable,
}: {
  initialSchool: School | null;
  writable: boolean;
}) {
  const [school, setSchool] = useState(initialSchool);
  const [form, setForm] = useState(() => toForm(initialSchool));
  const [saving, setSaving] = useState(false);

  function setField<Key extends keyof SchoolForm>(key: Key, value: SchoolForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/modules/school', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan pengaturan sekolah.');
      setSchool(result.school);
      setForm(toForm(result.school));
      notifications.show({
        color: 'green',
        title: 'Pengaturan tersimpan',
        message: 'Informasi sekolah berhasil diperbarui.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan pengaturan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="PREFERENSI"
        title="Pengaturan Sekolah"
        description="Kelola identitas, kontak, dan pengaturan dasar sekolah."
      />
      <Paper component="section" className={styles.panel} withBorder>
        <Group gap="md" mb="xl" wrap="nowrap">
          <Avatar src={form.logo_url || undefined} size={58} radius="md" color="brand">
            <IconSchool size={28} />
          </Avatar>
          <Stack gap={3}>
            <Title order={3}>Informasi sekolah</Title>
            <Text size="xs" c="dimmed">
              Data ini menjadi identitas utama sekolah di dalam sistem.
            </Text>
          </Stack>
        </Group>

        <form onSubmit={save}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Nama sekolah"
              placeholder="Contoh: SMA Cendekia Utama"
              value={form.name}
              onChange={(event) => setField('name', event.currentTarget.value)}
              required
              minLength={2}
              maxLength={150}
              disabled={!writable}
            />
            <TextInput
              label="Kode sekolah"
              placeholder="Contoh: SCU"
              value={form.code}
              onChange={(event) => setField('code', event.currentTarget.value)}
              maxLength={50}
              disabled={!writable}
            />
            <TextInput
              label="Email"
              placeholder="admin@sekolah.sch.id"
              type="email"
              value={form.email}
              onChange={(event) => setField('email', event.currentTarget.value)}
              maxLength={254}
              disabled={!writable}
            />
            <TextInput
              label="Telepon"
              placeholder="Contoh: 0215550101"
              type="tel"
              value={form.phone}
              onChange={(event) => setField('phone', event.currentTarget.value)}
              maxLength={30}
              disabled={!writable}
            />
            <TextInput
              label="NPSN"
              placeholder="8 digit NPSN"
              description="Nomor Pokok Sekolah Nasional, terdiri dari 8 digit."
              value={form.npsn}
              onChange={(event) => setField('npsn', event.currentTarget.value)}
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              disabled={!writable}
            />
            <Select
              label="Zona waktu"
              placeholder="Pilih zona waktu"
              description="Pilih zona waktu operasional sekolah."
              data={timezoneOptions}
              value={form.timezone}
              onChange={(value) => value && setField('timezone', value)}
              required
              allowDeselect={false}
              disabled={!writable}
            />
          </SimpleGrid>
          <Textarea
            label="Alamat"
            placeholder="Masukkan alamat lengkap sekolah"
            value={form.address}
            onChange={(event) => setField('address', event.currentTarget.value)}
            maxLength={1000}
            minRows={3}
            mt="md"
            disabled={!writable}
          />
          <Divider my="lg" />
          <ImageUploader
            label="Logo sekolah"
            description="PNG, JPEG, atau WebP. Ukuran maksimal 5 MB."
            scope="school.logo"
            value={form.logo_url}
            onChange={(value) => setField('logo_url', value)}
            disabled={!writable}
          />
          <Switch
            label="Sekolah aktif"
            description="Nonaktifkan jika profil sekolah untuk sementara tidak digunakan."
            checked={form.is_active}
            onChange={(event) => setField('is_active', event.currentTarget.checked)}
            mt="lg"
            disabled={!writable}
          />

          <Divider my="xl" />
          <Group justify="space-between" align="flex-end">
            <Stack gap={3}>
              {school ? (
                <>
                  <Text variant="caption">Dibuat {formatDate(school.created_at)}</Text>
                  <Text variant="caption">Diperbarui {formatDate(school.updated_at)}</Text>
                </>
              ) : (
                <Text variant="caption">Profil sekolah belum pernah disimpan.</Text>
              )}
            </Stack>
            {writable && (
              <Button type="submit" loading={saving}>
                Simpan pengaturan
              </Button>
            )}
          </Group>
        </form>
      </Paper>
    </>
  );
}
