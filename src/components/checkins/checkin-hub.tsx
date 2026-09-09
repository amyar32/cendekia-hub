'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Group, LoadingOverlay, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { TimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconClock, IconQrcode, IconSchool, IconUsers } from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { CheckinManager } from './checkin-manager';

export function CheckinHub({ writable }: { writable: boolean }) {
  const [lateAfter, setLateAfter] = useState('07:15');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetch('/api/modules/checkins/settings')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Koneksi gagal.');
        setLateAfter(result.checkin_late_after);
      })
      .catch((error: unknown) =>
        notifications.show({
          color: 'red',
          title: 'Pengaturan check-in gagal dimuat',
          message: error instanceof Error ? error.message : 'Koneksi gagal.',
        }),
      )
      .finally(() => setLoadingSettings(false));
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch('/api/modules/checkins/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkin_late_after: lateAfter }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Koneksi gagal.');
      setLateAfter(result.checkin_late_after);
      notifications.show({
        color: 'green',
        title: 'Pengaturan tersimpan',
        message: 'Batas keterlambatan check-in telah diperbarui.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Gagal menyimpan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="KEHADIRAN HARIAN"
        title="Check-in"
        description="Catat dan pantau kedatangan murid maupun guru dari satu tempat."
        action={
          writable ? (
            <Button
              component={Link}
              href="/checkins/scanner"
              leftSection={<IconQrcode size={18} />}
            >
              Buka scanner
            </Button>
          ) : undefined
        }
      />
      <Tabs defaultValue="students" keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="students" leftSection={<IconUsers size={17} />}>
            Murid
          </Tabs.Tab>
          <Tabs.Tab value="teachers" leftSection={<IconSchool size={17} />}>
            Guru
          </Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<IconClock size={17} />}>
            Pengaturan
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="students">
          <CheckinManager writable={writable} embedded />
        </Tabs.Panel>
        <Tabs.Panel value="teachers">
          <CheckinManager writable={writable} personType="teacher" embedded />
        </Tabs.Panel>
        <Tabs.Panel value="settings" pt="lg">
          <Paper withBorder p="lg" pos="relative">
            <LoadingOverlay visible={loadingSettings} />
            <Stack gap="md">
              <Stack gap={3}>
                <Title order={3}>Aturan keterlambatan</Title>
                <Text size="sm" c="dimmed">
                  Check-in setelah batas ini otomatis berstatus terlambat, baik untuk murid maupun
                  guru.
                </Text>
              </Stack>
              <TimePicker
                label="Batas waktu check-in"
                value={lateAfter}
                onChange={setLateAfter}
                format="24h"
                withDropdown
                minutesStep={5}
                hoursInputLabel="Jam batas"
                minutesInputLabel="Menit batas"
                disabled={!writable || loadingSettings}
                w={{ base: '100%', sm: 300 }}
              />
              {writable && (
                <Group justify="flex-end">
                  <Button loading={savingSettings} onClick={saveSettings}>
                    Simpan pengaturan
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
