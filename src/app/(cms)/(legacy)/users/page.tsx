import { permanentRedirect } from 'next/navigation';

export default function Page() {
  permanentRedirect('/administration/users');
}
