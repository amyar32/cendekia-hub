import { AdmissionManager } from '@/components/admissions/admission-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'admissions.read')) return <AccessDenied />;
  return <AdmissionManager writable={can(user.permissions, 'admissions.write')} />;
}
