import { redirect } from 'next/navigation';
import { ScheduleBell } from '@/components/schedules/schedule-bell';
import { currentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DisplayLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUser())) redirect('/login');
  return (
    <>
      <ScheduleBell />
      {children}
    </>
  );
}
