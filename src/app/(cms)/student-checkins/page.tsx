import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { StudentCheckinManager } from '@/components/student-checkins/student-checkin-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'student-checkins.read')) return <AccessDenied />;
  return <StudentCheckinManager writable={can(user.permissions, 'student-checkins.write')} />;
}
