'use client';

import { useId, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleCheckFilled,
  IconExternalLink,
  IconFile,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import type { UploadScope } from '@/lib/uploads';
import styles from './file-uploader.module.css';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export function FileUploader({
  label,
  description,
  scope,
  value,
  onChange,
  uploadFile,
  disabled = false,
}: {
  label: string;
  description?: string;
  scope: UploadScope;
  value: string;
  onChange: (url: string) => void;
  uploadFile?: (file: File) => Promise<string>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const inactive = disabled || uploading;

  async function upload(file: File | null) {
    if (!file || inactive) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
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
      let url: string;
      if (uploadFile) url = await uploadFile(file);
      else {
        const body = new FormData();
        body.set('scope', scope);
        body.set('file', file);
        const response = await fetch('/api/uploads', { method: 'POST', body });
        const result = (await response.json()) as { upload?: { url: string }; error?: string };
        if (!response.ok || !result.upload) throw new Error(result.error || 'Upload gagal.');
        url = result.upload.url;
      }
      onChange(url);
      setFileName(file.name);
      notifications.show({
        color: 'green',
        title: uploadFile ? 'File siap digunakan' : 'File selesai diupload',
        message: uploadFile
          ? 'File siap disertakan dalam formulir.'
          : 'Simpan formulir untuk menggunakan file ini.',
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
              <IconFile size={38} stroke={1.55} />
              {uploading && (
                <div className={styles.loadingOverlay}>
                  <Loader size="sm" />
                </div>
              )}
            </div>

            <Stack gap={10} className={styles.previewCopy}>
              <div>
                <Group gap={6} mb={4} wrap="nowrap">
                  <IconCircleCheckFilled size={16} className={styles.successIcon} />
                  <Text size="sm" fw={600} lineClamp={1}>
                    {fileName || 'File siap digunakan'}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" lh={1.55}>
                  Klik area ini atau tarik file baru untuk mengganti file.
                </Text>
              </div>

              <Group gap="xs">
                <Button
                  component="a"
                  href={value}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  variant="light"
                  leftSection={<IconExternalLink size={15} />}
                  onClick={(event) => event.stopPropagation()}
                >
                  Lihat file
                </Button>
                {!disabled && (
                  <>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconUpload size={15} />}
                      loading={uploading}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPicker();
                      }}
                    >
                      Ganti file
                    </Button>
                    <ActionIcon
                      size={30}
                      variant="subtle"
                      color="red"
                      aria-label={`Hapus ${label.toLowerCase()}`}
                      disabled={uploading}
                      onClick={(event) => {
                        event.stopPropagation();
                        setFileName('');
                        onChange('');
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </>
                )}
              </Group>
            </Stack>
          </Group>
        ) : (
          <Stack align="center" gap={8} className={styles.emptyState}>
            <div className={styles.uploadIcon}>
              {uploading ? <Loader size="sm" /> : <IconUpload size={28} stroke={1.7} />}
            </div>
            <div>
              <Text ta="center" size="sm" fw={600}>
                {uploading ? 'Mengupload file…' : 'Tarik dan lepas file di sini'}
              </Text>
              <Text ta="center" size="xs" c="dimmed" mt={3}>
                atau klik untuk memilih dari perangkat
              </Text>
            </div>
            <Text className={styles.fileHint}>PDF, PNG, JPEG, WEBP · MAKS. 10 MB</Text>
          </Stack>
        )}
      </div>
    </Stack>
  );
}
