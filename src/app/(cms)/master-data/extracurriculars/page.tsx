import { ModulePage } from '@/components/cms/module-page/module-page';
import { ExtracurricularManager } from '@/features/academic/components/academic-managers';

export default function Page() {
  return (
    <ModulePage readPermission="extracurriculars.read" writePermission="extracurriculars.write">
      {({ writable }) => <ExtracurricularManager writable={writable} />}
    </ModulePage>
  );
}
