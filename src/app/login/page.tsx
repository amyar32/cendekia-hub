import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login/login-form';
export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return <LoginForm />;
}
