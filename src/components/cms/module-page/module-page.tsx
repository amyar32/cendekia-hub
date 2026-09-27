import type { ReactNode } from 'react';
import { can, type Permission } from '@/config/modules';
import { currentUser, type SessionUser } from '@/lib/auth';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';

type ModulePageProps = {
  readPermission: Permission;
  writePermission: Permission;
  children: (access: { user: SessionUser; writable: boolean }) => ReactNode;
};

/** Shared server-side access gate for CMS module pages. API routes enforce their own permissions. */
export async function ModulePage({ readPermission, writePermission, children }: ModulePageProps) {
  const user = await currentUser();
  if (!user || !can(user.permissions, readPermission)) return <AccessDenied />;
  return children({ user, writable: can(user.permissions, writePermission) });
}
