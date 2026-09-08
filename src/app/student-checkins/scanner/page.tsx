import { redirect } from 'next/navigation';
import { CheckinScanner } from '@/components/student-checkins/checkin-scanner';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ScannerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.permissions, 'student-checkins.write')) redirect('/student-checkins');
  return <CheckinScanner operatorName={user.name} />;
}
