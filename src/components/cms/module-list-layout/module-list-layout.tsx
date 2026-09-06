'use client';

import type { ReactNode } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Pagination,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconDatabaseOff, IconLock, IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './module-list-layout.module.css';

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  search: string;
  loading: boolean;
  error: string;
  onReload: () => void;
  addLabel?: string;
  onAdd?: () => void;
  emptyMessage?: string;
  note: string;
  children: ReactNode;
};

export function ModuleListLayout(props: Props) {
  const hasRows = props.total > 0;

  return (
    <>
      <PageHeading
        eyebrow={props.eyebrow}
        title={props.title}
        description={props.description}
        action={
          props.onAdd && (
            <Button leftSection={<IconPlus size={18} />} onClick={props.onAdd}>
              {props.addLabel}
            </Button>
          )
        }
      />
      <Paper component="section" className={styles.panel} withBorder>
        <div className={styles.toolbar}>
          <Stack gap={5}>
            <Title order={3}>
              Semua {props.title.toLowerCase()}
              <Badge variant="light" color="gray" ml={8}>
                {props.total}
              </Badge>
            </Title>
            <Text variant="caption">
              {props.emptyMessage || 'Kelola dan temukan data workspace Anda.'}
            </Text>
          </Stack>
          <Group gap="xs">
            <TextInput
              aria-label="Cari data"
              placeholder="Cari data..."
              leftSection={<IconSearch size={17} />}
              value={props.query}
              onChange={(event) => props.onQueryChange(event.currentTarget.value)}
            />
            <Tooltip label="Muat ulang">
              <ActionIcon
                variant="default"
                size="lg"
                aria-label="Muat ulang"
                onClick={props.onReload}
              >
                <IconRefresh size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
        {props.error ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <div className={styles.emptyIcon}>
              <IconDatabaseOff size={32} />
            </div>
            <Title order={3}>Data gagal dimuat</Title>
            <Text variant="description">{props.error}</Text>
            <Button variant="light" color="red" size="xs" onClick={props.onReload}>
              Coba lagi
            </Button>
          </Stack>
        ) : props.loading ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <Loader size="sm" />
            <Text variant="description">Memuat data...</Text>
          </Stack>
        ) : !hasRows ? (
          <Stack className={styles.emptyState} align="center" gap="md">
            <div className={styles.emptyIcon}>
              <IconDatabaseOff size={32} />
            </div>
            <Title order={3}>{props.search ? 'Data tidak ditemukan' : 'Belum ada data'}</Title>
            <Text variant="description">
              {props.search
                ? 'Coba gunakan kata kunci lain.'
                : 'Data yang ditambahkan akan muncul di sini.'}
            </Text>
            {props.onAdd && !props.search && (
              <Button variant="light" leftSection={<IconPlus size={16} />} onClick={props.onAdd}>
                Tambah data pertama
              </Button>
            )}
          </Stack>
        ) : (
          props.children
        )}
        <div className={styles.footer}>
          <Text variant="label">
            {props.total
              ? `${(props.page - 1) * 10 + 1}–${Math.min(props.page * 10, props.total)} dari ${props.total} data`
              : '0 data'}
          </Text>
          <Pagination
            total={Math.max(1, Math.ceil(props.total / 10))}
            value={props.page}
            onChange={props.onPageChange}
            size="sm"
          />
        </div>
      </Paper>
      <Text className={styles.note} variant="caption">
        <IconLock size={14} />
        {props.note}
      </Text>
    </>
  );
}
