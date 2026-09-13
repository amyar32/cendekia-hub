import { AdmissionManager } from '@/components/admissions/admission-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'admissions.read')) return <AccessDenied />;

  const { id } = await params;
  return (
    <AdmissionManager applicationId={id} writable={can(user.permissions, 'admissions.write')} />
  );
}
