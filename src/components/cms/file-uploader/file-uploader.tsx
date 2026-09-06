'use client';

import { useRef, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFile, IconTrash, IconUpload } from '@tabler/icons-react';
import type { UploadScope } from '@/lib/uploads';

export function FileUploader({
  label,
  description,
  scope,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  scope: UploadScope;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file?: File) {
    if (!file || disabled || uploading) return;
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notifications.show({
        color: 'red',
        title: 'File tidak dapat digunakan',
        message: 'Gunakan PDF, PNG, JPEG, atau WebP.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notifications.show({
        color: 'red',
        title: 'File terlalu besar',
        message: 'Ukuran file maksimal 10 MB.',
      });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set('scope', scope);
      body.set('file', file);
      const response = await fetch('/api/uploads', { method: 'POST', body });
      const result = (await response.json()) as { upload?: { url: string }; error?: string };
      if (!response.ok || !result.upload) throw new Error(result.error || 'Upload gagal.');
      onChange(result.upload.url);
      notifications.show({
        color: 'green',
        title: 'File selesai diupload',
        message: 'Simpan formulir untuk menggunakan file ini.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Upload gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack gap={8}>
      <div>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void upload(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <Group>
        <Button
          variant="default"
          loading={uploading}
          disabled={disabled}
          leftSection={<IconUpload size={16} />}
          onClick={() => input.current?.click()}
        >
          {value ? 'Ganti file' : 'Pilih file'}
        </Button>
        {value && (
          <>
            <Button
              component="a"
              href={value}
              target="_blank"
              variant="light"
              leftSection={<IconFile size={16} />}
            >
              Lihat file
            </Button>
            <Button
              variant="subtle"
              color="red"
              disabled={disabled || uploading}
              leftSection={<IconTrash size={16} />}
              onClick={() => onChange('')}
            >
              Hapus
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}
