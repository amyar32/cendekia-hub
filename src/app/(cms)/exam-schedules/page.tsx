import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { ExamScheduleManager } from '@/components/exam-schedules/exam-schedule-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'exam-schedules.read')) return <AccessDenied />;
  return <ExamScheduleManager />;
}
