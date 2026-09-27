import { ModulePage } from '@/components/cms/module-page/module-page';
import { GradeManager } from '@/features/academic/components/academic-managers';
export default function Page() {
  return (
    <ModulePage readPermission="grades.read" writePermission="grades.write">
      {({ writable }) => <GradeManager writable={writable} />}
    </ModulePage>
  );
}
