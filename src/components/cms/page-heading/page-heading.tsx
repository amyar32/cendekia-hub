import type { ReactNode } from 'react';
import { Box, Group, Stack, Text, Title } from '@mantine/core';
import styles from './page-heading.module.css';

type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeading({ eyebrow, title, description, action }: PageHeadingProps) {
  return (
    <Group className={styles.root} justify="space-between" align="center" gap="xl">
      <Box>
        <Stack gap={7}>
          <Text variant="eyebrow">{eyebrow}</Text>
          <Title order={1}>{title}</Title>
          <Text variant="description">{description}</Text>
        </Stack>
      </Box>
      {action}
    </Group>
  );
}
