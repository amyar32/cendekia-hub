'use client';
import { useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAt,
  IconBriefcase2,
  IconCheck,
  IconDeviceLaptop,
  IconKey,
  IconLock,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './account-settings.module.css';

export function AccountSettings({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirm) {
      notifications.show({
        title: 'Kata sandi tidak cocok',
        message: 'Pastikan konfirmasi kata sandi sama dengan kata sandi baru.',
        color: 'red',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      form.reset();
      notifications.show({
        title: 'Kata sandi diperbarui',
        message: 'Sesi perangkat lain telah dikeluarkan.',
        color: 'green',
      });
      router.refresh();
    } catch (e) {
      notifications.show({
        title: 'Gagal memperbarui kata sandi',
        message: e instanceof Error ? e.message : 'Koneksi gagal.',
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  }

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <PageHeading
        eyebrow="PREFERENSI"
        title="Pengaturan Akun"
        description="Informasi profil dan keamanan akun Anda."
      />
      {user.must_change_password && (
        <Alert
          className={styles.securityAlert}
          color="yellow"
          icon={<IconKey size={20} />}
          title="Selesaikan pengamanan akun Anda"
        >
          Kata sandi yang Anda gunakan masih bersifat sementara. Buat kata sandi baru sebelum
          melanjutkan ke fitur lainnya.
        </Alert>
      )}

      <div className={styles.layout}>
        <Paper component="aside" className={styles.profileCard} withBorder>
          <div className={styles.profileTop}>
            <div className={styles.profileGlow} aria-hidden="true" />
            <Avatar className={styles.avatar} size={76} radius={22}>
              {initials}
            </Avatar>
            <Badge
              className={styles.statusBadge}
              color={user.must_change_password ? 'yellow' : 'green'}
              variant="light"
            >
              {user.must_change_password ? 'Perlu diamankan' : 'Akun aktif'}
            </Badge>
          </div>

          <div className={styles.profileBody}>
            <Title order={2} className={styles.profileName}>
              {user.name}
            </Title>
            <Text size="xs" c="dimmed" mt={5}>
              Profil pengguna Cendekia Hub
            </Text>

            <div className={styles.profileDetails}>
              <div className={styles.detailRow}>
                <ThemeIcon variant="light" color="gray" size={36} radius="md">
                  <IconAt size={18} />
                </ThemeIcon>
                <div className={styles.detailContent}>
                  <Text variant="caption">EMAIL</Text>
                  <Text size="xs" fw={600} title={user.email}>
                    {user.email}
                  </Text>
                </div>
              </div>
              <div className={styles.detailRow}>
                <ThemeIcon variant="light" color="gray" size={36} radius="md">
                  <IconBriefcase2 size={18} />
                </ThemeIcon>
                <div className={styles.detailContent}>
                  <Text variant="caption">ROLE</Text>
                  <Text size="xs" fw={600}>
                    {user.role}
                  </Text>
                </div>
              </div>
            </div>

            <div className={styles.managedNote}>
              <IconLock size={15} />
              <Text variant="caption">
                Nama, email, dan role dikelola oleh administrator workspace.
              </Text>
            </div>
          </div>
        </Paper>

        <Paper component="section" className={styles.securityCard} withBorder>
          <div className={styles.sectionHeader}>
            <ThemeIcon size={44} radius="md" variant="light" color="brand">
              <IconShieldCheck size={23} />
            </ThemeIcon>
            <Stack gap={4}>
              <Title order={3}>Keamanan akun</Title>
              <Text size="xs" c="dimmed">
                Perbarui kata sandi Anda secara berkala.
              </Text>
            </Stack>
          </div>

          <form onSubmit={submit} className={styles.passwordForm}>
            <PasswordInput
              label="Kata sandi saat ini"
              placeholder="Masukkan kata sandi saat ini"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
              leftSection={<IconLock size={17} />}
            />
            <PasswordInput
              label="Kata sandi baru"
              placeholder="Buat kata sandi baru"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              leftSection={<IconKey size={17} />}
            />
            <PasswordInput
              label="Konfirmasi kata sandi"
              placeholder="Ulangi kata sandi baru"
              name="confirm"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              leftSection={<IconCheck size={17} />}
            />

            <div className={styles.passwordHint}>
              <IconShieldCheck size={18} />
              <div>
                <Text size="xs" fw={600}>
                  Gunakan minimal 12 karakter
                </Text>
                <Text variant="caption" mt={3}>
                  Hindari kata sandi yang pernah digunakan atau mudah ditebak.
                </Text>
              </div>
            </div>

            <Group className={styles.formFooter} justify="space-between" gap="lg">
              <div className={styles.sessionNote}>
                <IconDeviceLaptop size={17} />
                <Text variant="caption">Perangkat lain akan otomatis dikeluarkan.</Text>
              </div>
              <Button type="submit" loading={busy} leftSection={<IconShieldCheck size={17} />}>
                Simpan kata sandi
              </Button>
            </Group>
          </form>
        </Paper>
      </div>
    </>
  );
}
