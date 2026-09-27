import { ModulePage } from '@/components/cms/module-page/module-page';
import { TeacherManager } from '@/features/teachers/components/teacher-managers';
export default function Page() {
  return (
    <ModulePage readPermission="teachers.read" writePermission="teachers.write">
      {({ writable }) => <TeacherManager writable={writable} />}
    </ModulePage>
  );
}
