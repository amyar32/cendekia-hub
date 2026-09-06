import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { UserManager } from '@/components/users/user-manager';
import { currentUser } from '@/lib/auth';
import { can } from '@/config/modules';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'users.read')) return <AccessDenied />;

  return <UserManager currentUserId={user.id} writable={can(user.permissions, 'users.write')} />;
}
