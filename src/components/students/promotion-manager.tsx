'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconPencil,
  IconFilter,
  IconPlus,
  IconReportAnalytics,
  IconSchool,
  IconSearch,
  IconUsersGroup,
} from '@tabler/icons-react';
import 'dayjs/locale/id';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import { publishAcademicContext } from '@/lib/academic-context-client';
import styles from './promotion-manager.module.css';

type Option = { value: string; label: string };
type AcademicYearOption = Option & { start_date: string; end_date: string; is_active?: number };
type SourceClass = {
  id: string;
  name: string;
  grade_id: string;
  grade_name: string;
  level_order: number;
  student_count: number;
};
type TargetClass = Option & {
  name: string;
  grade_id: string;
  grade_name: string;
  level_order: number;
};
type GradeOption = Option & { level_order?: number };
type Student = {
  id: string;
  nis: string;
  name: string;
  source_class_id: string;
  source_class_name: string;
  source_level_order: number;
};
type Outcome = 'promoted' | 'retained' | 'graduated' | 'withdrawn';
type Action = { student_id: string; outcome: Outcome; target_class_id: string };
type PromotionData = {
  active_academic_year: AcademicYearOption;
  target_academic_year: AcademicYearOption | null;
  source_academic_year_id: string;
  source_years: Option[];
  draft_years: Option[];
  source_classes: SourceClass[];
  target_classes: TargetClass[];
  grade_options: GradeOption[];
  students: Student[];
  max_grade_level: number | null;
};
type YearForm = { name: string; start_date: string; end_date: string };
type ClassForm = { name: string; grade_id: string };
const EXCEPTION_PAGE_SIZE = 20;
const transitionSteps = [
  { label: 'Tahun baru', description: 'Periode' },
  { label: 'Salin struktur', description: 'Data akademik' },
  { label: 'Pemetaan', description: 'Rombel tujuan' },
  { label: 'Pengecualian', description: 'Per murid' },
  { label: 'Tinjau', description: 'Finalisasi' },
];

const outcomeLabels: Record<Outcome, string> = {
  promoted: 'Naik kelas',
  retained: 'Tinggal kelas',
  graduated: 'Lulus',
  withdrawn: 'Pindah / keluar',
};

function shiftYear(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function suggestedYear(source: AcademicYearOption): YearForm {
  const years = source.label.match(/(\d{4})\D+(\d{4})/);
  return {
    name: years ? `${Number(years[1]) + 1}/${Number(years[2]) + 1}` : '',
    start_date: shiftYear(source.start_date),
    end_date: shiftYear(source.end_date),
  };
}

function classSignature(value: string) {
  return value
    .toLocaleLowerCase('id-ID')
    .replace(/\d+/g, '')
    .replace(/\b(kelas|rombel)\b/g, '')
    .replace(/[^a-z]/g, '');
}

function findMatchingClass(sourceName: string, level: number, targetClasses: TargetClass[]) {
  const candidates = targetClasses.filter((item) => item.level_order === level);
  const signature = classSignature(sourceName);
  return (
    candidates.find((item) => classSignature(item.name) === signature) ||
    candidates.find(
      (item) => item.name.toLocaleLowerCase('id-ID') === sourceName.toLocaleLowerCase('id-ID'),
    ) ||
    candidates[0]
  );
}

export function PromotionManager({ writable }: { writable: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  const [data, setData] = useState<PromotionData | null>(null);
  const [yearForm, setYearForm] = useState<YearForm>({ name: '', start_date: '', end_date: '' });
  const [existingDraft, setExistingDraft] = useState('');
  const [copyTeaching, setCopyTeaching] = useState(true);
  const [copyExtracurricularAssignments, setCopyExtracurricularAssignments] = useState(true);
  const [copyHomeroom, setCopyHomeroom] = useState(true);
  const [copySchedules, setCopySchedules] = useState(true);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [showExceptions, setShowExceptions] = useState(false);
  const [exceptionQuery, setExceptionQuery] = useState('');
  const [exceptionClass, setExceptionClass] = useState<string | null>(null);
  const [exceptionView, setExceptionView] = useState<'all' | 'changed'>('all');
  const [exceptionPage, setExceptionPage] = useState(1);
  const [newClassOpened, setNewClassOpened] = useState(false);
  const [editingClass, setEditingClass] = useState<TargetClass | null>(null);
  const [classForm, setClassForm] = useState<ClassForm>({ name: '', grade_id: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [previousYearChecked, setPreviousYearChecked] = useState(false);
  const [previousYearConfirmed, setPreviousYearConfirmed] = useState(false);
  const [finalSummary, setFinalSummary] = useState<Record<string, number>>({});

  const initialiseActions = useCallback((result: PromotionData) => {
    const nextMappings: Record<string, string> = {};
    for (const sourceClass of result.source_classes) {
      if (sourceClass.level_order >= (result.max_grade_level || Number.MAX_SAFE_INTEGER)) continue;
      const targets = result.target_classes.filter(
        (target) => target.level_order === sourceClass.level_order + 1,
      );
      if (targets.length === 1) nextMappings[sourceClass.id] = targets[0].value;
    }
    setMappings(nextMappings);
    setActions(
      Object.fromEntries(
        result.students.map((student) => {
          const graduated = student.source_level_order === result.max_grade_level;
          return [
            student.id,
            {
              student_id: student.id,
              outcome: graduated ? 'graduated' : 'promoted',
              target_class_id: graduated ? '' : nextMappings[student.source_class_id] || '',
            } satisfies Action,
          ];
        }),
      ),
    );
  }, []);

  const load = useCallback(
    async (targetYearId = '', preserveProgress = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ mode: 'transition' });
        if (targetYearId) params.set('target_academic_year_id', targetYearId);
        const response = await fetch(`/api/modules/promotions?${params}`);
        const result = (await response.json()) as PromotionData & { error?: string };
        if (!response.ok) throw new Error(result.error);
        setData(result);
        if (!targetYearId) setYearForm(suggestedYear(result.active_academic_year));
        else if (!preserveProgress) initialiseActions(result);
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Persiapan gagal dimuat',
          message: error instanceof Error ? error.message : 'Koneksi gagal.',
        });
      } finally {
        setLoading(false);
      }
    },
    [initialiseActions],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const summary = useMemo(
    () =>
      Object.values(actions).reduce<Record<string, number>>((totals, action) => {
        totals[action.outcome] = (totals[action.outcome] || 0) + 1;
        return totals;
      }, {}),
    [actions],
  );

  const missingTargets = useMemo(
    () =>
      Object.values(actions).filter(
        (action) =>
          (action.outcome === 'promoted' || action.outcome === 'retained') &&
          !action.target_class_id,
      ).length,
    [actions],
  );

  const sourceClassesWithoutTarget = useMemo(() => {
    if (!data) return 0;
    return data.source_classes.filter(
      (sourceClass) =>
        sourceClass.level_order !== data.max_grade_level &&
        !data.target_classes.some(
          (targetClass) => targetClass.level_order === sourceClass.level_order + 1,
        ),
    ).length;
  }, [data]);

  const isException = useCallback(
    (student: Student, action: Action) => {
      const graduated = student.source_level_order === data?.max_grade_level;
      return (
        action.outcome !== (graduated ? 'graduated' : 'promoted') ||
        action.target_class_id !== (graduated ? '' : mappings[student.source_class_id] || '')
      );
    },
    [data?.max_grade_level, mappings],
  );
  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const query = exceptionQuery.trim().toLocaleLowerCase('id-ID');
    return data.students.filter((student) => {
      const action = actions[student.id];
      return (
        Boolean(action) &&
        (!query || `${student.nis} ${student.name}`.toLocaleLowerCase('id-ID').includes(query)) &&
        (!exceptionClass || student.source_class_id === exceptionClass) &&
        (exceptionView === 'all' || isException(student, action))
      );
    });
  }, [actions, data, exceptionClass, exceptionQuery, exceptionView, isException]);
  const exceptionPages = Math.max(1, Math.ceil(filteredStudents.length / EXCEPTION_PAGE_SIZE));
  const visibleStudents = filteredStudents.slice(
    (exceptionPage - 1) * EXCEPTION_PAGE_SIZE,
    exceptionPage * EXCEPTION_PAGE_SIZE,
  );
  function mapClass(sourceClassId: string, targetClassId: string) {
    setMappings((current) => ({ ...current, [sourceClassId]: targetClassId }));
    setActions((current) => {
      const next = { ...current };
      for (const student of data?.students || [])
        if (student.source_class_id === sourceClassId && next[student.id]?.outcome === 'promoted')
          next[student.id] = { ...next[student.id], target_class_id: targetClassId };
      return next;
    });
  }

  function openClassEditor(target: TargetClass) {
    setEditingClass(target);
    setClassForm({
      name: target.name,
      grade_id: target.grade_id,
    });
    setNewClassOpened(true);
  }

  function changeOutcome(student: Student, outcome: Outcome) {
    let targetClassId = '';
    if (outcome === 'promoted') targetClassId = mappings[student.source_class_id] || '';
    if (outcome === 'retained')
      targetClassId =
        findMatchingClass(
          student.source_class_name,
          student.source_level_order,
          data!.target_classes,
        )?.value || '';
    setActions((current) => ({
      ...current,
      [student.id]: { student_id: student.id, outcome, target_class_id: targetClassId },
    }));
  }

  async function createDraft() {
    if (!yearForm.name || !yearForm.start_date || !yearForm.end_date) {
      notifications.show({
        color: 'red',
        title: 'Data belum lengkap',
        message: 'Lengkapi nama dan periode tahun ajaran.',
      });
      return;
    }
    if (yearForm.start_date >= yearForm.end_date) {
      notifications.show({
        color: 'red',
        title: 'Periode tidak valid',
        message: 'Tanggal selesai harus setelah tanggal mulai.',
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/modules/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...yearForm,
          is_active: false,
          copy_from_academic_year_id: data!.active_academic_year.value,
          copy_semesters: true,
          copy_classrooms: true,
          copy_teaching_assignments: copyTeaching,
          copy_extracurricular_assignments: copyExtracurricularAssignments,
          copy_homeroom_assignments: copyHomeroom,
          copy_schedules: copySchedules,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setExistingDraft(result.id);
      await load(result.id);
      setActiveStep(2);
      notifications.show({
        color: 'green',
        title: 'Draft tahun ajaran siap',
        message: 'Semester, rombel, dan data akademik pilihan sudah disalin.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Draft gagal dibuat',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function resumeDraft() {
    if (!existingDraft) return;
    await load(existingDraft);
    setActiveStep(2);
  }

  async function finishTransition() {
    if (!data?.target_academic_year) return;
    setSaving(true);
    try {
      const response = await fetch('/api/modules/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_academic_year_id: data.source_academic_year_id,
          target_academic_year_id: data.target_academic_year.value,
          activate_target: true,
          actions: Object.values(actions),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      publishAcademicContext({
        academic_year: data.target_academic_year.label,
        semester: null,
      });
      setFinalSummary(result.summary);
      setCompleted(true);
      notifications.show({
        color: 'green',
        title: 'Pergantian tahun ajaran selesai',
        message: `${data.target_academic_year.label} sekarang menjadi tahun ajaran aktif.`,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Finalisasi gagal',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function createClass() {
    if (!data?.target_academic_year) return;
    if (!classForm.name || !classForm.grade_id) {
      notifications.show({
        color: 'red',
        title: 'Data belum lengkap',
        message: 'Isi tingkat dan nama rombel.',
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/modules/promotions', {
        method: editingClass ? 'PATCH' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...classForm,
          id: editingClass?.value,
          target_academic_year_id: data.target_academic_year.value,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (editingClass && editingClass.grade_id !== classForm.grade_id) {
        setMappings((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, value]) => value !== editingClass.value),
          ),
        );
        setActions((current) =>
          Object.fromEntries(
            Object.entries(current).map(([studentId, action]) => [
              studentId,
              action.target_class_id === editingClass.value
                ? { ...action, target_class_id: '' }
                : action,
            ]),
          ),
        );
      }
      setNewClassOpened(false);
      setEditingClass(null);
      setClassForm({ name: '', grade_id: '' });
      await load(data.target_academic_year.value, true);
      notifications.show({
        color: 'green',
        title: editingClass ? 'Rombel diperbarui' : 'Rombel ditambahkan',
        message: editingClass
          ? 'Perubahan rombel sudah disimpan.'
          : 'Rombel baru siap dipakai untuk pemetaan.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: editingClass ? 'Rombel gagal diperbarui' : 'Rombel gagal ditambahkan',
        message: error instanceof Error ? error.message : 'Koneksi gagal.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data)
    return (
      <Stack align="center" py={100}>
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Menyiapkan pergantian tahun ajaran...
        </Text>
      </Stack>
    );

  if (!writable)
    return (
      <>
        <PageHeading
          eyebrow="PROSES TAHUNAN"
          title="Pergantian Tahun Ajaran"
          description="Siapkan tahun baru dan proses hasil akademik seluruh murid dalam satu alur."
        />
        <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
          Anda memerlukan izin menulis Tahun Ajaran dan Pergantian Tahun Ajaran untuk menjalankan
          proses ini.
        </Alert>
      </>
    );

  if (completed)
    return (
      <Stack gap="xl">
        <Paper withBorder className={styles.successPanel}>
          <ThemeIcon size={64} radius="xl" color="green" variant="light">
            <IconCheck size={34} />
          </ThemeIcon>
          <Stack gap={6} align="center">
            <Title order={2}>Tahun ajaran baru sudah aktif</Title>
            <Text c="dimmed" ta="center">
              Pergantian dari {data?.active_academic_year.label} ke{' '}
              {data?.target_academic_year?.label} berhasil diselesaikan.
            </Text>
          </Stack>
          <Group justify="center">
            <Badge color="blue" size="lg">
              Naik {finalSummary.promoted || 0}
            </Badge>
            <Badge color="orange" size="lg">
              Tinggal {finalSummary.retained || 0}
            </Badge>
            <Badge color="grape" size="lg">
              Lulus {finalSummary.graduated || 0}
            </Badge>
            <Badge color="gray" size="lg">
              Keluar {finalSummary.withdrawn || 0}
            </Badge>
          </Group>
          <Group justify="center">
            <Button
              component={Link}
              href="/reports/academic"
              leftSection={<IconReportAnalytics size={18} />}
            >
              Lihat laporan hasil
            </Button>
            <Button component={Link} href="/" variant="default">
              Kembali ke ringkasan
            </Button>
          </Group>
        </Paper>
      </Stack>
    );

  if (!previousYearConfirmed && data)
    return (
      <>
        <PageHeading
          eyebrow="PROSES TAHUNAN"
          title="Pergantian Tahun Ajaran"
          description="Pastikan tahun ajaran aktif benar-benar selesai sebelum menyiapkan periode berikutnya."
        />

        <Paper withBorder className={styles.warningPanel}>
          <Stack gap="xl">
            <Group wrap="nowrap" align="flex-start" gap="lg">
              <ThemeIcon
                size={58}
                radius="xl"
                variant="light"
                color="brand"
                className={styles.warningIcon}
              >
                <IconAlertTriangle size={30} />
              </ThemeIcon>
              <div>
                <Badge color="brand" mb="sm">
                  Konfirmasi sebelum melanjutkan
                </Badge>
                <Title order={2}>
                  Pastikan tahun ajaran {data.active_academic_year.label} selesai
                </Title>
                <Text variant="description" mt={8} className={styles.warningDescription}>
                  Pada akhir proses, sistem akan menutup penempatan murid di tahun ini, memindahkan
                  status mereka ke tahun berikutnya, dan mengaktifkan tahun ajaran baru.
                </Text>
              </div>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {[
                {
                  icon: <IconReportAnalytics size={21} />,
                  title: 'Nilai dan rapor final',
                  description: 'Pastikan penilaian serta laporan hasil belajar sudah diperiksa.',
                },
                {
                  icon: <IconCalendarEvent size={21} />,
                  title: 'Kehadiran sudah direkap',
                  description: 'Pastikan data kehadiran dan kegiatan tahun berjalan sudah lengkap.',
                },
                {
                  icon: <IconUsersGroup size={21} />,
                  title: 'Status murid siap',
                  description: 'Siapkan keputusan naik, tinggal kelas, lulus, atau keluar.',
                },
              ].map((item) => (
                <Paper key={item.title} withBorder className={styles.warningItem}>
                  <ThemeIcon variant="light" color="brand" size={38} radius="md">
                    {item.icon}
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="sm">
                      {item.title}
                    </Text>
                    <Text variant="description" mt={4}>
                      {item.description}
                    </Text>
                  </div>
                </Paper>
              ))}
            </SimpleGrid>

            <Paper withBorder className={styles.confirmationBox}>
              <Checkbox
                checked={previousYearChecked}
                onChange={(event) => setPreviousYearChecked(event.currentTarget.checked)}
                label={`Saya sudah memastikan tahun ajaran ${data.active_academic_year.label} telah selesai dan data akhirnya sudah benar.`}
              />
            </Paper>

            <Group justify="space-between" className={styles.warningActions}>
              <Button
                component={Link}
                href="/reports/academic"
                variant="default"
                leftSection={<IconReportAnalytics size={17} />}
              >
                Periksa laporan akademik
              </Button>
              <Button
                disabled={!previousYearChecked}
                rightSection={<IconArrowRight size={17} />}
                onClick={() => setPreviousYearConfirmed(true)}
              >
                Mulai pergantian tahun
              </Button>
            </Group>
          </Stack>
        </Paper>
      </>
    );

  return (
    <>
      <PageHeading
        eyebrow="PROSES TAHUNAN"
        title="Pergantian Tahun Ajaran"
        description="Selesaikan persiapan tahun baru dan hasil akademik murid melalui langkah terpandu."
      />

      <Paper withBorder className={styles.wizardShell}>
        <Box className={styles.stepperWrap}>
          <Stepper
            active={activeStep}
            size="sm"
            allowNextStepsSelect={false}
            className={styles.stepper}
            classNames={{
              steps: styles.stepperSteps,
              step: styles.stepperStep,
              separator: styles.stepperSeparator,
              stepBody: styles.stepperStepBody,
            }}
          >
            {transitionSteps.map((step) => (
              <Stepper.Step key={step.label} label={step.label} description={step.description} />
            ))}
          </Stepper>
          <Text className={styles.mobileStepStatus} size="sm" fw={600} aria-live="polite">
            Langkah {activeStep + 1} dari {transitionSteps.length}:{' '}
            {transitionSteps[activeStep].label}
          </Text>
        </Box>

        <Box className={styles.content}>
          {activeStep === 0 && data && (
            <Stack gap="xl">
              <Stack gap={5}>
                <Title order={3}>Tentukan tahun ajaran baru</Title>
                <Text c="dimmed" size="sm">
                  Tahun aktif {data.active_academic_year.label} tetap berjalan sampai langkah
                  terakhir dikonfirmasi.
                </Text>
              </Stack>
              {data.draft_years.length > 0 && (
                <Alert
                  color="gray"
                  icon={<IconCalendarEvent size={18} />}
                  className={styles.infoAlert}
                >
                  <Group align="flex-end" justify="space-between">
                    <Select
                      label="Lanjutkan draft yang sudah ada"
                      placeholder="Pilih draft"
                      data={data.draft_years}
                      value={existingDraft}
                      onChange={(value) => setExistingDraft(value || '')}
                      w={{ base: '100%', sm: 320 }}
                    />
                    <Button
                      variant="light"
                      disabled={!existingDraft}
                      loading={loading}
                      onClick={resumeDraft}
                    >
                      Lanjutkan draft
                    </Button>
                  </Group>
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, md: 3 }} className={styles.formGrid}>
                <TextInput
                  label="Nama tahun ajaran"
                  placeholder="Contoh: 2027/2028"
                  value={yearForm.name}
                  onChange={(event) =>
                    setYearForm({ ...yearForm, name: event.currentTarget.value })
                  }
                  required
                />
                <DateInput
                  label="Tanggal mulai"
                  value={yearForm.start_date || null}
                  onChange={(value) => setYearForm({ ...yearForm, start_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  required
                />
                <DateInput
                  label="Tanggal selesai"
                  value={yearForm.end_date || null}
                  onChange={(value) => setYearForm({ ...yearForm, end_date: value || '' })}
                  valueFormat="D MMMM YYYY"
                  locale="id"
                  required
                />
              </SimpleGrid>
              <WizardActions onNext={() => setActiveStep(1)} nextLabel="Lanjutkan ke struktur" />
            </Stack>
          )}

          {activeStep === 1 && data && (
            <Stack gap="xl">
              <Stack gap={5}>
                <Title order={3}>Salin struktur dari {data.active_academic_year.label}</Title>
                <Text c="dimmed" size="sm">
                  Data sumber tetap aman. Sistem membuat salinan untuk {yearForm.name}.
                </Text>
              </Stack>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <CopyCard
                  icon={<IconCalendarEvent size={22} />}
                  title="Semester"
                  detail="Dua periode semester"
                  checked
                  disabled
                />
                <CopyCard
                  icon={<IconUsersGroup size={22} />}
                  title="Rombel"
                  detail={`${data.source_classes.length} rombel`}
                  checked
                  disabled
                />
                <CopyCard
                  icon={<IconSchool size={22} />}
                  title="Penugasan mengajar"
                  detail="Guru dan mata pelajaran"
                  checked={copyTeaching}
                  onChange={(value) => {
                    setCopyTeaching(value);
                    if (!value) setCopySchedules(false);
                  }}
                />
                <CopyCard
                  icon={<IconUsersGroup size={22} />}
                  title="Penugasan ekstrakurikuler"
                  detail="Pembina, lokasi, dan kuota; peserta dikosongkan"
                  checked={copyExtracurricularAssignments}
                  onChange={setCopyExtracurricularAssignments}
                />
                <CopyCard
                  icon={<IconSchool size={22} />}
                  title="Wali kelas"
                  detail="Dapat disesuaikan setelah proses"
                  checked={copyHomeroom}
                  onChange={setCopyHomeroom}
                />
                <CopyCard
                  icon={<IconCalendarEvent size={22} />}
                  title="Jadwal pelajaran"
                  detail="Jadwal mingguan dari tahun sebelumnya"
                  checked={copySchedules}
                  disabled={!copyTeaching}
                  onChange={setCopySchedules}
                />
              </SimpleGrid>
              <WizardActions
                onBack={() => setActiveStep(0)}
                onNext={createDraft}
                nextLabel="Buat draft & salin data"
                loading={saving || loading}
                nextIcon={<IconCopy size={17} />}
              />
            </Stack>
          )}

          {activeStep === 2 && data?.target_academic_year && (
            <Stack gap="xl">
              <Group justify="space-between" align="flex-end">
                <Stack gap={5}>
                  <Title order={3}>Periksa pemetaan rombel</Title>
                  <Text c="dimmed" size="sm">
                    Rombel dipasangkan otomatis jika tingkat berikutnya hanya memiliki satu rombel.
                    Jika pilihannya lebih dari satu, murid perlu dibagi pada langkah berikutnya.
                  </Text>
                </Stack>
                <Button
                  variant="light"
                  leftSection={<IconPlus size={17} />}
                  onClick={() => {
                    setEditingClass(null);
                    setClassForm({ name: '', grade_id: '' });
                    setNewClassOpened(true);
                  }}
                >
                  Tambah rombel baru
                </Button>
              </Group>
              <Paper withBorder p="md">
                <Stack gap="sm">
                  <Table.ScrollContainer minWidth={520}>
                    <Table verticalSpacing="sm" highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>NAMA</Table.Th>
                          <Table.Th>TINGKAT</Table.Th>
                          <Table.Th ta="right">AKSI</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data.target_classes.map((target) => (
                          <Table.Tr key={target.value}>
                            <Table.Td>{target.name}</Table.Td>
                            <Table.Td>{target.grade_name}</Table.Td>
                            <Table.Td ta="right">
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Edit ${target.name}`}
                                onClick={() => openClassEditor(target)}
                              >
                                <IconPencil size={17} />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Stack>
              </Paper>
              <Table.ScrollContainer minWidth={720}>
                <Table verticalSpacing="md" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ROMBEL ASAL</Table.Th>
                      <Table.Th>MURID</Table.Th>
                      <Table.Th>HASIL DEFAULT</Table.Th>
                      <Table.Th>ROMBEL TUJUAN</Table.Th>
                      <Table.Th>STATUS</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.source_classes.map((sourceClass) => {
                      const graduating = sourceClass.level_order === data.max_grade_level;
                      const targetOptions = data.target_classes
                        .filter((item) => item.level_order === sourceClass.level_order + 1)
                        .map((item) => ({
                          value: item.value,
                          label: item.label,
                        }));
                      const needsDistribution = !graduating && targetOptions.length > 1;
                      const ready = graduating || Boolean(mappings[sourceClass.id]);
                      return (
                        <Table.Tr key={sourceClass.id}>
                          <Table.Td>
                            <Text fw={600} size="xs">
                              {sourceClass.name}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {sourceClass.grade_name}
                            </Text>
                          </Table.Td>
                          <Table.Td>{sourceClass.student_count}</Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={graduating ? 'grape' : 'blue'}>
                              {graduating ? 'Lulus' : 'Naik kelas'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {graduating ? (
                              <Text c="dimmed" size="xs">
                                Tidak memerlukan rombel
                              </Text>
                            ) : (
                              <Select
                                searchable
                                placeholder={
                                  needsDistribution
                                    ? 'Atur per murid di langkah berikutnya'
                                    : 'Pilih rombel tingkat berikutnya'
                                }
                                data={targetOptions}
                                value={mappings[sourceClass.id] || ''}
                                onChange={(value) => mapClass(sourceClass.id, value || '')}
                              />
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="dot" color={ready ? 'green' : 'orange'}>
                              {ready
                                ? 'Siap'
                                : needsDistribution
                                  ? 'Perlu pembagian'
                                  : 'Rombel belum tersedia'}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <WizardActions
                onBack={() => setActiveStep(0)}
                onNext={() => {
                  if (missingTargets > 0) setShowExceptions(true);
                  setActiveStep(3);
                }}
                nextLabel="Lanjutkan ke pengecualian"
                disabled={sourceClassesWithoutTarget > 0}
              />
            </Stack>
          )}

          {activeStep === 3 && data && (
            <Stack gap="xl">
              <Stack gap={5}>
                <Title order={3}>Atur pengecualian murid</Title>
                <Text c="dimmed" size="sm">
                  Tentukan rombel tujuan untuk murid yang memerlukan pembagian, lalu sesuaikan hasil
                  lainnya bila diperlukan.
                </Text>
              </Stack>
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <SummaryCard color="blue" value={summary.promoted || 0} label="Naik kelas" />
                <SummaryCard color="orange" value={summary.retained || 0} label="Tinggal kelas" />
                <SummaryCard color="grape" value={summary.graduated || 0} label="Lulus" />
                <SummaryCard color="gray" value={summary.withdrawn || 0} label="Pindah / keluar" />
              </SimpleGrid>
              <Paper withBorder p="md" className={styles.exceptionIntro}>
                <Group justify="space-between" align="center">
                  <Stack gap={2}>
                    <Text fw={650}>Daftar murid ({data.students.length})</Text>
                    <Text c="dimmed" size="xs">
                      Cari murid atau tampilkan hanya baris yang sudah diubah.
                    </Text>
                  </Stack>
                  <Button
                    variant={showExceptions ? 'default' : 'light'}
                    onClick={() => setShowExceptions((value) => !value)}
                    rightSection={
                      showExceptions ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />
                    }
                  >
                    {showExceptions
                      ? 'Tutup daftar'
                      : missingTargets > 0
                        ? 'Atur pembagian'
                        : 'Atur pengecualian'}
                  </Button>
                </Group>
              </Paper>
              <Collapse in={showExceptions}>
                <Stack gap="md" className={styles.exceptionList}>
                  <SimpleGrid cols={{ base: 1, sm: 3 }} className={styles.filterGrid}>
                    <TextInput
                      leftSection={<IconSearch size={16} />}
                      placeholder="Cari NIS atau nama murid"
                      value={exceptionQuery}
                      onChange={(event) => {
                        setExceptionQuery(event.currentTarget.value);
                        setExceptionPage(1);
                      }}
                    />
                    <Select
                      leftSection={<IconFilter size={16} />}
                      placeholder="Semua rombel asal"
                      clearable
                      data={data.source_classes.map((item) => ({
                        value: item.id,
                        label: `${item.name} · ${item.student_count} murid`,
                      }))}
                      value={exceptionClass}
                      onChange={(value) => {
                        setExceptionClass(value);
                        setExceptionPage(1);
                      }}
                    />
                    <Select
                      data={[
                        { value: 'all', label: 'Tampilkan semua murid' },
                        { value: 'changed', label: 'Hanya yang diubah' },
                      ]}
                      value={exceptionView}
                      onChange={(value) => {
                        setExceptionView(value as 'all' | 'changed');
                        setExceptionPage(1);
                      }}
                    />
                  </SimpleGrid>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      Menampilkan{' '}
                      {visibleStudents.length ? (exceptionPage - 1) * EXCEPTION_PAGE_SIZE + 1 : 0}–
                      {Math.min(exceptionPage * EXCEPTION_PAGE_SIZE, filteredStudents.length)} dari{' '}
                      {filteredStudents.length} murid
                    </Text>
                    <Badge variant="light" color="orange">
                      {
                        data.students.filter(
                          (student) =>
                            actions[student.id] && isException(student, actions[student.id]),
                        ).length
                      }{' '}
                      perubahan
                    </Badge>
                  </Group>
                  <Table.ScrollContainer minWidth={760}>
                    <Table verticalSpacing="sm" highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>NIS</Table.Th>
                          <Table.Th>NAMA</Table.Th>
                          <Table.Th>ROMBEL ASAL</Table.Th>
                          <Table.Th>HASIL</Table.Th>
                          <Table.Th>ROMBEL TUJUAN</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {visibleStudents.map((student) => {
                          const action = actions[student.id];
                          if (!action) return null;
                          const targetLevel =
                            action.outcome === 'retained'
                              ? student.source_level_order
                              : student.source_level_order + 1;
                          const targetOptions = data.target_classes.filter(
                            (item) => item.level_order === targetLevel,
                          );
                          return (
                            <Table.Tr key={student.id}>
                              <Table.Td>{student.nis}</Table.Td>
                              <Table.Td>
                                <Text fw={600} size="xs">
                                  {student.name}
                                </Text>
                              </Table.Td>
                              <Table.Td>{student.source_class_name}</Table.Td>
                              <Table.Td>
                                <Select
                                  data={(Object.keys(outcomeLabels) as Outcome[]).map((value) => ({
                                    value,
                                    label: outcomeLabels[value],
                                    disabled:
                                      value === 'graduated' &&
                                      student.source_level_order !== data.max_grade_level,
                                  }))}
                                  value={action.outcome}
                                  onChange={(value) => changeOutcome(student, value as Outcome)}
                                />
                              </Table.Td>
                              <Table.Td>
                                <Select
                                  searchable
                                  placeholder="Pilih rombel"
                                  data={targetOptions}
                                  value={action.target_class_id}
                                  disabled={
                                    action.outcome === 'graduated' || action.outcome === 'withdrawn'
                                  }
                                  onChange={(value) =>
                                    setActions((current) => ({
                                      ...current,
                                      [student.id]: {
                                        ...current[student.id],
                                        target_class_id: value || '',
                                      },
                                    }))
                                  }
                                />
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                  {exceptionPages > 1 && (
                    <Group justify="center">
                      <Pagination
                        total={exceptionPages}
                        value={exceptionPage}
                        onChange={setExceptionPage}
                        size="sm"
                      />
                    </Group>
                  )}
                </Stack>
              </Collapse>
              {missingTargets > 0 && (
                <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                  {missingTargets} murid masih belum memiliki rombel tujuan.
                </Alert>
              )}
              <WizardActions
                onBack={() => setActiveStep(2)}
                onNext={() => setActiveStep(4)}
                nextLabel="Tinjau hasil akhir"
                disabled={missingTargets > 0}
              />
            </Stack>
          )}

          {activeStep === 4 && data?.target_academic_year && (
            <Stack gap="xl">
              <Stack gap={5}>
                <Title order={3}>Tinjau dan selesaikan</Title>
                <Text c="dimmed" size="sm">
                  Pastikan ringkasan berikut sudah benar sebelum tahun ajaran baru diaktifkan.
                </Text>
              </Stack>
              <Paper withBorder p="lg" className={styles.transitionCard}>
                <Group justify="center" gap="lg">
                  <Stack gap={2} align="center">
                    <Text c="dimmed" size="xs">
                      TAHUN ASAL
                    </Text>
                    <Text fw={700}>{data.active_academic_year.label}</Text>
                  </Stack>
                  <ThemeIcon variant="light" radius="xl">
                    <IconArrowRight size={18} />
                  </ThemeIcon>
                  <Stack gap={2} align="center">
                    <Text c="dimmed" size="xs">
                      TAHUN BARU
                    </Text>
                    <Text fw={700}>{data.target_academic_year.label}</Text>
                  </Stack>
                </Group>
              </Paper>
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <SummaryCard color="blue" value={summary.promoted || 0} label="Naik kelas" />
                <SummaryCard color="orange" value={summary.retained || 0} label="Tinggal kelas" />
                <SummaryCard color="grape" value={summary.graduated || 0} label="Lulus" />
                <SummaryCard color="gray" value={summary.withdrawn || 0} label="Pindah / keluar" />
              </SimpleGrid>
              <Alert color="green" icon={<IconCheck size={18} />} title="Semua pemeriksaan selesai">
                Dua semester siap dan {data.target_classes.length} rombel tersedia untuk tahun
                ajaran baru.
              </Alert>
              <Alert
                color="gray"
                icon={<IconCalendarEvent size={18} />}
                className={styles.infoAlert}
              >
                Setelah dikonfirmasi, {data.target_academic_year.label} akan menjadi tahun ajaran
                aktif dan riwayat lama tetap tersimpan.
              </Alert>
              <WizardActions
                onBack={() => setActiveStep(3)}
                onNext={finishTransition}
                nextLabel={`Aktifkan ${data.target_academic_year.label} & proses murid`}
                loading={saving}
                disabled={missingTargets > 0}
                nextIcon={<IconCheck size={17} />}
              />
            </Stack>
          )}
        </Box>
      </Paper>
      <Modal
        opened={newClassOpened}
        onClose={() => {
          setNewClassOpened(false);
          setEditingClass(null);
          setClassForm({ name: '', grade_id: '' });
        }}
        title={editingClass ? 'Edit rombel' : 'Tambah rombel baru'}
        centered
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {editingClass ? 'Rombel yang sudah disalin' : 'Rombel baru'} pada{' '}
            {data?.target_academic_year?.label} dapat langsung dipakai untuk pemetaan.
          </Text>
          <Select
            label="Tingkat / kelas"
            placeholder="Pilih tingkat"
            data={data?.grade_options || []}
            value={classForm.grade_id}
            onChange={(value) => setClassForm((current) => ({ ...current, grade_id: value || '' }))}
            required
          />
          <TextInput
            label="Nama rombel"
            placeholder="Contoh: 7C"
            value={classForm.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setClassForm((current) => ({ ...current, name }));
            }}
            required
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setNewClassOpened(false);
                setEditingClass(null);
                setClassForm({ name: '', grade_id: '' });
              }}
            >
              Batal
            </Button>
            <Button
              leftSection={editingClass ? <IconPencil size={17} /> : <IconPlus size={17} />}
              loading={saving}
              onClick={createClass}
            >
              {editingClass ? 'Simpan perubahan' : 'Tambah rombel'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function WizardActions({
  onBack,
  onNext,
  nextLabel,
  loading,
  disabled,
  nextIcon,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  loading?: boolean;
  disabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" className={styles.actions}>
      {onBack ? (
        <Button
          variant="default"
          onClick={onBack}
          disabled={loading}
          leftSection={<IconArrowLeft size={17} />}
        >
          Kembali
        </Button>
      ) : (
        <span />
      )}
      <Button
        onClick={onNext}
        loading={loading}
        disabled={disabled}
        rightSection={nextIcon || <IconArrowRight size={17} />}
      >
        {nextLabel}
      </Button>
    </Group>
  );
}

function CopyCard({
  icon,
  title,
  detail,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <Paper withBorder p="md" className={styles.copyCard}>
      <Group wrap="nowrap">
        <ThemeIcon variant="light" size={42} radius="md">
          {icon}
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text fw={650} size="sm">
            {title}
          </Text>
          <Text c="dimmed" size="xs">
            {detail}
          </Text>
        </Stack>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
          aria-label={`Salin ${title}`}
        />
      </Group>
    </Paper>
  );
}

function SummaryCard({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <Paper withBorder p="md" className={styles.summaryCard}>
      <Text fz={26} fw={750} c={color}>
        {value}
      </Text>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
    </Paper>
  );
}
