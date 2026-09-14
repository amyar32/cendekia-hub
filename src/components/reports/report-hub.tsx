'use client';

import Link from 'next/link';
import { Badge, Paper, SimpleGrid, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconArrowUpRight,
  IconChartBar,
  IconChecklist,
  IconHistory,
  IconSchool,
} from '@tabler/icons-react';
import { PageHeading } from '@/components/cms/page-heading/page-heading';
import styles from './report-hub.module.css';

const reports = [
  {
    title: 'Kehadiran',
    description:
      'Analisis absensi pelajaran, check-in gerbang murid, dan kehadiran guru dalam satu laporan.',
    href: '/reports/attendance',
    icon: IconChartBar,
    color: 'blue',
    status: 'Baru',
  },
  {
    title: 'Kelengkapan Data',
    description:
      'Temukan data murid, guru, rombel, dan kegiatan yang perlu dilengkapi sebelum mengganggu operasional.',
    href: '/reports/data-quality',
    icon: IconChecklist,
    color: 'orange',
    status: 'Baru',
  },
  {
    title: 'Riwayat & Mutasi Murid',
    description:
      'Lihat penempatan rombel, kenaikan kelas, kelulusan, serta perpindahan murid per tahun ajaran.',
    href: '/reports/academic',
    icon: IconHistory,
    color: 'grape',
    status: 'Diperbarui',
  },
] as const;

export function ReportHub() {
  return (
    <>
      <PageHeading
        eyebrow="PUSAT LAPORAN"
        title="Laporan sekolah"
        description="Ubah data operasional menjadi informasi yang dapat ditindaklanjuti dan diekspor."
      />
      <Paper withBorder className={styles.intro}>
        <ThemeIcon size={46} radius="md" variant="light">
          <IconSchool size={25} />
        </ThemeIcon>
        <div>
          <Title order={3}>Pilih laporan sesuai kebutuhan</Title>
          <Text variant="description" mt={5}>
            Seluruh laporan mengikuti akses akun dan konteks tahun ajaran sekolah.
          </Text>
        </div>
      </Paper>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {reports.map((report) => (
          <Paper
            component={Link}
            href={report.href}
            withBorder
            className={styles.card}
            key={report.href}
          >
            <div className={styles.cardTop}>
              <ThemeIcon size={46} radius="md" variant="light" color={report.color}>
                <report.icon size={24} />
              </ThemeIcon>
              <Badge variant="light" color={report.color}>
                {report.status}
              </Badge>
            </div>
            <div>
              <Title order={3}>{report.title}</Title>
              <Text variant="description" mt="sm" lh={1.65}>
                {report.description}
              </Text>
            </div>
            <span className={styles.open}>
              Buka laporan <IconArrowUpRight size={17} />
            </span>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
