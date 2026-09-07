import { GradeManager } from '@/components/academic/academic-managers';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'grades.read')) return <AccessDenied />;
  return <GradeManager writable={can(user.permissions, 'grades.write')} />;
}
