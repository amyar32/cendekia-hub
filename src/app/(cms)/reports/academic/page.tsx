import { AcademicReport } from '@/components/reports/academic-report';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'academic-reports.read')) return <AccessDenied />;
  return <AcademicReport />;
}
