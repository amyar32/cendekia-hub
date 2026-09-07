import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { RoleManager } from '@/components/roles/role-manager';
import { currentUser } from '@/lib/auth';
import { can } from '@/config/modules';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'roles.read')) return <AccessDenied />;

  return (
    <RoleManager
      currentRoleId={user.role_id}
      userPermissions={user.permissions}
      writable={can(user.permissions, 'roles.write')}
    />
  );
}
