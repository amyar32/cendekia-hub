import { ModulePage } from '@/components/cms/module-page/module-page';
import { ClassroomManager } from '@/features/academic/components/academic-managers';

export default function Page() {
  return (
    <ModulePage readPermission="classes.read" writePermission="classes.write">
      {({ writable }) => <ClassroomManager writable={writable} />}
    </ModulePage>
  );
}
