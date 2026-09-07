import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { ExtracurricularAttendanceManager } from '@/components/extracurricular-attendance/extracurricular-attendance-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'extracurricular-attendance.read')) return <AccessDenied />;
  return (
    <ExtracurricularAttendanceManager
      writable={can(user.permissions, 'extracurricular-attendance.write')}
    />
  );
}
