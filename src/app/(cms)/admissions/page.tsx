import { ModulePage } from '@/components/cms/module-page/module-page';
import { AdmissionManager } from '@/features/admissions/components/admission-manager';

export default function Page() {
  return (
    <ModulePage readPermission="admissions.read" writePermission="admissions.write">
      {({ writable }) => <AdmissionManager writable={writable} />}
    </ModulePage>
  );
}
