'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
  IconFolder,
  IconLogout,
  IconChevronDown,
  IconSettings,
  IconSchool,
  IconArrowUpRight,
  IconCalendarEvent,
} from '@tabler/icons-react';
import { modules, can } from '@/config/modules';
import type { SessionUser } from '@/lib/auth';
import styles from './cms-shell.module.css';
const icons = {
  users: IconUsers,
  roles: IconShieldCheck,
  audit: IconHistory,
  categories: IconFolder,
  school: IconSchool,
  'academic-years': IconCalendarEvent,
};

const upcomingAcademicMenus = ['Semester', 'Tingkat / Kelas', 'Rombel', 'Mata Pelajaran'];
export function CmsShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
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
          <ThemeIcon className={styles.workspaceAvatar} variant="default" size={34} radius={7}>
            C
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={700} size="xs">
              Workspace utama
            </Text>
            <Text variant="caption" fz={9}>
              Content management system
            </Text>
          </Stack>
          <IconChevronDown size={15} />
        </Paper>
        <nav onClick={() => setOpened(false)}>
          <Text className={styles.navLabel} variant="eyebrow">
            WORKSPACE
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
          {modules.some(
            (module) => module.group === 'Akademik' && can(user.permissions, module.permission),
          ) && (
            <div>
              <Text className={styles.navLabel} variant="eyebrow">
                AKADEMIK
              </Text>
              {modules
                .filter(
                  (module) =>
                    module.group === 'Akademik' && can(user.permissions, module.permission),
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
              {upcomingAcademicMenus.map((label) => (
                <NavLink key={label} label={label} disabled />
              ))}
            </div>
          )}
          {['Master data', 'Administrasi'].map((group) => (
            <div key={group}>
              {modules.some((m) => m.group === group && can(user.permissions, m.permission)) && (
                <Text className={styles.navLabel} variant="eyebrow">
                  {group.toUpperCase()}
                </Text>
              )}
              {modules
                .filter((m) => m.group === group && can(user.permissions, m.permission))
                .map((m) => {
                  const Icon = icons[m.key];
                  return (
                    <NavLink
                      component={Link}
                      key={m.key}
                      href={m.path}
                      active={path === m.path}
                      leftSection={<Icon size={20} />}
                      label={m.label}
                    />
                  );
                })}
            </div>
          ))}
          <Text className={styles.navLabel} variant="eyebrow">
            PREFERENSI
          </Text>
          {modules
            .filter((m) => m.group === 'Preferensi' && can(user.permissions, m.permission))
            .map((m) => {
              const Icon = icons[m.key];
              return (
                <NavLink
                  component={Link}
                  key={m.key}
                  href={m.path}
                  active={path === m.path}
                  leftSection={<Icon size={20} />}
                  label={m.label}
                />
              );
            })}
          <NavLink
            component={Link}
            href="/settings/account"
            active={path === '/settings/account'}
            leftSection={<IconSettings size={20} />}
            label="Pengaturan Akun"
          />
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
