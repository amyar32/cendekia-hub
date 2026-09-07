import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { CmsShell } from '@/components/cms/cms-shell';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const academicContext = db()
    .prepare(
      `SELECT ay.name AS academic_year,semester.name AS semester
       FROM schools school
       LEFT JOIN academic_years ay ON ay.school_id=school.id AND ay.is_active=1
       LEFT JOIN semesters semester ON semester.academic_year_id=ay.id AND semester.is_active=1
       ORDER BY school.is_active DESC,school.created_at LIMIT 1`,
    )
    .get() as { academic_year: string | null; semester: string | null } | undefined;
  return (
    <CmsShell user={user} academicContext={academicContext}>
      {children}
    </CmsShell>
  );
}
