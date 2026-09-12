'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  FileInput,
  Group,
  Image,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconFile, IconSchool, IconSearch, IconUpload } from '@tabler/icons-react';
import 'dayjs/locale/id';

type Option = { value: string; label: string; full?: boolean };
type PublicData = {
  school: { name: string; logo_url: string; address: string; phone: string; email: string };
  periods: Option[];
  grades: Option[];
  captcha: { question: string; token: string };
};
type Result = { registration_number: string; tracking_token: string };
const trackingStorageKey = 'cendekia:last-admission-tracking';
const emptyForm = () => ({
  admission_period_id: '',
  nik: '',
  nisn: '',
  name: '',
  gender: '',
  birth_date: '',
  birth_place: '',
  address: '',
  phone: '',
  email: '',
  previous_school_name: '',
  previous_school_npsn: '',
  previous_school_address: '',
  previous_school_last_grade: '',
  previous_school_graduation_year: '',
  target_grade_id: '',
  admission_path: 'Reguler',
  guardian_name: '',
  guardian_nik: '',
  guardian_relation: 'Orang tua',
  guardian_phone: '',
  guardian_email: '',
  guardian_address: '',
  captcha_answer: '',
  website: '',
});
const publicStatus: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pendaftaran diterima',
  needs_revision: 'Perlu perbaikan',
  verified: 'Berkas terverifikasi',
  selection: 'Dalam seleksi',
  accepted: 'Diterima',
  waitlisted: 'Daftar cadangan',
  rejected: 'Tidak diterima',
  reregistered: 'Daftar ulang selesai',
  converted: 'Sudah menjadi murid',
};

export function AdmissionPublicForm() {
  const [data, setData] = useState<PublicData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [documentType, setDocumentType] = useState('Kartu Keluarga');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [tracking, setTracking] = useState('');
  const [tracked, setTracked] = useState<Record<string, string> | null>(null);

  function load() {
    fetch('/api/public/admissions')
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then(setData)
      .catch((error) =>
        notifications.show({
          color: 'red',
          title: 'Formulir gagal dimuat',
          message: error.message,
        }),
      );
  }
  useEffect(() => {
    load();
    try {
      const stored = JSON.parse(
        localStorage.getItem(trackingStorageKey) || 'null',
      ) as Result | null;
      if (
        stored &&
        typeof stored.registration_number === 'string' &&
        /^(?:\d{6}|[a-f0-9]{48})$/.test(stored.tracking_token)
      ) {
        queueMicrotask(() => {
          setResult(stored);
          setTracking(stored.tracking_token);
          setStep(3);
        });
      }
    } catch {
      localStorage.removeItem(trackingStorageKey);
    }
  }, []);

  function rememberTracking(value: Result) {
    localStorage.setItem(trackingStorageKey, JSON.stringify(value));
    setResult(value);
    setTracking(value.tracking_token);
  }

  function forgetTracking() {
    localStorage.removeItem(trackingStorageKey);
    setResult(null);
    setTracked(null);
    setTracking('');
    setStep(0);
  }
  async function submit() {
    if (!data) return;
    setSaving(true);
    try {
      const response = await fetch('/api/public/admissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          captcha_token: data.captcha.token,
          captcha_answer: Number(form.captcha_answer),
          guardians: [
            {
              name: form.guardian_name,
              nik: form.guardian_nik,
              relation: form.guardian_relation,
              phone: form.guardian_phone,
              email: form.guardian_email,
              address: form.guardian_address,
              is_primary: true,
            },
          ],
          documents: [],
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      rememberTracking(value);
      setStep(3);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Pendaftaran gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
      load();
    } finally {
      setSaving(false);
    }
  }
  async function uploadDocument() {
    if (!result || !documentFile) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.set('tracking_token', result.tracking_token);
      body.set('type', documentType);
      body.set('file', documentFile);
      const response = await fetch('/api/public/admissions/documents', { method: 'POST', body });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setUploaded((items) => [...items, documentType]);
      setDocumentFile(null);
      notifications.show({
        color: 'green',
        title: 'Dokumen tersimpan',
        message: `${documentType} berhasil diupload.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Upload gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }
  async function track() {
    setSaving(true);
    setTracked(null);
    try {
      const response = await fetch(
        `/api/public/admissions?tracking_token=${encodeURIComponent(tracking.trim())}`,
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setTracked(value.application);
      rememberTracking({
        registration_number: value.application.registration_number,
        tracking_token: tracking.trim(),
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Status tidak ditemukan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }
  if (!data)
    return (
      <Container size="sm" py={80}>
        <Group justify="center">
          <Loader />
          <Text>Memuat formulir…</Text>
        </Group>
      </Container>
    );
  const update = (key: keyof ReturnType<typeof emptyForm>, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Box mih="100vh" bg="var(--mantine-color-gray-0)" py={{ base: 24, sm: 48 }}>
      <Container size="md">
        <Stack gap="xl">
          <Group justify="space-between" align="flex-start">
            <Group wrap="nowrap">
              {data.school.logo_url ? (
                <Image src={data.school.logo_url} w={58} h={58} fit="contain" alt="Logo sekolah" />
              ) : (
                <ThemeIcon size={58} radius="md">
                  <IconSchool size={30} />
                </ThemeIcon>
              )}
              <Box>
                <Text size="xs" fw={700} c="blue">
                  PENERIMAAN MURID BARU
                </Text>
                <Title order={2}>{data.school.name}</Title>
                <Text c="dimmed" size="sm">
                  {data.school.address}
                </Text>
              </Box>
            </Group>
            <Button
              variant="subtle"
              leftSection={<IconSearch size={16} />}
              onClick={() =>
                document.getElementById('tracking')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Cek status
            </Button>
          </Group>
          {!data.periods.length && (
            <Alert color="yellow" title="Pendaftaran belum dibuka">
              Saat ini tidak ada periode penerimaan aktif. Silakan hubungi sekolah untuk informasi
              lebih lanjut.
            </Alert>
          )}
          <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }} shadow="xs">
            <Stepper
              active={step}
              onStepClick={(next) => !result && next < step && setStep(next)}
              allowNextStepsSelect={false}
            >
              <Stepper.Step label="Identitas" description="Data calon murid" />
              <Stepper.Step label="Wali" description="Kontak utama" />
              <Stepper.Step label="Konfirmasi" description="Periksa data" />
              <Stepper.Step label="Selesai" description="Nomor pendaftaran" />
            </Stepper>
            <Divider my="xl" />
            {step === 0 && (
              <Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    required
                    searchable
                    label="Periode pendaftaran"
                    placeholder="Pilih periode"
                    data={data.periods.filter((p) => !p.full)}
                    value={form.admission_period_id || null}
                    onChange={(v) => update('admission_period_id', v || '')}
                  />
                  <Select
                    required
                    searchable
                    label="Tingkat tujuan"
                    placeholder="Pilih tingkat"
                    data={data.grades}
                    value={form.target_grade_id || null}
                    onChange={(v) => update('target_grade_id', v || '')}
                  />
                  <TextInput
                    required
                    label="Nama lengkap"
                    value={form.name}
                    onChange={(e) => update('name', e.currentTarget.value)}
                  />
                  <Select
                    required
                    label="Jenis kelamin"
                    data={[
                      { value: 'male', label: 'Laki-laki' },
                      { value: 'female', label: 'Perempuan' },
                    ]}
                    value={form.gender || null}
                    onChange={(v) => update('gender', v || '')}
                  />
                  <TextInput
                    label="NIK"
                    inputMode="numeric"
                    maxLength={16}
                    value={form.nik}
                    onChange={(e) => update('nik', e.currentTarget.value.replace(/\D/g, ''))}
                  />
                  <TextInput
                    label="NISN"
                    value={form.nisn}
                    onChange={(e) => update('nisn', e.currentTarget.value)}
                  />
                  <TextInput
                    label="Tempat lahir"
                    value={form.birth_place}
                    onChange={(e) => update('birth_place', e.currentTarget.value)}
                  />
                  <DateInput
                    label="Tanggal lahir"
                    locale="id"
                    valueFormat="D MMMM YYYY"
                    value={form.birth_date}
                    onChange={(v) => update('birth_date', v || '')}
                  />
                  <TextInput
                    required
                    label="Nomor telepon"
                    value={form.phone}
                    onChange={(e) => update('phone', e.currentTarget.value)}
                  />
                  <TextInput
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update('email', e.currentTarget.value)}
                  />
                  <Select
                    required
                    label="Jalur penerimaan"
                    data={['Reguler', 'Prestasi', 'Afirmasi', 'Perpindahan orang tua']}
                    value={form.admission_path}
                    onChange={(v) => update('admission_path', v || 'Reguler')}
                  />
                  <TextInput
                    label="Asal sekolah"
                    value={form.previous_school_name}
                    onChange={(e) => update('previous_school_name', e.currentTarget.value)}
                  />
                </SimpleGrid>
                <Textarea
                  required
                  label="Alamat calon murid"
                  value={form.address}
                  onChange={(e) => update('address', e.currentTarget.value)}
                />
                <Group justify="flex-end">
                  <Button
                    disabled={
                      !data.periods.length ||
                      !form.admission_period_id ||
                      !form.target_grade_id ||
                      !form.name ||
                      !form.gender ||
                      !form.phone ||
                      !form.address
                    }
                    onClick={() => setStep(1)}
                  >
                    Lanjut
                  </Button>
                </Group>
              </Stack>
            )}
            {step === 1 && (
              <Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput
                    required
                    label="Nama orang tua / wali"
                    value={form.guardian_name}
                    onChange={(e) => update('guardian_name', e.currentTarget.value)}
                  />
                  <TextInput
                    required
                    label="Hubungan"
                    value={form.guardian_relation}
                    onChange={(e) => update('guardian_relation', e.currentTarget.value)}
                  />
                  <TextInput
                    label="NIK wali"
                    inputMode="numeric"
                    maxLength={16}
                    value={form.guardian_nik}
                    onChange={(e) =>
                      update('guardian_nik', e.currentTarget.value.replace(/\D/g, ''))
                    }
                  />
                  <TextInput
                    required
                    label="Nomor telepon wali"
                    value={form.guardian_phone}
                    onChange={(e) => update('guardian_phone', e.currentTarget.value)}
                  />
                  <TextInput
                    label="Email wali"
                    type="email"
                    value={form.guardian_email}
                    onChange={(e) => update('guardian_email', e.currentTarget.value)}
                  />
                </SimpleGrid>
                <Textarea
                  label="Alamat wali (bila berbeda)"
                  value={form.guardian_address}
                  onChange={(e) => update('guardian_address', e.currentTarget.value)}
                />
                <Group justify="space-between">
                  <Button variant="default" onClick={() => setStep(0)}>
                    Kembali
                  </Button>
                  <Button
                    disabled={
                      !form.guardian_name || !form.guardian_relation || !form.guardian_phone
                    }
                    onClick={() => setStep(2)}
                  >
                    Lanjut
                  </Button>
                </Group>
              </Stack>
            )}
            {step === 2 && (
              <Stack>
                <Alert color="blue" title="Periksa sebelum mengirim">
                  Data akan masuk ke antrean verifikasi sekolah. Simpan nomor pelacakan yang
                  diberikan setelah pendaftaran berhasil.
                </Alert>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Paper withBorder p="md">
                    <Text size="xs" c="dimmed">
                      CALON MURID
                    </Text>
                    <Text fw={700}>{form.name}</Text>
                    <Text size="sm">
                      {data.grades.find((g) => g.value === form.target_grade_id)?.label} ·{' '}
                      {form.admission_path}
                    </Text>
                  </Paper>
                  <Paper withBorder p="md">
                    <Text size="xs" c="dimmed">
                      WALI UTAMA
                    </Text>
                    <Text fw={700}>{form.guardian_name}</Text>
                    <Text size="sm">
                      {form.guardian_relation} · {form.guardian_phone}
                    </Text>
                  </Paper>
                </SimpleGrid>
                <TextInput
                  label={`Verifikasi: ${data.captcha.question}`}
                  required
                  inputMode="numeric"
                  value={form.captcha_answer}
                  onChange={(e) => update('captcha_answer', e.currentTarget.value)}
                />
                <TextInput
                  aria-label="Website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => update('website', e.currentTarget.value)}
                  style={{ position: 'absolute', left: '-10000px' }}
                />
                <Group justify="space-between">
                  <Button variant="default" onClick={() => setStep(1)}>
                    Kembali
                  </Button>
                  <Button loading={saving} disabled={!form.captcha_answer} onClick={submit}>
                    Kirim pendaftaran
                  </Button>
                </Group>
              </Stack>
            )}
            {step === 3 && result && (
              <Stack align="stretch">
                <Group justify="center">
                  <ThemeIcon color="green" size={64} radius="xl">
                    <IconCheck size={34} />
                  </ThemeIcon>
                </Group>
                <Title ta="center" order={3}>
                  Pendaftaran berhasil dikirim
                </Title>
                <Paper bg="green.0" p="lg" radius="md" ta="center">
                  <Text size="xs" c="dimmed">
                    NOMOR PENDAFTARAN
                  </Text>
                  <Text fw={800} size="xl">
                    {result.registration_number}
                  </Text>
                  <Text size="xs" c="dimmed" mt="md">
                    TOKEN PELACAKAN 6 DIGIT
                  </Text>
                  <Text ff="monospace" style={{ wordBreak: 'break-all' }}>
                    {result.tracking_token}
                  </Text>
                  <Text size="xs" c="green" mt="sm">
                    Token tersimpan otomatis di browser ini dan tetap tersedia setelah refresh.
                  </Text>
                </Paper>
                <Divider label="Upload dokumen pendukung (opsional)" />
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label="Jenis dokumen"
                    data={[
                      'Kartu Keluarga',
                      'Akta Kelahiran',
                      'KTP Wali',
                      'Ijazah / SKL',
                      'KIP / PKH / KKS',
                      'Sertifikat Prestasi',
                      'Lainnya',
                    ]}
                    value={documentType}
                    onChange={(v) => setDocumentType(v || 'Lainnya')}
                  />
                  <FileInput
                    label="File PDF / gambar"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    clearable
                    value={documentFile}
                    onChange={setDocumentFile}
                    leftSection={<IconFile size={16} />}
                  />
                </SimpleGrid>
                <Button
                  variant="light"
                  leftSection={<IconUpload size={16} />}
                  loading={saving}
                  disabled={!documentFile}
                  onClick={uploadDocument}
                >
                  Upload dokumen
                </Button>
                {uploaded.map((item, index) => (
                  <Text key={`${item}-${index}`} c="green" size="sm">
                    ✓ {item} berhasil diupload
                  </Text>
                ))}
              </Stack>
            )}
          </Paper>
          <Paper id="tracking" withBorder radius="lg" p={{ base: 'md', sm: 'xl' }}>
            <Title order={3}>Cek status pendaftaran</Title>
            <Text c="dimmed" size="sm" mb="md">
              Token terakhir tersimpan otomatis di browser ini. Pada perangkat bersama, hapus token
              setelah selesai.
            </Text>
            <Group align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                label="Token pelacakan 6 digit"
                maxLength={48}
                value={tracking}
                onChange={(e) => setTracking(e.currentTarget.value.trim())}
              />
              <Button
                loading={saving}
                disabled={!/^(?:\d{6}|[a-f0-9]{48})$/.test(tracking)}
                onClick={track}
                leftSection={<IconSearch size={16} />}
              >
                Cek status
              </Button>
              {tracking && (
                <Button variant="subtle" color="gray" onClick={forgetTracking}>
                  Hapus dari browser
                </Button>
              )}
            </Group>
            {tracked && (
              <Alert mt="lg" color="blue" title={tracked.registration_number}>
                <Text fw={700}>{tracked.name}</Text>
                <Badge my="xs">{publicStatus[tracked.status] || tracked.status}</Badge>
                <Text size="sm">
                  {tracked.period_name} · {tracked.target_grade_name}
                </Text>
                {(tracked.verification_notes || tracked.decision_notes) && (
                  <Text size="sm" mt="xs">
                    Catatan sekolah: {tracked.decision_notes || tracked.verification_notes}
                  </Text>
                )}
              </Alert>
            )}
          </Paper>
          <Text ta="center" size="xs" c="dimmed">
            Butuh bantuan?{' '}
            {data.school.phone && (
              <Anchor href={`tel:${data.school.phone}`}>{data.school.phone}</Anchor>
            )}{' '}
            {data.school.email && (
              <>
                {' '}
                · <Anchor href={`mailto:${data.school.email}`}>{data.school.email}</Anchor>
              </>
            )}
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}
