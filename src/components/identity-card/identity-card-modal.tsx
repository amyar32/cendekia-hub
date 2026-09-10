'use client';

import { useEffect, useState } from 'react';
import { IdentityCard } from './identity-card';
import { Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
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
  blood_type: string;
  address: string;
  card_expires_at?: string | null;
  employee_code?: string;
  nip?: string;
  school_name: string;
  logo_url: string;
  school_npsn: string;
  school_phone: string;
  school_email: string;
  school_address: string;
  principal_name: string;
  principal_nip: string;
  principal_signature_url: string;
  qr_value: string;
};

const birthDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const expiryDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatBirth(card: Card) {
  const date = card.birth_date
    ? birthDateFormatter.format(new Date(`${card.birth_date}T00:00:00Z`))
    : '';
  return [card.birth_place, date].filter(Boolean).join(', ') || '—';
}

function formatExpiry(value?: string | null) {
  return value
    ? `Berlaku: ${expiryDateFormatter.format(new Date(`${value}T00:00:00Z`))}`
    : 'Berlaku: —';
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
          margin: 4,
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
              <IdentityCard
                card={card}
                personType={personType}
                qr={qr}
                photoCaption={isTeacher ? undefined : formatExpiry(card.card_expires_at)}
                fields={[
                  {
                    label: isTeacher ? 'Kode Guru' : 'NIS',
                    value: isTeacher ? card.employee_code || '' : card.nis,
                  },
                  {
                    label: isTeacher ? 'NIP/NUPTK' : 'NISN',
                    value: isTeacher ? card.nip || '' : card.nisn,
                  },
                  { label: isTeacher ? 'Lahir' : 'TTL', value: formatBirth(card) },
                  { label: 'G.Darah', value: card.blood_type },
                  {
                    label: 'Alamat',
                    value: card.address,
                  },
                ]}
              />
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
