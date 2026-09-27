import { AcademicReport } from '@/features/reports/components/academic-report';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Riwayat & Mutasi Murid' };

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-reports.read')) return <AccessDenied />;
  return <AcademicReport />;
}
