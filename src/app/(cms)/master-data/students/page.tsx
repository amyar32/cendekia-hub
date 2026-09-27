import { ModulePage } from '@/components/cms/module-page/module-page';
import { StudentManager } from '@/features/students/components/student-managers';
export default function Page() {
  return (
    <ModulePage readPermission="students.read" writePermission="students.write">
      {({ writable }) => <StudentManager writable={writable} />}
    </ModulePage>
  );
}
