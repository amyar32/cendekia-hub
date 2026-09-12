'use client';

import { useId, useRef, useState } from 'react';
import { ActionIcon, Avatar, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleCheckFilled,
  IconCloudUpload,
  IconPhoto,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import type { UploadScope } from '@/lib/uploads';
import styles from './image-uploader.module.css';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
type UploadResponse = {
  upload?: { url: string };
  error?: string;
};

export function ImageUploader({
  label,
  description,
  scope,
  value,
  onChange,
  uploadFile,
  disabled = false,
  maxSizeMb = 5,
}: {
  label: string;
  description?: string;
  scope: UploadScope;
  value: string;
  onChange: (url: string) => void;
  /** Overrides the default authenticated upload endpoint when the caller owns the upload flow. */
  uploadFile?: (file: File) => Promise<string>;
  disabled?: boolean;
  maxSizeMb?: number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inactive = disabled || uploading;

  function rejectFile(message: string) {
    notifications.show({ color: 'red', title: 'File tidak dapat digunakan', message });
  }

  async function upload(file: File | null) {
    if (!file || inactive) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      rejectFile('Pilih gambar dengan format PNG, JPEG, atau WebP.');
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      rejectFile(`Ukuran gambar maksimal ${maxSizeMb} MB.`);
      return;
    }

    setUploading(true);
    try {
      let url: string;
      if (uploadFile) url = await uploadFile(file);
      else {
        const body = new FormData();
        body.set('scope', scope);
        body.set('file', file);
        const response = await fetch('/api/uploads', { method: 'POST', body });
        const result = (await response.json()) as UploadResponse;
        if (!response.ok || !result.upload) {
          throw new Error(result.error || 'Gagal mengupload gambar.');
        }
        url = result.upload.url;
      }
      onChange(url);
      notifications.show({
        color: 'green',
        title: uploadFile ? 'Gambar siap digunakan' : 'Gambar selesai diupload',
        message: uploadFile
          ? 'Gambar siap disertakan dalam formulir.'
          : 'Simpan formulir untuk menggunakan gambar ini.',
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

  function openPicker() {
    if (!inactive) inputRef.current?.click();
  }

  function leaveDrag() {
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  return (
    <Stack gap={10}>
      <div>
        <Text component="label" htmlFor={inputId} size="sm" fw={500}>
          {label}
        </Text>
        {description && (
          <Text size="xs" c="dimmed" mt={2}>
            {description}
          </Text>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className={styles.input}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        disabled={inactive}
        onChange={(event) => {
          void upload(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
      />

      <div
        className={styles.dropZone}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        role={value ? undefined : 'button'}
        tabIndex={inactive || value ? -1 : 0}
        aria-label={value ? undefined : `Upload ${label.toLowerCase()}`}
        aria-disabled={inactive}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (inactive) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          leaveDrag();
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void upload(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        {value ? (
          <Group wrap="nowrap" gap="lg" className={styles.previewLayout}>
            <div className={styles.previewFrame}>
              <Avatar
                src={value}
                size={104}
                radius="md"
                color="gray"
                alt={`Preview ${label.toLowerCase()}`}
                styles={{ image: { objectFit: 'contain' } }}
              >
                <IconPhoto size={34} />
              </Avatar>
              {uploading && (
                <div className={styles.loadingOverlay}>
                  <Loader size="sm" />
                </div>
              )}
            </div>
            <Stack gap={10} className={styles.previewCopy}>
              <div>
                <Group gap={6} mb={4}>
                  <IconCircleCheckFilled size={16} className={styles.successIcon} />
                  <Text size="sm" fw={600}>
                    Gambar siap digunakan
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" lh={1.55}>
                  Klik area ini atau tarik file baru untuk mengganti gambar.
                </Text>
              </div>
              {!disabled && (
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconUpload size={15} />}
                    loading={uploading}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPicker();
                    }}
                  >
                    Ganti gambar
                  </Button>
                  <ActionIcon
                    size={30}
                    variant="subtle"
                    color="red"
                    aria-label={`Hapus ${label.toLowerCase()}`}
                    disabled={uploading}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange('');
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Stack>
          </Group>
        ) : (
          <Stack align="center" gap={8} className={styles.emptyState}>
            <div className={styles.uploadIcon}>
              {uploading ? <Loader size="sm" /> : <IconCloudUpload size={28} stroke={1.7} />}
            </div>
            <div>
              <Text ta="center" size="sm" fw={600}>
                {uploading ? 'Mengupload gambar…' : 'Tarik dan lepas gambar di sini'}
              </Text>
              <Text ta="center" size="xs" c="dimmed" mt={3}>
                atau klik untuk memilih dari perangkat
              </Text>
            </div>
            <Text className={styles.fileHint}>PNG, JPEG, WEBP · MAKS. {maxSizeMb} MB</Text>
          </Stack>
        )}
      </div>
    </Stack>
  );
}
