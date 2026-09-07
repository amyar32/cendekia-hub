'use client';
import Link from 'next/link';
import { Badge, Box, Button, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconArrowUpRight,
  IconArrowRight,
  IconUsers,
  IconShieldCheck,
  IconChalkboardTeacher,
  IconHistory,
  IconPuzzle,
  IconCircleCheck,
  IconSparkles,
} from '@tabler/icons-react';
import type { SessionUser } from '@/lib/auth';
import { modules, can } from '@/config/modules';
import { formatDate } from '@/lib/format';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './dashboard.module.css';
const cards = [
  {
    key: 'users',
    label: 'Total pengguna',
    icon: IconUsers,
    color: 'blue',
    note: 'Anggota workspace',
    path: '/administration/users',
  },
  {
    key: 'roles',
    label: 'Role aktif',
    icon: IconShieldCheck,
    color: 'grape',
    note: 'Konfigurasi hak akses',
    path: '/administration/roles',
  },
  {
    key: 'teachers',
    label: 'Guru',
    icon: IconChalkboardTeacher,
    color: 'brand',
    note: 'Data tersimpan',
    path: '/master-data/teachers',
  },
  {
    key: 'students',
    label: 'Murid',
    icon: IconUsers,
    color: 'cyan',
    note: 'Data tersimpan',
    path: '/master-data/students',
  },
  {
    key: 'audit',
    label: 'Aktivitas tercatat',
    icon: IconHistory,
    color: 'orange',
    note: 'Riwayat audit trail',
    path: '/administration/audit',
  },
] as const;
export function Dashboard({
  user,
  stats,
  activities,
}: {
  user: SessionUser;
  stats: Record<string, number | null>;
  activities: { id: number; actor: string; action: string; entity: string; created_at: string }[];
}) {
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE OVERVIEW"
        title="Ringkasan"
        description="Pantau data, akses, dan aktivitas workspace dalam satu tempat."
        action={
          <Badge
            size="lg"
            variant="light"
            color="brand"
            leftSection={<Box className={styles.statusDot} />}
          >
            Workspace aktif
          </Badge>
        }
      />
      <section className={styles.welcomeBanner}>
        <div>
          <Badge variant="light" color="brand" mb="md" leftSection={<IconSparkles size={13} />}>
            SELAMAT DATANG
          </Badge>
          <Title order={2} mb="sm">
            Halo, {user.name.split(' ')[0]} 👋
          </Title>
          <Text c="var(--app-color-muted-strong)" size="xs" lh={1.9} mb="xl">
            Semua yang Anda butuhkan untuk mengelola workspace.
            <br />
            Mulai dari data yang rapi hingga akses tim yang terkendali.
          </Text>
          {can(user.permissions, 'teachers.read') && (
            <Button
              component={Link}
              href="/master-data/teachers"
              rightSection={<IconArrowRight size={17} />}
            >
              Kelola data guru
            </Button>
          )}
        </div>
        <div className={styles.bannerArt} aria-hidden="true">
          <div className={styles.artOrbit}>
            <div className={`${styles.artTile} ${styles.tileBack}`}>
              <IconShieldCheck size={42} />
            </div>
            <div className={`${styles.artTile} ${styles.tileFront}`}>
              <IconPuzzle size={56} />
            </div>
            <Box className={`${styles.artDot} ${styles.dotOne}`} />
            <Box className={`${styles.artDot} ${styles.dotTwo}`} />
          </div>
        </div>
      </section>
      <div className={styles.statsGrid}>
        {cards
          .filter((c) => stats[c.key] !== null)
          .map((c) => (
            <Link href={c.path} className={styles.statCard} key={c.key}>
              <div className={styles.statTop}>
                <ThemeIcon size={42} radius="md" variant="light" color={c.color}>
                  <c.icon size={22} />
                </ThemeIcon>
                <IconArrowUpRight size={18} color="var(--app-color-muted-soft)" />
              </div>
              <Text variant="label" mb={8}>
                {c.label}
              </Text>
              <Text fw={700} fz={29} lh={1.2} mb={12} className={styles.statValue}>
                {stats[c.key]?.toLocaleString('id-ID')}
              </Text>
              <Text variant="caption">{c.note}</Text>
            </Link>
          ))}
      </div>
      <div className={styles.dashboardBottom}>
        <Paper component="section" className={styles.panel} withBorder>
          <div className={styles.panelHeader}>
            <Stack gap={5}>
              <Title order={3}>Aktivitas terbaru</Title>
              <Text variant="caption">Jejak perubahan di workspace Anda</Text>
            </Stack>
            {can(user.permissions, 'audit.read') && (
              <Button
                component={Link}
                href="/administration/audit"
                size="compact-sm"
                variant="subtle"
                rightSection={<IconArrowRight size={14} />}
              >
                Lihat semua
              </Button>
            )}
          </div>
          {activities.length ? (
            <div className={styles.activityList}>
              {activities.map((a) => (
                <div className={styles.activityItem} key={a.id}>
                  <ThemeIcon
                    variant="light"
                    color={a.action.includes('failed') ? 'red' : 'brand'}
                    radius="xl"
                    size={36}
                  >
                    <IconHistory size={18} />
                  </ThemeIcon>
                  <div>
                    <Text fw={600} size="xs">
                      {a.actor}
                    </Text>
                    <Text variant="caption" mt={5}>
                      {a.action} · {a.entity}
                    </Text>
                  </div>
                  <Text variant="caption" className={styles.activityTime}>
                    {formatDate(a.created_at)}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySmall}>
              <IconHistory size={30} />
              <Text variant="description">
                {can(user.permissions, 'audit.read')
                  ? 'Belum ada aktivitas tercatat.'
                  : 'Audit trail hanya tersedia untuk role dengan izin akses.'}
              </Text>
            </div>
          )}
        </Paper>
        <Paper component="section" className={styles.panel} withBorder>
          <div className={styles.panelHeader}>
            <Stack gap={5}>
              <Title order={3}>Modul workspace</Title>
              <Text variant="caption">Fondasi yang siap dikembangkan</Text>
            </Stack>
            <Badge color="gray" variant="light">
              {modules.filter((m) => can(user.permissions, m.permission)).length} modul
            </Badge>
          </div>
          <div className={styles.moduleLinks}>
            {modules
              .filter((m) => can(user.permissions, m.permission))
              .map((m) => (
                <Link href={m.path} key={m.key}>
                  <div className={styles.moduleIcon}>
                    <IconPuzzle size={20} />
                  </div>
                  <div>
                    <Text fw={600} size="xs">
                      {m.label}
                    </Text>
                    <Text variant="caption" mt={5}>
                      {m.group}
                    </Text>
                  </div>
                  <IconArrowUpRight size={17} />
                </Link>
              ))}
          </div>
          <Text className={styles.moduleNote} variant="caption">
            <IconCircleCheck size={16} /> Akses modul sesuai permission role Anda
          </Text>
        </Paper>
      </div>
    </>
  );
}
