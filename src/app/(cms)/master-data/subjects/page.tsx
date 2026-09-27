import { ModulePage } from '@/components/cms/module-page/module-page';
import { SubjectManager } from '@/features/academic/components/academic-managers';
export default function Page() {
  return (
    <ModulePage readPermission="subjects.read" writePermission="subjects.write">
      {({ writable }) => <SubjectManager writable={writable} />}
    </ModulePage>
  );
}
