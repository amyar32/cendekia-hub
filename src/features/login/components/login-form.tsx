'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowRight } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { APP_BRAND_ASSETS, APP_NAME } from '@/config/branding';
import styles from '@/features/login/components/login-form.module.css';
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
        message: 'Selamat datang kembali. Semoga hari Anda menyenangkan!',
        color: 'green',
      });
      router.replace(result.must_change_password ? '/settings/account' : result.redirect_to || '/');
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
          <Image
            src={APP_BRAND_ASSETS.logo}
            alt={APP_NAME}
            width={2172}
            height={724}
            className={styles.brandLogo}
            priority
          />
        </Text>
        <Text className={styles.copyright} size="xs" c="var(--app-color-muted-soft)">
          © {new Date().getFullYear()} {APP_NAME}
        </Text>
      </section>
      <section className={styles.formWrap}>
        <div className={styles.form}>
          <Image
            src={APP_BRAND_ASSETS.icon}
            alt=""
            width={1254}
            height={1254}
            className={styles.formBrandIcon}
            priority
          />
          <Stack gap={8} mt="xl">
            <Title order={2}>Selamat datang kembali</Title>
            <Text variant="description">Silakan masuk dengan akun sekolah Anda.</Text>
          </Stack>
          <form onSubmit={submit}>
            <TextInput
              label="Email"
              name="email"
              placeholder="nama@sekolah.sch.id"
              type="email"
              autoComplete="username"
              required
              size="md"
              mb="lg"
            />
            <PasswordInput
              label="Kata sandi"
              name="password"
              placeholder="Masukkan kata sandi"
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
              Masuk
            </Button>
          </form>
          <Text className={styles.help} variant="caption">
            Butuh bantuan untuk masuk? Hubungi admin sekolah.
          </Text>
        </div>
      </section>
    </main>
  );
}
