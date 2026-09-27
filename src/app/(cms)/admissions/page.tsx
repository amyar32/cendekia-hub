import { ModulePage } from '@/components/cms/module-page/module-page';
import { AdmissionManager } from '@/features/admissions/components/admission-manager';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <ModulePage readPermission="admissions.read" writePermission="admissions.write">
      {({ writable }) => (
        <AdmissionManager
          writable={writable}
          initialStatus={status === 'submitted' ? status : ''}
        />
      )}
    </ModulePage>
  );
}
