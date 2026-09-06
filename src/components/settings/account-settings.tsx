'use client';
import { useState } from 'react';
import { Button, Paper, PasswordInput, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { SessionUser } from '@/lib/auth';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './account-settings.module.css';
export function AccountSettings({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
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
  return (
    <>
      <PageHeading
        eyebrow="PREFERENSI"
        title="Pengaturan Akun"
        description="Informasi profil dan keamanan akun Anda."
      />
      <Paper component="section" className={styles.panel} withBorder>
        <Title order={3} mb="xl">
          Profil Anda
        </Title>
        <TextInput label="Nama" value={user.name} readOnly mb="md" />
        <TextInput label="Email" value={user.email} readOnly mb="md" />
        <TextInput label="Role" value={user.role} readOnly mb="xl" />
        <Title order={3} mb="xl">
          Ubah kata sandi
        </Title>
        <form onSubmit={submit}>
          <PasswordInput
            label="Kata sandi saat ini"
            name="currentPassword"
            autoComplete="current-password"
            required
            mb="md"
            maxLength={128}
          />
          <PasswordInput
            label="Kata sandi baru"
            description="Gunakan minimal 12 karakter."
            name="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            mb="md"
          />
          <PasswordInput
            label="Konfirmasi kata sandi"
            name="confirm"
            autoComplete="new-password"
            required
            mb="xl"
          />
          <Button type="submit" loading={busy}>
            Simpan kata sandi
          </Button>
        </form>
      </Paper>
    </>
  );
}
