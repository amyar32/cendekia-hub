import { AcademicYearManager } from '@/components/academic-years/academic-year-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-years.read')) return <AccessDenied />;

  return <AcademicYearManager writable={can(user.permissions, 'academic-years.write')} />;
}
