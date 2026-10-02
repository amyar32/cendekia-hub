import type { ReactNode } from 'react';
import { Paper, Text, Title } from '@mantine/core';
import styles from '@/features/reports/components/report-common.module.css';

export function ReportSummaryCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
  color: string;
}) {
  return (
    <Paper withBorder className={styles.summaryCard}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <div className={styles.summaryValue}>{value}</div>
    </Paper>
  );
}

export function ReportPanelHeader({
  title,
  description,
  aside,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.panelHeader}>
      <div>
        <Title order={3}>{title}</Title>
        <Text variant="caption" mt={4}>
          {description}
        </Text>
      </div>
      {aside}
    </div>
  );
}
