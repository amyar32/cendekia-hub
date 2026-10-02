import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { TahfidzManager } from '@/features/tahfidz/components/tahfidz-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ academic_year_id?: string }>;
}) {
  const params = await searchParams;
  const user = (await currentUser())!;
  if (!can(user.permissions, 'tahfidz.read')) return <AccessDenied />;
  return (
    <TahfidzManager
      writable={can(user.permissions, 'tahfidz.write')}
      initialYear={params.academic_year_id}
    />
  );
}
