import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { SchoolSettings, type School } from '@/components/settings/school-settings';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'school.read')) return <AccessDenied />;

  const school = (db().prepare('SELECT * FROM schools ORDER BY created_at LIMIT 1').get() ??
    null) as School | null;

  return <SchoolSettings initialSchool={school} writable={can(user.permissions, 'school.write')} />;
}
