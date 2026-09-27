import { ModulePage } from '@/components/cms/module-page/module-page';
import { StudentAttendanceManager } from '@/features/attendance/components/student-attendance/student-attendance-manager';

export default function Page() {
  return (
    <ModulePage readPermission="student-attendance.read" writePermission="student-attendance.write">
      {({ writable }) => <StudentAttendanceManager writable={writable} />}
    </ModulePage>
  );
}
