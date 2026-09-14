import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { Dashboard } from '@/components/dashboard/dashboard';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/config/modules';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = (await currentUser())!;

  if (!can(user.permissions, 'dashboard.read')) return <AccessDenied dashboard />;

  const school = db()
    .prepare('SELECT id FROM schools ORDER BY is_active DESC,created_at LIMIT 1')
    .get() as { id: string } | undefined;
  const schoolId = school?.id || '';
  const academicContext = db()
    .prepare(
      `SELECT ay.id AS academic_year_id,ay.name AS academic_year,
        COALESCE(s.name,'Belum ada semester aktif') AS semester
       FROM academic_years ay
       LEFT JOIN semesters s ON s.academic_year_id=ay.id AND s.is_active=1
       WHERE ay.school_id=? AND ay.is_active=1 LIMIT 1`,
    )
    .get(schoolId) as
    { academic_year_id: string; academic_year: string; semester: string } | undefined;
  const count = (sql: string, ...params: Array<string | number | null>) =>
    (
      db()
        .prepare(sql)
        .get(...params) as { n: number }
    ).n;
  const stats = {
    students: can(user.permissions, 'students.read')
      ? count('SELECT count(*) AS n FROM students WHERE school_id=? AND is_active=1', schoolId)
      : null,
    teachers: can(user.permissions, 'teachers.read')
      ? count('SELECT count(*) AS n FROM teachers WHERE school_id=? AND is_active=1', schoolId)
      : null,
    classes: can(user.permissions, 'classes.read')
      ? academicContext
        ? count(
            `SELECT count(*) AS n FROM classes
             WHERE school_id=? AND academic_year_id=? AND is_active=1`,
            schoolId,
            academicContext.academic_year_id,
          )
        : 0
      : null,
    applications: can(user.permissions, 'admissions.read')
      ? count(
          `SELECT count(*) AS n FROM student_applications
           WHERE school_id=?
             AND admission_period_id=(
               SELECT id FROM admission_periods
               WHERE school_id=? AND status IN ('open','closed')
               ORDER BY start_date DESC,created_at DESC LIMIT 1
             )
             AND status IN
               ('submitted','needs_revision','verified','selection','accepted','waitlisted','reregistered')`,
          schoolId,
          schoolId,
        )
      : null,
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
        .prepare('SELECT onboarding_completed_at FROM schools WHERE id=? LIMIT 1')
        .get(schoolId) as { onboarding_completed_at: string | null } | undefined)
    : undefined;

  return (
    <Dashboard
      user={user}
      stats={stats}
      activities={activities}
      onboardingComplete={Boolean(onboarding?.onboarding_completed_at)}
      academicContext={{
        year: academicContext?.academic_year || 'Belum ada tahun ajaran aktif',
        semester: academicContext?.semester || '—',
      }}
    />
  );
}
