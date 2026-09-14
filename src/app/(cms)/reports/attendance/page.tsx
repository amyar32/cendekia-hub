import type { Metadata } from 'next';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { AttendanceReport } from '@/components/reports/attendance-report';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Laporan Kehadiran Terpadu' };

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-reports.read')) return <AccessDenied />;
  return <AttendanceReport />;
}
