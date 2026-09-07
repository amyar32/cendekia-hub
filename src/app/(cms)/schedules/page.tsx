import { ScheduleManager } from '@/components/schedules/schedule-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'schedules.read')) return <AccessDenied />;
  return <ScheduleManager writable={can(user.permissions, 'schedules.write')} />;
}
