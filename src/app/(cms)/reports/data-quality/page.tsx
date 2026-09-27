import type { Metadata } from 'next';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { DataQualityReport } from '@/features/reports/components/data-quality-report';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { z } from 'zod';

export const metadata: Metadata = { title: 'Laporan Kelengkapan Data' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ academic_year_id?: string; category?: string }>;
}) {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-reports.read')) return <AccessDenied />;
  const params = await searchParams;
  const year = z.string().uuid().safeParse(params.academic_year_id);
  const category = ['student_guardian', 'student_nisn'].includes(params.category || '')
    ? params.category
    : '';
  return (
    <DataQualityReport initialYear={year.success ? year.data : ''} initialCategory={category} />
  );
}
