import { ModulePage } from '@/components/cms/module-page/module-page';
import { PointManager } from '@/features/points/components/point-manager';

export default function Page() {
  return (
    <ModulePage readPermission="points.read" writePermission="points.write">
      {() => <PointManager />}
    </ModulePage>
  );
}
