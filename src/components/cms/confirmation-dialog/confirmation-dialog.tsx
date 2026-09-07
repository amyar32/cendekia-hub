'use client';

import { useRef } from 'react';
import { Button, Group, Modal, Stack, ThemeIcon, type MantineColor } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

/** Shared review step for destructive actions and bulk changes. */
export function ConfirmationDialog({
  opened,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Lanjutkan',
  loading = false,
  color = 'red',
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  color?: MantineColor;
}) {
  const submitting = useRef(false);
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!loading && !submitting.current) onClose();
      }}
      title={
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={color} variant="light" radius="md" size={36}>
            <IconAlertTriangle size={19} />
          </ThemeIcon>
          {title}
        </Group>
      }
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      <Stack gap="md">{children}</Stack>
      <Group justify="flex-end" mt="xl">
        <Button
          data-autofocus
          variant="default"
          disabled={loading}
          onClick={() => {
            if (!submitting.current) onClose();
          }}
        >
          Batal
        </Button>
        <Button
          color={color}
          loading={loading}
          onClick={async () => {
            if (loading || submitting.current) return;
            submitting.current = true;
            try {
              await onConfirm();
            } finally {
              submitting.current = false;
            }
          }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
