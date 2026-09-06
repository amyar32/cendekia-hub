import { AccountSettings } from '@/components/settings/account-settings';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const user = (await currentUser())!;

  return <AccountSettings user={user} />;
}
