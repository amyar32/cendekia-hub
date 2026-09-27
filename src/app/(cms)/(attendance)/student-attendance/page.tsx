import { ModulePage } from '@/components/cms/module-page/module-page';
import { StudentAttendanceManager } from '@/features/attendance/components/student-attendance/student-attendance-manager';
import { isoDateSchema } from '@/lib/validation';

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const date = isoDateSchema().safeParse((await searchParams).date);
  return (
    <ModulePage readPermission="student-attendance.read" writePermission="student-attendance.write">
      {({ writable }) => (
        <StudentAttendanceManager
          writable={writable}
          initialDate={date.success ? date.data : undefined}
        />
      )}
    </ModulePage>
  );
}
