import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { TahfidzManager } from '@/features/tahfidz/components/tahfidz-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'tahfidz.read')) return <AccessDenied />;
  return <TahfidzManager writable={can(user.permissions, 'tahfidz.write')} />;
}
