import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { Dashboard } from '@/components/dashboard/dashboard';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/config/modules';

export default async function Page() {
  const user = (await currentUser())!;

  if (!can(user.permissions, 'dashboard.read')) return <AccessDenied dashboard />;

  const count = (table: string) =>
    (db().prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  const stats = {
    users: can(user.permissions, 'users.read') ? count('users') : null,
    roles: can(user.permissions, 'roles.read') ? count('roles') : null,
    teachers: can(user.permissions, 'teachers.read') ? count('teachers') : null,
    students: can(user.permissions, 'students.read') ? count('students') : null,
    audit: can(user.permissions, 'audit.read') ? count('audit') : null,
  };
  const activities = can(user.permissions, 'audit.read')
    ? (db()
        .prepare('SELECT id,actor,action,entity,created_at FROM audit ORDER BY id DESC LIMIT 5')
        .all() as {
        id: number;
        actor: string;
        action: string;
        entity: string;
        created_at: string;
      }[])
    : [];
  const onboarding = can(user.permissions, 'school.read')
    ? (db()
        .prepare(
          'SELECT onboarding_completed_at FROM schools ORDER BY is_active DESC,created_at LIMIT 1',
        )
        .get() as { onboarding_completed_at: string | null } | undefined)
    : undefined;

  return (
    <Dashboard
      user={user}
      stats={stats}
      activities={activities}
      onboardingComplete={Boolean(onboarding?.onboarding_completed_at)}
    />
  );
}
