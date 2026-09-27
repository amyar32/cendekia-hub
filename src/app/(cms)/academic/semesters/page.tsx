import { ModulePage } from '@/components/cms/module-page/module-page';
import { SemesterManager } from '@/features/academic/components/academic-managers';

export default function Page() {
  return (
    <ModulePage readPermission="semesters.read" writePermission="semesters.write">
      {({ writable }) => <SemesterManager writable={writable} />}
    </ModulePage>
  );
}
