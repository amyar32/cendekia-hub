import { GuardianManager } from '@/components/students/student-managers';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { currentUser } from '@/lib/auth';
import { can } from '@/config/modules';
export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'guardians.read')) return <AccessDenied />;
  return <GuardianManager writable={can(user.permissions, 'guardians.write')} />;
}
