import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { CmsShell } from '@/components/cms/cms-shell';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <CmsShell user={user}>{children}</CmsShell>;
}
