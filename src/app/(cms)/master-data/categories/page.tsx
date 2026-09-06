import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import { CategoryManager } from '@/components/categories/category-manager';
import { currentUser } from '@/lib/auth';
import { can } from '@/config/modules';

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'categories.read')) return <AccessDenied />;

  return <CategoryManager writable={can(user.permissions, 'categories.write')} />;
}
