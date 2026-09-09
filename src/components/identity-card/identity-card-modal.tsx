'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Avatar, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPrinter, IconRefresh } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { ConfirmationDialog } from '@/components/cms/confirmation-dialog/confirmation-dialog';
import styles from './identity-card-modal.module.css';

type Card = {
  id: string;
  nis: string;
  nisn: string;
  name: string;
  photo_url: string;
  birth_place: string;
  birth_date: string | null;
  address: string;
  employee_code?: string;
  nip?: string;
  employment_status?: string;
  school_name: string;
  logo_url: string;
  qr_value: string;
};

const birthDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatBirth(card: Card) {
  const date = card.birth_date
    ? birthDateFormatter.format(new Date(`${card.birth_date}T00:00:00Z`))
    : '';
  return [card.birth_place, date].filter(Boolean).join(', ') || '—';
}

export type IdentityCardType = 'student' | 'teacher';

export type IdentityCardModalProps = {
  personId: string | null;
  personType: IdentityCardType;
  writable: boolean;
  onClose: () => void;
};

/** A reusable identity-card preview for people who can check in with a QR code. */
export function IdentityCardModal({
  personId,
  personType,
  writable,
  onClose,
}: IdentityCardModalProps) {
  const isTeacher = personType === 'teacher';
  const [card, setCard] = useState<Card | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function load(method: 'GET' | 'POST' = 'GET') {
    if (!personId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/modules/${isTeacher ? 'teachers' : 'students'}/${personId}/card`,
        { method },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCard(result);
      setQr(
        await QRCode.toDataURL(result.qr_value, {
          width: 560,
          margin: 1,
          errorCorrectionLevel: 'M',
        }),
      );
      if (method === 'POST')
        notifications.show({
          color: 'green',
          title: 'QR diperbarui',
          message: 'Kartu lama sudah tidak dapat digunakan.',
        });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Kartu gagal dimuat',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
      if (method === 'GET') onClose();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (personId) void Promise.resolve().then(() => load());
    // load is intentionally scoped to the selected person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  return (
    <>
      <Modal
        opened={Boolean(personId)}
        onClose={onClose}
        title={`Kartu ${isTeacher ? 'guru' : 'siswa'}`}
        centered
        size="xl"
      >
        {loading && !card ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : card ? (
          <Stack>
            <div className={styles.printArea}>
              <div className={styles.card}>
                <div className={styles.decorativeOrb} />
                <div className={styles.header}>
                  <div className={styles.brandBlock}>
                    {card.logo_url ? (
                      <Image
                        src={card.logo_url}
                        alt="Logo sekolah"
                        width={52}
                        height={52}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.logoFallback}>CH</div>
                    )}
                    <div>
                      <Text className={styles.school}>{card.school_name}</Text>
                      <Text className={styles.schoolCaption}>
                        CENDEKIA HUB · {isTeacher ? 'TEACHER' : 'STUDENT'} SERVICES
                      </Text>
                    </div>
                  </div>
                  <Text className={styles.cardLabel}>KARTU {isTeacher ? 'GURU' : 'SISWA'}</Text>
                </div>
                <div className={styles.content}>
                  <div className={styles.photoColumn}>
                    <Avatar
                      src={card.photo_url}
                      alt={`Foto ${card.name}`}
                      size={128}
                      radius={18}
                      className={styles.photo}
                    />
                    <Text className={styles.activeBadge}>{isTeacher ? 'GURU' : 'SISWA'} AKTIF</Text>
                  </div>
                  <div className={styles.identity}>
                    <Text className={styles.name}>{card.name}</Text>
                    <div className={styles.dataGrid}>
                      <div>
                        <span>{isTeacher ? 'KODE' : 'NIS'}</span>
                        <strong>{isTeacher ? card.employee_code : card.nis}</strong>
                      </div>
                      <div>
                        <span>{isTeacher ? 'NIP' : 'NISN'}</span>
                        <strong>{isTeacher ? card.nip || '—' : card.nisn || '—'}</strong>
                      </div>
                      <div>
                        <span>{isTeacher ? 'LAHIR' : 'TTL'}</span>
                        <strong>{formatBirth(card)}</strong>
                      </div>
                      <div className={styles.address}>
                        <span>Alamat</span>
                        <strong>{card.address || '—'}</strong>
                      </div>
                    </div>
                  </div>
                  <div className={styles.qrWrap}>
                    {qr ? (
                      <Image
                        src={qr}
                        alt={`QR cek-in ${isTeacher ? 'guru' : 'siswa'}`}
                        width={116}
                        height={116}
                        unoptimized
                      />
                    ) : (
                      <Loader size="sm" />
                    )}
                    <Text>PINDAI UNTUK CEK-IN</Text>
                    <span>{isTeacher ? card.employee_code : card.nis}</span>
                  </div>
                </div>
                <div className={styles.footer}>
                  <span>KARTU IDENTITAS RESMI</span>
                  <p>
                    Kartu hanya berlaku untuk {isTeacher ? 'guru' : 'siswa'} yang namanya tercantum
                    dan tidak dapat dipindahtangankan.
                  </p>
                </div>
              </div>
            </div>
            <Group justify="space-between" className={styles.actions}>
              {writable ? (
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconRefresh size={17} />}
                  loading={loading}
                  onClick={() => setConfirmRotate(true)}
                >
                  Terbitkan QR baru
                </Button>
              ) : (
                <div />
              )}
              <Button
                leftSection={<IconPrinter size={17} />}
                onClick={() =>
                  window.open(
                    `/${isTeacher ? 'teacher-cards' : 'student-cards'}/${card.id}/print`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                Cetak kartu
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Menerbitkan QR baru akan menonaktifkan QR pada kartu sebelumnya.
            </Text>
          </Stack>
        ) : null}
      </Modal>
      <ConfirmationDialog
        opened={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title="Terbitkan QR baru?"
        confirmLabel="Ya, terbitkan QR"
        color="red"
        loading={loading}
        onConfirm={async () => {
          await load('POST');
          setConfirmRotate(false);
        }}
      >
        <Text size="sm">
          QR pada kartu <b>{card?.name}</b> yang lama akan langsung dinonaktifkan. Setelah itu,
          cetak dan gunakan kartu yang baru.
        </Text>
      </ConfirmationDialog>
    </>
  );
}
