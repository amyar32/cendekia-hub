'use client';
import { useState } from 'react';
import {
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowRight,
  IconLayersIntersect,
  IconShieldCheck,
  IconDatabase,
  IconHistory,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import styles from './login-form.module.css';
export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifications.show({
        title: 'Berhasil masuk',
        message: 'Selamat datang kembali di workspace Anda.',
        color: 'green',
      });
      router.replace(result.must_change_password ? '/settings/account' : '/');
      router.refresh();
    } catch (e) {
      notifications.show({
        title: 'Gagal masuk',
        message: e instanceof Error ? e.message : 'Tidak dapat terhubung ke server.',
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.layout}>
      <section className={styles.story}>
        <Text component="div" className={styles.brand}>
          <ThemeIcon className={styles.brandIcon} size={34} radius={10}>
            <IconLayersIntersect />
          </ThemeIcon>
          Cendekia
          <Text component="span" className={styles.brandLight}>
            Hub
          </Text>
        </Text>
        <div>
          <Text variant="eyebrow">RUANG KERJA, LEBIH TERATUR</Text>
          <Title
            order={1}
            fz="clamp(32px, 3.5vw, 54px)"
            lh={1.2}
            my={20}
            c="var(--app-color-surface)"
          >
            Satu tempat.
            <br />
            Banyak kemungkinan.
          </Title>
          <Text className={styles.intro}>
            Fondasi yang tepat untuk mengelola data,
            <br />
            tim, dan setiap langkah pertumbuhan Anda.
          </Text>
          <Stack gap={20} mt={40} c="var(--app-color-brand-soft)">
            {[
              [IconDatabase, 'Data yang terorganisir'],
              [IconShieldCheck, 'Akses yang terkontrol'],
              [IconHistory, 'Aktivitas yang terlacak'],
            ].map(([Icon, label]) => {
              const I = Icon as typeof IconDatabase;
              return (
                <Group gap={13} key={String(label)}>
                  <I size={21} />
                  <Text size="xs" inherit>
                    {String(label)}
                  </Text>
                </Group>
              );
            })}
          </Stack>
        </div>
        <Text className={styles.copyright} size="xs" c="var(--app-color-muted-soft)">
          © {new Date().getFullYear()} Cendekia Hub
        </Text>
      </section>
      <section className={styles.formWrap}>
        <div className={styles.form}>
          <ThemeIcon size={48} radius="xl" variant="light">
            <IconShieldCheck size={25} />
          </ThemeIcon>
          <Stack gap={8} mt="xl">
            <Title order={2}>Selamat datang kembali</Title>
            <Text variant="description">Masuk untuk melanjutkan ke workspace Anda.</Text>
          </Stack>
          <form onSubmit={submit}>
            <TextInput
              label="Email"
              name="email"
              placeholder="nama@perusahaan.com"
              type="email"
              autoComplete="username"
              required
              size="md"
              mb="lg"
            />
            <PasswordInput
              label="Kata sandi"
              name="password"
              placeholder="Masukkan kata sandi Anda"
              autoComplete="current-password"
              required
              size="md"
              mb="xl"
              maxLength={128}
            />
            <Button
              type="submit"
              fullWidth
              size="md"
              loading={busy}
              rightSection={<IconArrowRight size={18} />}
            >
              Masuk ke workspace
            </Button>
          </form>
          <Text className={styles.help} variant="caption">
            Belum memiliki akses? Hubungi administrator workspace Anda.
          </Text>
        </div>
      </section>
    </main>
  );
}
