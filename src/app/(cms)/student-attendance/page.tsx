import { StudentAttendanceManager } from '@/components/student-attendance/student-attendance-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'student-attendance.read')) return <AccessDenied />;
  return <StudentAttendanceManager writable={can(user.permissions, 'student-attendance.write')} />;
}
