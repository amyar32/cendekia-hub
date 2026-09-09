'use client';

import Link from 'next/link';
import { Button, Tabs } from '@mantine/core';
import { IconQrcode, IconSchool, IconUsers } from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { CheckinManager } from './checkin-manager';

export function CheckinHub({ writable }: { writable: boolean }) {
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
        </Tabs.List>
        <Tabs.Panel value="students">
          <CheckinManager writable={writable} embedded />
        </Tabs.Panel>
        <Tabs.Panel value="teachers">
          <CheckinManager writable={writable} personType="teacher" embedded />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
