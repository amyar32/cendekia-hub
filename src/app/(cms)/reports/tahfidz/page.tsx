import type { Metadata } from 'next';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { TahfidzRecapPanel } from '@/features/tahfidz/components/tahfidz-recap';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Rekap Tahfidz' };
export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-reports.read')) return <AccessDenied />;
  return <TahfidzRecapPanel />;
}
