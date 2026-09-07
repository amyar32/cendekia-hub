import { ExtracurricularManager } from '@/components/academic/academic-managers';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'extracurriculars.read')) return <AccessDenied />;
  return <ExtracurricularManager writable={can(user.permissions, 'extracurriculars.write')} />;
}
