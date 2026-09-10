import { PromotionManager } from '@/components/students/promotion-manager';
import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'promotions.read')) return <AccessDenied />;
  return (
    <PromotionManager
      writable={
        can(user.permissions, 'promotions.write') &&
        can(user.permissions, 'academic-years.write') &&
        can(user.permissions, 'teaching-assignments.write') &&
        can(user.permissions, 'homeroom-assignments.write') &&
        can(user.permissions, 'extracurricular-assignments.write')
      }
    />
  );
}
