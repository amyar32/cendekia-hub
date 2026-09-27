import { ModulePage } from '@/components/cms/module-page/module-page';
import { AcademicYearManager } from '@/features/academic/components/academic-years/academic-year-manager';

export default function Page() {
  return (
    <ModulePage readPermission="academic-years.read" writePermission="academic-years.write">
      {({ writable }) => <AcademicYearManager writable={writable} />}
    </ModulePage>
  );
}
