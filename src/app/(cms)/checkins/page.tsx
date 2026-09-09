import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { CheckinHub } from '@/components/checkins/checkin-hub';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'checkins.read')) return <AccessDenied />;
  return <CheckinHub writable={can(user.permissions, 'checkins.write')} />;
}
