import { ModulePage } from '@/components/cms/module-page/module-page';
import { CheckinHub } from '@/features/checkins/components/checkin-hub';

export default function Page() {
  return (
    <ModulePage readPermission="checkins.read" writePermission="checkins.write">
      {({ writable }) => <CheckinHub writable={writable} />}
    </ModulePage>
  );
}
