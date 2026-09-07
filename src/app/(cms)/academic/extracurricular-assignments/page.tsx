import { ExtracurricularAssignmentManager } from '@/components/extracurriculars/extracurricular-assignment-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'extracurricular-assignments.read')) return <AccessDenied />;
  return (
    <ExtracurricularAssignmentManager
      writable={can(user.permissions, 'extracurricular-assignments.write')}
    />
  );
}
