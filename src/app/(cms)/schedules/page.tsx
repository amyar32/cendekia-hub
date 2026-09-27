import { ModulePage } from '@/components/cms/module-page/module-page';
import { ScheduleManager } from '@/features/schedules/components/schedule-manager';

export default function Page() {
  return (
    <ModulePage readPermission="schedules.read" writePermission="schedules.write">
      {({ writable }) => <ScheduleManager writable={writable} />}
    </ModulePage>
  );
}
