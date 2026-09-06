'use client';

import { useState } from 'react';
import { ActionIcon, Badge, Code, Group, Modal, Table, Text } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { formatDate } from '@/lib/format';
import { ModuleListLayout } from '@/components/cms/module-list-layout/module-list-layout';
import { useModuleList } from '@/hooks/use-module-list';
import styles from './audit-list.module.css';

type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
  details: string;
};

export function AuditList() {
  const list = useModuleList<AuditRow>('/api/modules/audit');
  const [detail, setDetail] = useState<AuditRow | null>(null);

  return (
    <>
      <ModuleListLayout
        eyebrow="ADMINISTRASI"
        title="Audit trail"
        description="Telusuri aktivitas dan perubahan di workspace."
        total={list.total}
        page={list.page}
        onPageChange={list.setPage}
        query={list.query}
        onQueryChange={list.setQuery}
        search={list.search}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        emptyMessage="Riwayat aktivitas tersimpan otomatis dan hanya dapat dibaca."
        note="Audit trail bersifat append-only. Waktu ditampilkan dalam WIB."
      >
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>AKTOR</Table.Th>
                <Table.Th>AKTIVITAS</Table.Th>
                <Table.Th>MODUL</Table.Th>
                <Table.Th>WAKTU (WIB)</Table.Th>
                <Table.Th ta="right">AKSI</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.rows.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>
                    <Text fw={600} size="xs">
                      {entry.actor}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={
                        entry.action.includes('failed') || entry.action === 'delete'
                          ? 'red'
                          : 'brand'
                      }
                    >
                      {entry.action}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{entry.entity}</Table.Td>
                  <Table.Td c="dimmed">{formatDate(entry.created_at)}</Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end">
                      <ActionIcon
                        aria-label="Lihat detail"
                        variant="subtle"
                        color="gray"
                        onClick={() => setDetail(entry)}
                      >
                        <IconEye size={17} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </ModuleListLayout>

      <Modal
        opened={!!detail}
        onClose={() => setDetail(null)}
        title="Detail audit"
        centered
        size="lg"
      >
        <Code block className={styles.detailJson}>
          {JSON.stringify(
            detail ? { ...detail, details: JSON.parse(detail.details || '{}') } : {},
            null,
            2,
          )}
        </Code>
      </Modal>
    </>
  );
}
