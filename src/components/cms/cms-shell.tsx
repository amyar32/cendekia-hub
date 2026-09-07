'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Anchor,
  AppShell,
  Avatar,
  Box,
  Breadcrumbs,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLayersIntersect,
  IconLayoutDashboard,
  IconUsers,
  IconShieldCheck,
  IconHistory,
  IconLogout,
  IconChevronDown,
  IconSettings,
  IconSchool,
  IconArrowUpRight,
  IconCalendarEvent,
  IconBooks,
  IconHierarchy,
  IconSchoolBell,
  IconUsersGroup,
  IconHome2,
  IconArrowUp,
  IconReportAnalytics,
  IconCalendarTime,
  IconClipboardCheck,
  IconLogin,
  IconBallFootball,
} from '@tabler/icons-react';
import { modules, can, moduleByKey, type ModuleKey } from '@/config/modules';
import type { SessionUser } from '@/lib/auth';
import {
  subscribeAcademicContext,
  type AcademicContextUpdate,
} from '@/lib/academic-context-client';
import styles from './cms-shell.module.css';
const icons = {
  users: IconUsers,
  roles: IconShieldCheck,
  audit: IconHistory,
  school: IconSchool,
  'academic-years': IconCalendarEvent,
  semesters: IconSchoolBell,
  classes: IconUsersGroup,
  grades: IconHierarchy,
  subjects: IconBooks,
  extracurriculars: IconLayersIntersect,
  teachers: IconUsers,
  'teaching-assignments': IconSchoolBell,
  'homeroom-assignments': IconHome2,
  'extracurricular-assignments': IconCalendarTime,
  students: IconUsersGroup,
  promotions: IconArrowUp,
  schedules: IconCalendarTime,
  'student-attendance': IconClipboardCheck,
  'student-checkins': IconLogin,
  'extracurricular-attendance': IconBallFootball,
  'academic-reports': IconReportAnalytics,
};
const navigationGroups: Array<{ label: string; keys: ModuleKey[] }> = [
  {
    label: 'Data Sekolah',
    keys: ['students', 'teachers', 'grades', 'subjects', 'extracurriculars'],
  },
  {
    label: 'Akademik',
    keys: [
      'academic-years',
      'semesters',
      'classes',
      'homeroom-assignments',
      'teaching-assignments',
      'extracurricular-assignments',
    ],
  },
  { label: 'Laporan', keys: ['academic-reports'] },
  { label: 'Administrasi', keys: ['users', 'roles', 'audit'] },
  { label: 'Pengaturan', keys: ['school'] },
];

export function CmsShell({
  user,
  academicContext,
  children,
}: {
  user: SessionUser;
  academicContext?: { academic_year: string | null; semester: string | null };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [currentAcademicContext, setCurrentAcademicContext] = useState(academicContext);

  useEffect(
    () =>
      subscribeAcademicContext((update: AcademicContextUpdate) => {
        setCurrentAcademicContext((current) => ({
          academic_year:
            update.academic_year === undefined
              ? (current?.academic_year ?? null)
              : update.academic_year,
          semester: update.semester === undefined ? (current?.semester ?? null) : update.semester,
        }));
      }),
    [],
  );
  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error();
      notifications.show({
        title: 'Berhasil keluar',
        message: 'Sesi Anda telah berakhir.',
        color: 'green',
      });
      router.replace('/login');
      router.refresh();
    } catch {
      notifications.show({
        title: 'Gagal keluar',
        message: 'Silakan coba kembali.',
        color: 'red',
      });
    }
  }
  const activeModule = modules.find((m) => m.path === path);
  return (
    <AppShell
      className={styles.root}
      layout="alt"
      header={{ height: { base: 70, sm: 81 } }}
      navbar={{
        width: { base: 228, xl: 258 },
        breakpoint: '780px',
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      <AppShell.Navbar px={{ base: 20, md: 15, xl: 20 }} pt={32} pb={18}>
        <Text component={Link} href="/" className={styles.brand}>
          <ThemeIcon className={styles.brandIcon} size={34} radius={10}>
            <IconLayersIntersect />
          </ThemeIcon>
          Cendekia
          <Text component="span" className={styles.brandLight}>
            Hub
          </Text>
        </Text>
        <Paper className={styles.workspaceCard} withBorder>
          <ThemeIcon className={styles.workspaceAvatar} variant="light" size={38} radius={8}>
            <IconCalendarEvent size={20} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text variant="eyebrow" fz={8}>
              TAHUN AKTIF
            </Text>
            <Text fw={700} size="xs">
              {currentAcademicContext?.academic_year || 'Belum ditentukan'}
            </Text>
            {currentAcademicContext?.semester && (
              <Text variant="caption">{currentAcademicContext.semester}</Text>
            )}
          </Stack>
        </Paper>
        <nav className={styles.navMenu} onClick={() => setOpened(false)}>
          <Text className={styles.navLabel} variant="eyebrow">
            UTAMA
          </Text>
          {can(user.permissions, 'dashboard.read') && (
            <NavLink
              component={Link}
              href="/"
              active={path === '/'}
              leftSection={<IconLayoutDashboard size={20} />}
              label="Ringkasan"
            />
          )}
          {modules
            .filter(
              (module) => module.group === 'Utama' && can(user.permissions, module.permission),
            )
            .map((module) => {
              const Icon = icons[module.key];
              return (
                <NavLink
                  component={Link}
                  key={module.key}
                  href={module.path}
                  active={path === module.path}
                  leftSection={<Icon size={20} />}
                  label={module.label}
                />
              );
            })}
          {navigationGroups.map((group) => {
            const visibleModules = group.keys
              .map((key) => moduleByKey[key])
              .filter((module) => can(user.permissions, module.permission));
            const showAccount = group.label === 'Pengaturan';
            if (!visibleModules.length && !showAccount) return null;
            return (
              <div key={group.label}>
                <Text className={styles.navLabel} variant="eyebrow">
                  {group.label.toUpperCase()}
                </Text>
                {visibleModules.map((module) => {
                  const Icon = icons[module.key];
                  return (
                    <NavLink
                      component={Link}
                      key={module.key}
                      href={module.path}
                      active={path === module.path}
                      leftSection={<Icon size={20} />}
                      label={module.label}
                    />
                  );
                })}
                {showAccount && (
                  <NavLink
                    component={Link}
                    href="/settings/account"
                    active={path === '/settings/account'}
                    leftSection={<IconSettings size={20} />}
                    label="Akun"
                  />
                )}
              </div>
            );
          })}
        </nav>
        <Group className={styles.sidebarFooter} gap={7} wrap="nowrap">
          <Box className={styles.statusDot} />
          <Text variant="caption">Sistem operasional</Text>
          <Text variant="caption" ml="auto">
            v0.1
          </Text>
        </Group>
      </AppShell.Navbar>
      {opened && (
        <UnstyledButton
          aria-label="Tutup navigasi"
          className={styles.sidebarBackdrop}
          onClick={() => setOpened(false)}
        />
      )}
      <AppShell.Header>
        <Group h="100%" px={{ base: 18, sm: 25, lg: 39 }} justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={() => setOpened(!opened)}
              size="sm"
              className={styles.mobileBurger}
              aria-label="Buka navigasi"
            />
            <Breadcrumbs separator="/" separatorMargin="md">
              <Anchor component={Link} href="/" size="xs" c="dimmed" underline="never">
                Workspace
              </Anchor>
              <Text size="xs" fw={500}>
                {activeModule?.label ||
                  (path === '/settings/account' ? 'Pengaturan Akun' : 'Ringkasan')}
              </Text>
            </Breadcrumbs>
          </Group>
          <Menu width={220} position="bottom-end">
            <Menu.Target>
              <UnstyledButton className={styles.profileButton}>
                <Avatar color="brand" radius="xl" size={35}>
                  {user.name.slice(0, 2).toUpperCase()}
                </Avatar>
                <Stack gap={2}>
                  <Text fw={700} size="xs">
                    {user.name}
                  </Text>
                  <Text variant="caption">{user.role}</Text>
                </Stack>
                <IconChevronDown size={15} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              <Menu.Item
                component={Link}
                href="/settings/account"
                leftSection={<IconSettings size={16} />}
              >
                Pengaturan Akun
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                Keluar
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Main className={styles.mainArea}>
        <Box
          component="main"
          px={{ base: 18, sm: 25, lg: 39 }}
          py={{ base: 26, sm: 28, lg: 35, xl: 45 }}
          maw={1600}
          w="100%"
          mx="auto"
          flex={1}
        >
          {children}
        </Box>
        <Group
          component="footer"
          className={styles.pageFooter}
          mx={{ base: 18, lg: 39 }}
          py={18}
          justify="space-between"
        >
          <Text size="xs" c="dimmed">
            © {new Date().getFullYear()} Cendekia Hub
          </Text>
          <Button
            component={Link}
            href="/settings/account"
            variant="subtle"
            color="gray"
            size="compact-xs"
            rightSection={<IconArrowUpRight size={13} />}
          >
            Workspace Anda, terkelola.
          </Button>
        </Group>
      </AppShell.Main>
    </AppShell>
  );
}
