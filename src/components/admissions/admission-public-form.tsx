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
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DateInput, YearPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconArrowRight,
  IconCheck,
  IconClipboardCheck,
  IconFileText,
  IconHelpCircle,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSchool,
  IconSearch,
} from '@tabler/icons-react';
import 'dayjs/locale/id';
import { ImageUploader } from '@/components/cms/image-uploader/image-uploader';
import { FileUploader } from '@/components/cms/file-uploader/file-uploader';

type Option = { value: string; label: string; full?: boolean };
type RegionLevel = 'province' | 'regency' | 'district' | 'village';
type PublicData = {
  school: { name: string; logo_url: string; address: string; phone: string; email: string };
  periods: Option[];
  grades: Option[];
  captcha: { question: string; token: string };
};
type Result = { registration_number: string; tracking_token: string };
const emptyForm = () => ({
  admission_period_id: '',
  nik: '',
  nisn: '',
  name: '',
  gender: '',
  birth_date: '',
  birth_place: '',
  family_card_number: '',
  religion: '',
  citizenship: 'Indonesia',
  child_order: 0,
  sibling_count: 0,
  birth_certificate_number: '',
  has_special_needs: false,
  special_needs_type: '',
  province_code: '',
  province_name: '',
  regency_code: '',
  regency_name: '',
  district_code: '',
  district_name: '',
  village_code: '',
  village_name: '',
  rt: '',
  rw: '',
  postal_code: '',
  domicile_matches_family_card: false,
  latitude: '',
  longitude: '',
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
  guardian_relation: '',
  guardian_birth_place: '',
  guardian_birth_date: '',
  guardian_last_education: '',
  guardian_occupation: '',
  guardian_monthly_income: 0,
  guardian_phone: '',
  guardian_email: '',
  guardian_address: '',
  guardian_address_matches_student: false,
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
const applicationDocumentTypes = [
  { type: 'Kartu Keluarga', required: true },
  { type: 'Akta Kelahiran', required: true },
  { type: 'KTP Wali', required: true },
  { type: 'Ijazah / SKL', required: false },
  { type: 'KIP / PKH / KKS', required: false },
  { type: 'Sertifikat Prestasi', required: false },
  { type: 'Lainnya', required: false },
] as const;

function ReviewSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} radius="lg">
      <Text variant="eyebrow" mb="sm">
        {title}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {rows.map(([label, value]) => (
          <Box key={label}>
            <Text variant="caption">{label}</Text>
            <Text size="sm" fw={600} c="var(--app-color-text)" style={{ overflowWrap: 'anywhere' }}>
              {value || '—'}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

function AdmissionHelp({ phone, email }: Pick<PublicData['school'], 'phone' | 'email'>) {
  if (!phone && !email) return null;

  return (
    <Paper withBorder p="md" radius="lg" style={{ background: 'var(--app-color-subtle)' }}>
      <Group justify="center" gap="md" wrap="wrap">
        <ThemeIcon size={34} radius="md" variant="light" color="brand">
          <IconHelpCircle size={19} />
        </ThemeIcon>
        <Box>
          <Text fw={700} size="sm" c="var(--app-color-text)">
            Butuh bantuan?
          </Text>
          <Text variant="caption">Kami siap membantu.</Text>
        </Box>
        <Group gap="sm" wrap="wrap">
          {phone && (
            <Anchor href={`tel:${phone}`} c="var(--app-color-brand)" fw={600} size="sm">
              <Group gap={5} wrap="nowrap">
                <IconPhone size={15} />
                {phone}
              </Group>
            </Anchor>
          )}
          {email && (
            <Anchor href={`mailto:${email}`} c="var(--app-color-brand)" fw={600} size="sm">
              <Group gap={5} wrap="nowrap">
                <IconMail size={15} />
                {email}
              </Group>
            </Anchor>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

export function AdmissionPublicForm() {
  const [data, setData] = useState<PublicData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [applicationFiles, setApplicationFiles] = useState<Record<string, File | undefined>>({});
  const [applicationFileUrls, setApplicationFileUrls] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState('');
  const [tracked, setTracked] = useState<Record<string, string> | null>(null);
  const [view, setView] = useState<'landing' | 'apply' | 'track'>('landing');
  const [regionOptions, setRegionOptions] = useState<Record<RegionLevel, Option[]>>({
    province: [],
    regency: [],
    district: [],
    village: [],
  });
  const [loadingRegion, setLoadingRegion] = useState<RegionLevel | null>(null);

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
    void loadRegions('province');
  }, []);

  async function loadRegions(level: RegionLevel, parent = '') {
    setLoadingRegion(level);
    try {
      const response = await fetch(
        `/api/public/regions?level=${level}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`,
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setRegionOptions((current) => ({ ...current, [level]: value.regions }));
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Data wilayah gagal dimuat',
        message: error instanceof Error ? error.message : 'Coba lagi sebentar.',
      });
    } finally {
      setLoadingRegion(null);
    }
  }

  function selectRegion(level: RegionLevel, value: string | null) {
    const selected = regionOptions[level].find((item) => item.value === value);
    const codeKey = `${level}_code` as keyof ReturnType<typeof emptyForm>;
    const nameKey = `${level}_name` as keyof ReturnType<typeof emptyForm>;
    setForm((current) => {
      const next = { ...current, [codeKey]: value || '', [nameKey]: selected?.label || '' };
      if (level === 'province')
        Object.assign(next, {
          regency_code: '',
          regency_name: '',
          district_code: '',
          district_name: '',
          village_code: '',
          village_name: '',
        });
      if (level === 'regency')
        Object.assign(next, {
          district_code: '',
          district_name: '',
          village_code: '',
          village_name: '',
        });
      if (level === 'district') Object.assign(next, { village_code: '', village_name: '' });
      return next;
    });
    if (value) {
      const nextLevel: RegionLevel | undefined =
        level === 'province'
          ? 'regency'
          : level === 'regency'
            ? 'district'
            : level === 'district'
              ? 'village'
              : undefined;
      if (nextLevel) void loadRegions(nextLevel, value);
    }
  }

  function showRegistrationResult(value: Result) {
    setResult(value);
    setTracking(value.tracking_token);
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
              birth_place: form.guardian_birth_place,
              birth_date: form.guardian_birth_date,
              last_education: form.guardian_last_education,
              occupation: form.guardian_occupation,
              monthly_income: form.guardian_monthly_income,
              phone: form.guardian_phone,
              email: form.guardian_email,
              address: form.guardian_address_matches_student ? form.address : form.guardian_address,
              address_matches_student: form.guardian_address_matches_student,
              is_primary: true,
            },
          ],
          documents: [],
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      showRegistrationResult(value);
      if (photoFile) await uploadPhoto(value, photoFile);
      const failedDocuments: string[] = [];
      for (const { type } of applicationDocumentTypes) {
        const file = applicationFiles[type];
        if (!file) continue;
        try {
          await uploadApplicationDocument(value, type, file);
        } catch {
          failedDocuments.push(type);
        }
      }
      if (failedDocuments.length)
        notifications.show({
          color: 'yellow',
          title: 'Pendaftaran berhasil, sebagian dokumen belum terunggah',
          message: failedDocuments.join(', '),
        });
      setStep(6);
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
  async function uploadApplicationDocument(application: Result, type: string, file: File) {
    const body = new FormData();
    body.set('tracking_token', application.tracking_token);
    body.set('type', type);
    body.set('file', file);
    const response = await fetch('/api/public/admissions/documents', { method: 'POST', body });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
  }
  async function uploadPhoto(application: Result, file: File) {
    try {
      const body = new FormData();
      body.set('tracking_token', application.tracking_token);
      body.set('type', 'Foto Murid');
      body.set('kind', 'photo');
      body.set('file', file);
      const response = await fetch('/api/public/admissions/documents', { method: 'POST', body });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setPhotoFile(null);
      setPhotoPreviewUrl('');
    } catch (error) {
      notifications.show({
        color: 'yellow',
        title: 'Pendaftaran berhasil, foto belum terunggah',
        message:
          error instanceof Error ? error.message : 'Coba unggah foto lagi setelah pendaftaran.',
      });
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
  const update = <Key extends keyof ReturnType<typeof emptyForm>>(
    key: Key,
    value: ReturnType<typeof emptyForm>[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const latitudeNumber = Number(form.latitude);
  const longitudeNumber = Number(form.longitude);
  const invalidLatitude =
    form.latitude !== '' &&
    (!Number.isFinite(latitudeNumber) || latitudeNumber < -90 || latitudeNumber > 90);
  const invalidLongitude =
    form.longitude !== '' &&
    (!Number.isFinite(longitudeNumber) || longitudeNumber < -180 || longitudeNumber > 180);

  if (view === 'landing')
    return (
      <Box
        mih="100vh"
        py={{ base: 24, sm: 48 }}
        style={{
          background:
            'radial-gradient(circle at 90% 0%, var(--app-color-brand-soft), transparent 31rem), var(--app-color-background)',
        }}
      >
        <Container size="md">
          <Stack gap={48}>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                {data.school.logo_url ? (
                  <Image
                    src={data.school.logo_url}
                    w={46}
                    h={46}
                    fit="contain"
                    alt="Logo sekolah"
                  />
                ) : (
                  <ThemeIcon size={46} radius="md">
                    <IconSchool size={24} />
                  </ThemeIcon>
                )}
                <Box>
                  <Text variant="eyebrow">PENERIMAAN MURID BARU</Text>
                  <Text fw={700} c="var(--app-color-text)">
                    {data.school.name}
                  </Text>
                </Box>
              </Group>
              <Button variant="subtle" size="compact-md" onClick={() => setView('track')}>
                Cek status
              </Button>
            </Group>

            <Box ta="center" maw={680} mx="auto">
              <Badge color="brand" size="lg" mb="lg">
                Tahun ajaran baru dimulai di sini
              </Badge>
              <Title order={1} fz={{ base: 32, sm: 46 }} lh={1.12} c="var(--app-color-text)">
                Langkah pertama menuju
                <br /> sekolah pilihan.
              </Title>
              <Text variant="description" fz={{ base: 'sm', sm: 'md' }} mt="lg" maw={530} mx="auto">
                Daftarkan calon murid disini, atau pantau perkembangan pendaftaran yang sudah
                dikirim.
              </Text>
            </Box>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
              <Paper withBorder p={{ base: 'xl', sm: 32 }} radius="lg" shadow="sm">
                <ThemeIcon size={52} radius="md" variant="light" color="brand">
                  <IconFileText size={27} />
                </ThemeIcon>
                <Title order={2} fz={22} mt="xl">
                  Daftar sebagai murid baru
                </Title>
                <Text variant="description" mt="sm" mih={52}>
                  Isi data calon murid dan wali. Anda akan menerima nomor pendaftaran serta token
                  pelacakan.
                </Text>
                <Button
                  fullWidth
                  mt="xl"
                  rightSection={<IconArrowRight size={17} />}
                  disabled={!data.periods.length}
                  onClick={() => setView('apply')}
                >
                  Mulai pendaftaran
                </Button>
                {!data.periods.length && (
                  <Text variant="caption" ta="center" mt="sm">
                    Pendaftaran belum dibuka saat ini.
                  </Text>
                )}
              </Paper>
              <Paper
                withBorder
                p={{ base: 'xl', sm: 32 }}
                radius="lg"
                style={{ background: 'var(--app-color-subtle)' }}
              >
                <ThemeIcon size={52} radius="md" variant="white" color="brand">
                  <IconClipboardCheck size={27} />
                </ThemeIcon>
                <Title order={2} fz={22} mt="xl">
                  Cek status pendaftaran
                </Title>
                <Text variant="description" mt="sm" mih={52}>
                  Gunakan token pelacakan untuk melihat status verifikasi dan pesan terbaru dari
                  sekolah.
                </Text>
                <Button
                  fullWidth
                  mt="xl"
                  variant="default"
                  rightSection={<IconSearch size={17} />}
                  onClick={() => setView('track')}
                >
                  Cek status saya
                </Button>
              </Paper>
            </SimpleGrid>

            <Group justify="center" gap="xl">
              <Group gap={7}>
                <IconCheck size={16} color="var(--app-color-brand)" />
                <Text variant="caption">Proses singkat</Text>
              </Group>
              <Group gap={7}>
                <IconCheck size={16} color="var(--app-color-brand)" />
                <Text variant="caption">Status mudah dilacak</Text>
              </Group>
            </Group>
            <AdmissionHelp phone={data.school.phone} email={data.school.email} />
          </Stack>
        </Container>
      </Box>
    );
  return (
    <Box mih="100vh" bg="var(--app-color-background)" py={{ base: 24, sm: 48 }}>
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
                <Text variant="eyebrow">PENERIMAAN MURID BARU</Text>
                <Title order={2}>{data.school.name}</Title>
                <Text variant="description">{data.school.address}</Text>
              </Box>
            </Group>
            <Button variant="subtle" onClick={() => setView('landing')}>
              Beranda
            </Button>
          </Group>
          {view === 'apply' && !data.periods.length && (
            <Alert color="yellow" title="Pendaftaran belum dibuka">
              Saat ini tidak ada periode penerimaan aktif. Silakan hubungi sekolah untuk informasi
              lebih lanjut.
            </Alert>
          )}
          {view === 'apply' && (
            <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }} shadow="xs">
              <Stepper
                active={step}
                onStepClick={(next) => !result && next < step && setStep(next)}
                allowNextStepsSelect={false}
              >
                <Stepper.Step label="Identitas" description="Data calon murid" />
                <Stepper.Step label="Alamat" description="Domisili calon murid" />
                <Stepper.Step label="Wali" description="Data orang tua / wali" />
                <Stepper.Step label="Sekolah asal" description="Riwayat pendidikan" />
                <Stepper.Step label="Dokumen" description="Berkas pendaftaran" />
                <Stepper.Step label="Konfirmasi" description="Periksa data" />
                <Stepper.Step label="Selesai" description="Nomor pendaftaran" />
              </Stepper>
              <Divider my="xl" />
              {step === 0 && (
                <Stack>
                  <ImageUploader
                    label="Foto calon murid"
                    description="Opsional. PNG, JPEG, atau WebP dengan ukuran maksimal 5 MB."
                    scope="student.photo"
                    value={photoPreviewUrl}
                    onChange={(url) => {
                      setPhotoPreviewUrl(url);
                      if (!url) {
                        setPhotoFile(null);
                      }
                    }}
                    uploadFile={async (file) => {
                      setPhotoFile(file);
                      return URL.createObjectURL(file);
                    }}
                  />
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
                      placeholder="Nama sesuai dokumen"
                      minLength={2}
                      maxLength={100}
                      error={
                        form.name.length > 0 && form.name.trim().length < 2
                          ? 'Nama minimal 2 karakter.'
                          : undefined
                      }
                      value={form.name}
                      onChange={(e) => update('name', e.currentTarget.value)}
                    />
                    <Select
                      required
                      label="Jenis kelamin"
                      placeholder="Pilih jenis kelamin"
                      data={[
                        { value: 'male', label: 'Laki-laki' },
                        { value: 'female', label: 'Perempuan' },
                      ]}
                      value={form.gender || null}
                      onChange={(v) => update('gender', v || '')}
                    />
                    <TextInput
                      label="NIK"
                      placeholder="16 digit NIK"
                      inputMode="numeric"
                      maxLength={16}
                      value={form.nik}
                      onChange={(e) => update('nik', e.currentTarget.value.replace(/\D/g, ''))}
                    />
                    <TextInput
                      label="NISN"
                      placeholder="10 digit NISN"
                      value={form.nisn}
                      onChange={(e) => update('nisn', e.currentTarget.value)}
                    />
                    <TextInput
                      label="Tempat lahir"
                      placeholder="Kota kelahiran"
                      value={form.birth_place}
                      onChange={(e) => update('birth_place', e.currentTarget.value)}
                    />
                    <DateInput
                      label="Tanggal lahir"
                      placeholder="Pilih tanggal lahir"
                      locale="id"
                      valueFormat="D MMMM YYYY"
                      value={form.birth_date}
                      onChange={(v) => update('birth_date', v || '')}
                    />
                    <TextInput
                      label="Nomor Kartu Keluarga"
                      placeholder="16 digit nomor KK"
                      inputMode="numeric"
                      maxLength={16}
                      value={form.family_card_number}
                      onChange={(e) =>
                        update('family_card_number', e.currentTarget.value.replace(/\D/g, ''))
                      }
                    />
                    <Select
                      label="Agama"
                      placeholder="Pilih agama"
                      clearable
                      data={[
                        'Islam',
                        'Kristen',
                        'Katolik',
                        'Hindu',
                        'Buddha',
                        'Konghucu',
                        'Kepercayaan',
                      ]}
                      value={form.religion || null}
                      onChange={(v) => update('religion', v || '')}
                    />
                    <TextInput
                      label="Kewarganegaraan"
                      placeholder="Indonesia"
                      value={form.citizenship}
                      onChange={(e) => update('citizenship', e.currentTarget.value)}
                    />
                    <NumberInput
                      label="Anak ke"
                      placeholder="Urutan anak"
                      min={0}
                      max={99}
                      value={form.child_order}
                      onChange={(v) => update('child_order', Number(v) || 0)}
                    />
                    <NumberInput
                      label="Jumlah saudara"
                      placeholder="Jumlah saudara kandung"
                      min={0}
                      max={99}
                      value={form.sibling_count}
                      onChange={(v) => update('sibling_count', Number(v) || 0)}
                    />
                    <TextInput
                      label="Nomor akta kelahiran"
                      placeholder="Nomor pada akta kelahiran"
                      value={form.birth_certificate_number}
                      onChange={(e) => update('birth_certificate_number', e.currentTarget.value)}
                    />
                    <TextInput
                      required
                      label="Nomor telepon"
                      placeholder="08xx xxxx xxxx"
                      value={form.phone}
                      onChange={(e) => update('phone', e.currentTarget.value)}
                    />
                    <TextInput
                      label="Email"
                      placeholder="nama@email.com"
                      type="email"
                      value={form.email}
                      onChange={(e) => update('email', e.currentTarget.value)}
                    />
                    <Select
                      required
                      label="Jalur penerimaan"
                      placeholder="Pilih jalur penerimaan"
                      data={['Reguler', 'Prestasi', 'Afirmasi', 'Perpindahan orang tua']}
                      value={form.admission_path}
                      onChange={(v) => update('admission_path', v || 'Reguler')}
                    />
                  </SimpleGrid>
                  <Stack gap="xs">
                    <Switch
                      label="Memiliki kebutuhan khusus"
                      checked={form.has_special_needs}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        update('has_special_needs', checked);
                        if (!checked) update('special_needs_type', '');
                      }}
                    />
                    {form.has_special_needs && (
                      <TextInput
                        required
                        label="Jenis kebutuhan khusus"
                        placeholder="Jelaskan kebutuhan khusus"
                        value={form.special_needs_type}
                        onChange={(e) => update('special_needs_type', e.currentTarget.value)}
                      />
                    )}
                  </Stack>
                  <Text variant="caption">
                    NISN, nomor KK, dan nomor akta dapat dikosongkan bila belum tersedia, misalnya
                    untuk calon murid kelas 1.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      disabled={
                        !data.periods.length ||
                        !form.admission_period_id ||
                        !form.target_grade_id ||
                        form.name.trim().length < 2 ||
                        !form.gender ||
                        !form.phone
                      }
                      onClick={() => setStep(1)}
                    >
                      Lanjut
                    </Button>
                  </Group>
                </Stack>
              )}
              {step >= 1 && step <= 3 && (
                <Stack>
                  {step === 1 && (
                    <>
                      <Divider label="Alamat & sekolah asal" labelPosition="left" />
                      <Textarea
                        required
                        label="Alamat calon murid"
                        placeholder="Jalan, kampung, atau perumahan"
                        value={form.address}
                        onChange={(e) => update('address', e.currentTarget.value)}
                      />
                      <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <Select
                          required
                          searchable
                          label="Provinsi"
                          placeholder="Pilih provinsi"
                          data={regionOptions.province}
                          value={form.province_code || null}
                          disabled={loadingRegion === 'province'}
                          onChange={(value) => selectRegion('province', value)}
                        />
                        <Select
                          required
                          searchable
                          label="Kabupaten/Kota"
                          placeholder="Pilih kabupaten/kota"
                          data={regionOptions.regency}
                          value={form.regency_code || null}
                          disabled={!form.province_code || loadingRegion === 'regency'}
                          onChange={(value) => selectRegion('regency', value)}
                        />
                        <Select
                          required
                          searchable
                          label="Kecamatan"
                          placeholder="Pilih kecamatan"
                          data={regionOptions.district}
                          value={form.district_code || null}
                          disabled={!form.regency_code || loadingRegion === 'district'}
                          onChange={(value) => selectRegion('district', value)}
                        />
                        <Select
                          required
                          searchable
                          label="Kelurahan/Desa"
                          placeholder="Pilih kelurahan/desa"
                          data={regionOptions.village}
                          value={form.village_code || null}
                          disabled={!form.district_code || loadingRegion === 'village'}
                          onChange={(value) => selectRegion('village', value)}
                        />
                        <TextInput
                          required
                          label="RT"
                          placeholder="Nomor RT"
                          inputMode="numeric"
                          maxLength={5}
                          value={form.rt}
                          onChange={(e) => update('rt', e.currentTarget.value.replace(/\D/g, ''))}
                        />
                        <TextInput
                          required
                          label="RW"
                          placeholder="Nomor RW"
                          inputMode="numeric"
                          maxLength={5}
                          value={form.rw}
                          onChange={(e) => update('rw', e.currentTarget.value.replace(/\D/g, ''))}
                        />
                        <TextInput
                          label="Kode pos"
                          placeholder="Kode pos"
                          inputMode="numeric"
                          maxLength={10}
                          value={form.postal_code}
                          onChange={(e) =>
                            update('postal_code', e.currentTarget.value.replace(/\D/g, ''))
                          }
                        />
                      </SimpleGrid>
                      <Switch
                        required
                        label="Domisili saat ini sesuai dengan alamat di Kartu Keluarga"
                        checked={form.domicile_matches_family_card}
                        onChange={(e) =>
                          update('domicile_matches_family_card', e.currentTarget.checked)
                        }
                      />
                      <Stack gap="xs">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                          <NumberInput
                            label="Latitude (−90 s.d. 90)"
                            placeholder="Contoh: -6.200000"
                            min={-90}
                            max={90}
                            decimalScale={6}
                            value={form.latitude === '' ? '' : latitudeNumber}
                            error={
                              invalidLatitude
                                ? 'Latitude harus berada pada rentang −90 hingga 90.'
                                : undefined
                            }
                            onChange={(value) =>
                              update('latitude', value === '' ? '' : String(value))
                            }
                          />
                          <NumberInput
                            label="Longitude (−180 s.d. 180)"
                            placeholder="Contoh: 106.816666"
                            min={-180}
                            max={180}
                            decimalScale={6}
                            value={form.longitude === '' ? '' : longitudeNumber}
                            error={
                              invalidLongitude
                                ? 'Longitude harus berada pada rentang −180 hingga 180.'
                                : undefined
                            }
                            onChange={(value) =>
                              update('longitude', value === '' ? '' : String(value))
                            }
                          />
                        </SimpleGrid>
                        <Group justify="flex-end">
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconMapPin size={16} />}
                            onClick={() =>
                              navigator.geolocation?.getCurrentPosition(
                                (position) => {
                                  update('latitude', String(position.coords.latitude));
                                  update('longitude', String(position.coords.longitude));
                                },
                                () =>
                                  notifications.show({
                                    color: 'yellow',
                                    title: 'Lokasi tidak tersedia',
                                    message:
                                      'Izinkan akses lokasi atau isi koordinat secara manual.',
                                  }),
                              )
                            }
                          >
                            Gunakan lokasi
                          </Button>
                        </Group>
                      </Stack>
                      <Text variant="caption">
                        Jarak rumah ke sekolah akan dihitung otomatis setelah titik lokasi sekolah
                        tersedia.
                      </Text>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                          label="Nama sekolah asal"
                          placeholder="Nama sekolah sebelumnya"
                          value={form.previous_school_name}
                          onChange={(e) => update('previous_school_name', e.currentTarget.value)}
                        />
                        <TextInput
                          label="NPSN sekolah asal"
                          placeholder="Nomor Pokok Sekolah Nasional"
                          value={form.previous_school_npsn}
                          onChange={(e) => update('previous_school_npsn', e.currentTarget.value)}
                        />
                        <TextInput
                          label="Kelas/tingkat terakhir"
                          placeholder="Kelas terakhir"
                          value={form.previous_school_last_grade}
                          onChange={(e) =>
                            update('previous_school_last_grade', e.currentTarget.value)
                          }
                        />
                        <YearPickerInput
                          label="Tahun lulus"
                          placeholder="Pilih tahun lulus"
                          valueFormat="YYYY"
                          clearable
                          value={
                            form.previous_school_graduation_year
                              ? `${form.previous_school_graduation_year}-01-01`
                              : null
                          }
                          onChange={(value) =>
                            update(
                              'previous_school_graduation_year',
                              value ? value.slice(0, 4) : '',
                            )
                          }
                        />
                      </SimpleGrid>
                      <Textarea
                        label="Alamat sekolah asal"
                        placeholder="Alamat sekolah sebelumnya"
                        value={form.previous_school_address}
                        onChange={(e) => update('previous_school_address', e.currentTarget.value)}
                      />
                      <Text variant="caption">
                        Data sekolah asal dapat dikosongkan bila belum tersedia, misalnya untuk
                        calon murid kelas 1.
                      </Text>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <Divider label="Data wali" labelPosition="left" />
                      <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                          required
                          label="Nama orang tua / wali"
                          placeholder="Nama lengkap wali"
                          minLength={2}
                          maxLength={100}
                          error={
                            form.guardian_name.length > 0 && form.guardian_name.trim().length < 2
                              ? 'Nama wali minimal 2 karakter.'
                              : undefined
                          }
                          value={form.guardian_name}
                          onChange={(e) => update('guardian_name', e.currentTarget.value)}
                        />
                        <Select
                          required
                          label="Hubungan"
                          placeholder="Pilih hubungan"
                          data={[
                            'Ayah',
                            'Ibu',
                            'Kakek',
                            'Nenek',
                            'Kakak',
                            'Paman',
                            'Bibi',
                            'Saudara',
                            'Wali lainnya',
                          ]}
                          value={form.guardian_relation || null}
                          onChange={(value) => update('guardian_relation', value || '')}
                        />
                        <TextInput
                          required
                          label="NIK wali"
                          placeholder="16 digit NIK wali"
                          inputMode="numeric"
                          maxLength={16}
                          value={form.guardian_nik}
                          error={
                            form.guardian_nik.length > 0 && form.guardian_nik.length !== 16
                              ? 'NIK wali harus 16 digit.'
                              : undefined
                          }
                          onChange={(e) =>
                            update('guardian_nik', e.currentTarget.value.replace(/\D/g, ''))
                          }
                        />
                        <TextInput
                          label="Tempat lahir"
                          placeholder="Kota kelahiran wali"
                          value={form.guardian_birth_place}
                          onChange={(e) => update('guardian_birth_place', e.currentTarget.value)}
                        />
                        <DateInput
                          label="Tanggal lahir"
                          placeholder="Pilih tanggal lahir"
                          locale="id"
                          valueFormat="D MMMM YYYY"
                          value={form.guardian_birth_date}
                          onChange={(value) => update('guardian_birth_date', value || '')}
                        />
                        <Select
                          label="Pendidikan terakhir"
                          placeholder="Pilih pendidikan terakhir"
                          data={[
                            'Tidak sekolah',
                            'SD / sederajat',
                            'SMP / sederajat',
                            'SMA / sederajat',
                            'Diploma I / II',
                            'Diploma III',
                            'Diploma IV / Sarjana',
                            'Magister',
                            'Doktor',
                          ]}
                          value={form.guardian_last_education}
                          onChange={(value) => update('guardian_last_education', value || '')}
                        />
                        <Select
                          required
                          label="Pekerjaan"
                          placeholder="Pilih pekerjaan"
                          searchable
                          data={[
                            'Tidak bekerja',
                            'Ibu rumah tangga',
                            'Petani / pekebun',
                            'Nelayan',
                            'Pedagang',
                            'Wiraswasta',
                            'Karyawan swasta',
                            'PNS',
                            'TNI / Polri',
                            'Guru / dosen',
                            'Tenaga kesehatan',
                            'Buruh',
                            'Pensiunan',
                            'Lainnya',
                          ]}
                          value={form.guardian_occupation}
                          onChange={(value) => update('guardian_occupation', value || '')}
                        />
                        <NumberInput
                          label="Penghasilan per bulan"
                          placeholder="Jumlah penghasilan"
                          min={0}
                          thousandSeparator="."
                          decimalSeparator=","
                          prefix="Rp "
                          value={form.guardian_monthly_income}
                          onChange={(value) =>
                            update('guardian_monthly_income', Number(value) || 0)
                          }
                        />
                        <TextInput
                          label="Nomor telepon wali"
                          placeholder="08xx xxxx xxxx"
                          value={form.guardian_phone}
                          onChange={(e) => update('guardian_phone', e.currentTarget.value)}
                        />
                        <TextInput
                          label="Email wali"
                          placeholder="wali@email.com"
                          type="email"
                          value={form.guardian_email}
                          onChange={(e) => update('guardian_email', e.currentTarget.value)}
                        />
                      </SimpleGrid>
                      <Switch
                        label="Alamat wali sama dengan alamat calon murid"
                        checked={form.guardian_address_matches_student}
                        onChange={(event) =>
                          update('guardian_address_matches_student', event.currentTarget.checked)
                        }
                      />
                      <Textarea
                        label="Alamat wali"
                        placeholder="Alamat tempat tinggal wali"
                        disabled={form.guardian_address_matches_student}
                        value={form.guardian_address}
                        onChange={(e) => update('guardian_address', e.currentTarget.value)}
                      />
                    </>
                  )}
                  {step === 1 && (
                    <Group justify="space-between">
                      <Button variant="default" onClick={() => setStep(0)}>
                        Kembali
                      </Button>
                      <Button
                        disabled={
                          !form.address ||
                          !form.province_code ||
                          !form.regency_code ||
                          !form.district_code ||
                          !form.village_code ||
                          !form.rt ||
                          !form.rw ||
                          invalidLatitude ||
                          invalidLongitude
                        }
                        onClick={() => setStep(2)}
                      >
                        Lanjut
                      </Button>
                    </Group>
                  )}
                  {step === 2 && (
                    <Group justify="space-between">
                      <Button variant="default" onClick={() => setStep(1)}>
                        Kembali
                      </Button>
                      <Button
                        disabled={
                          form.guardian_name.trim().length < 2 ||
                          form.guardian_nik.length !== 16 ||
                          !form.guardian_relation ||
                          !form.guardian_occupation
                        }
                        onClick={() => setStep(3)}
                      >
                        Lanjut
                      </Button>
                    </Group>
                  )}
                  {step === 3 && (
                    <Group justify="space-between">
                      <Button variant="default" onClick={() => setStep(2)}>
                        Kembali
                      </Button>
                      <Button onClick={() => setStep(4)}>Lanjut</Button>
                    </Group>
                  )}
                </Stack>
              )}
              {step === 4 && (
                <Stack>
                  <Box>
                    <Text variant="eyebrow">DOKUMEN PENDAFTARAN</Text>
                    <Title order={3} mt={4}>
                      Lengkapi berkas calon murid
                    </Title>
                    <Text variant="description" mt={4}>
                      Kartu Keluarga, Akta Kelahiran, dan KTP Wali wajib diunggah. Format PDF atau
                      gambar, maksimal 10 MB per file.
                    </Text>
                  </Box>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    {applicationDocumentTypes.map(({ type, required }) => (
                      <FileUploader
                        key={type}
                        label={`${type}${required ? ' *' : ''}`}
                        scope="admission.document"
                        value={applicationFileUrls[type] || ''}
                        onChange={(url) => {
                          setApplicationFileUrls((current) => ({ ...current, [type]: url }));
                          if (!url)
                            setApplicationFiles((current) => ({ ...current, [type]: undefined }));
                        }}
                        uploadFile={async (file) => {
                          setApplicationFiles((current) => ({ ...current, [type]: file }));
                          return URL.createObjectURL(file);
                        }}
                      />
                    ))}
                  </SimpleGrid>
                  <Group justify="space-between">
                    <Button variant="default" onClick={() => setStep(3)}>
                      Kembali
                    </Button>
                    <Button
                      disabled={applicationDocumentTypes
                        .filter((item) => item.required)
                        .some((item) => !applicationFiles[item.type])}
                      onClick={() => setStep(5)}
                    >
                      Lanjut
                    </Button>
                  </Group>
                </Stack>
              )}
              {step === 5 && (
                <Stack>
                  <Stack gap="md">
                    <ReviewSection
                      title="Identitas calon murid"
                      rows={[
                        ['Nama lengkap', form.name],
                        ['NIK', form.nik],
                        ['NISN', form.nisn],
                        ['Jenis kelamin', form.gender === 'male' ? 'Laki-laki' : 'Perempuan'],
                        [
                          'Tempat, tanggal lahir',
                          [form.birth_place, form.birth_date].filter(Boolean).join(', '),
                        ],
                        [
                          'Tingkat & jalur',
                          `${data.grades.find((g) => g.value === form.target_grade_id)?.label || '—'} · ${form.admission_path}`,
                        ],
                        ['Agama', form.religion],
                        ['Kewarganegaraan', form.citizenship],
                      ]}
                    />
                    <ReviewSection
                      title="Alamat calon murid"
                      rows={[
                        ['Alamat lengkap', form.address],
                        [
                          'Wilayah',
                          [
                            form.village_name,
                            form.district_name,
                            form.regency_name,
                            form.province_name,
                          ]
                            .filter(Boolean)
                            .join(', '),
                        ],
                        ['RT / RW', form.rt && form.rw ? `${form.rt} / ${form.rw}` : ''],
                        ['Kode pos', form.postal_code],
                        ['Domisili sesuai KK', form.domicile_matches_family_card ? 'Ya' : 'Tidak'],
                      ]}
                    />
                    <ReviewSection
                      title="Wali utama"
                      rows={[
                        [
                          'Nama & hubungan',
                          [form.guardian_name, form.guardian_relation].filter(Boolean).join(' · '),
                        ],
                        ['NIK', form.guardian_nik],
                        ['Pekerjaan', form.guardian_occupation],
                        ['Pendidikan terakhir', form.guardian_last_education],
                        [
                          'Penghasilan per bulan',
                          form.guardian_monthly_income
                            ? `Rp ${form.guardian_monthly_income.toLocaleString('id-ID')}`
                            : '',
                        ],
                        ['Nomor HP', form.guardian_phone],
                        ['Email', form.guardian_email],
                        [
                          'Alamat',
                          form.guardian_address_matches_student
                            ? 'Sama dengan alamat calon murid'
                            : form.guardian_address,
                        ],
                      ]}
                    />
                    <ReviewSection
                      title="Sekolah sebelumnya"
                      rows={[
                        ['Nama sekolah', form.previous_school_name],
                        ['NPSN', form.previous_school_npsn],
                        ['Kelas terakhir', form.previous_school_last_grade],
                        ['Tahun lulus', form.previous_school_graduation_year],
                        ['Alamat sekolah', form.previous_school_address],
                      ]}
                    />
                    <Paper
                      withBorder
                      p={{ base: 'md', sm: 'lg' }}
                      radius="lg"
                      bg="var(--app-color-subtle)"
                    >
                      <Text variant="eyebrow" mb="sm">
                        Dokumen pendaftaran
                      </Text>
                      <Group gap="xs">
                        {applicationDocumentTypes
                          .filter(({ type }) => applicationFiles[type])
                          .map(({ type }) => (
                            <Badge key={type} color="brand">
                              {type}
                            </Badge>
                          ))}
                      </Group>
                    </Paper>
                  </Stack>
                  <TextInput
                    label={`Verifikasi: ${data.captcha.question}`}
                    placeholder="Hasil perhitungan"
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
                    <Button variant="default" onClick={() => setStep(4)}>
                      Kembali
                    </Button>
                    <Button loading={saving} disabled={!form.captcha_answer} onClick={submit}>
                      Kirim pendaftaran
                    </Button>
                  </Group>
                </Stack>
              )}
              {step === 6 && result && (
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
                    <Text size="xs" c="orange" mt="sm">
                      Catat atau simpan token ini. Token tidak disimpan otomatis di browser.
                    </Text>
                  </Paper>
                </Stack>
              )}
            </Paper>
          )}
          {view === 'track' && (
            <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }}>
              <Title order={3}>Cek status pendaftaran</Title>
              <Text c="dimmed" size="sm" mb="md">
                Masukkan token yang diterima setelah mengirim pendaftaran.
              </Text>
              <Group align="flex-end">
                <TextInput
                  style={{ flex: 1 }}
                  label="Token pelacakan 6 digit"
                  placeholder="Masukkan token pelacakan"
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
          )}
          <AdmissionHelp phone={data.school.phone} email={data.school.email} />
        </Stack>
      </Container>
    </Box>
  );
}
