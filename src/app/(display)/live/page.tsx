import { LiveDisplay } from '@/components/live/live-display';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';

export const metadata = {
  title: 'Live Report · Display Operasional',
  description: 'Informasi aktivitas sekolah secara langsung.',
};

export default async function LivePage() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'live-display.read')) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1>Akses layar tidak tersedia</h1>
          <p>Role akun ini belum memiliki izin live-display.read.</p>
        </div>
      </main>
    );
  }
  return <LiveDisplay operatorName={user.name} />;
}
