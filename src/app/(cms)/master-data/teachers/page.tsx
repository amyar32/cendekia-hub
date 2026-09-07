import { TeacherManager } from '@/components/teachers/teacher-managers';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'teachers.read')) return <AccessDenied />;
  return <TeacherManager writable={can(user.permissions, 'teachers.write')} />;
}
