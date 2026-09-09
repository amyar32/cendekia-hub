import { redirect } from 'next/navigation';
import { CheckinScanner } from '@/components/checkins/checkin-scanner';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ScannerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.permissions, 'checkins.write')) redirect('/checkins');
  return <CheckinScanner operatorName={user.name} />;
}
