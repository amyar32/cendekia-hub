import { IdentityCard } from '@/components/identity-card/identity-card';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { z } from 'zod';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { CardPrintTrigger } from '@/components/identity-card/card-print-trigger';
import styles from '@/components/identity-card/identity-card-print.module.css';

type Params = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export default async function StudentCardPrintPage({ params }: Params) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.permissions, 'students.read')) redirect('/checkins');
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsedId.success) notFound();
  const card = db()
    .prepare(
      `SELECT s.id,s.nis,s.nisn,s.name,s.photo_url,s.birth_place,s.birth_date,s.address,s.qr_token,
        school.name AS school_name,school.logo_url,school.npsn AS school_npsn,
        school.phone AS school_phone,school.email AS school_email,
        school.address AS school_address,school.principal_name,school.principal_nip,
        school.principal_signature_url
       FROM students s JOIN schools school ON school.id=s.school_id
       WHERE s.id=? AND s.school_id=?`,
    )
    .get(parsedId.data, currentSchoolId()) as
    | {
        id: string;
        nis: string;
        nisn: string;
        name: string;
        photo_url: string;
        birth_place: string;
        birth_date: string | null;
        address: string;
        qr_token: string;
        school_name: string;
        logo_url: string;
        school_npsn: string;
        school_phone: string;
        school_email: string;
        school_address: string;
        principal_name: string;
        principal_nip: string;
        principal_signature_url: string;
      }
    | undefined;
  if (!card) notFound();
  const qr = await QRCode.toDataURL(`cendekia:checkin:${card.qr_token}`, {
    width: 700,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const birthDate = card.birth_date
    ? new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${card.birth_date}T00:00:00Z`))
    : '';
  const birth = [card.birth_place, birthDate].filter(Boolean).join(', ') || '—';

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <strong>Pratinjau cetak kartu</strong>
          <span>Ukuran 90 × 55 mm · gunakan skala 100%, margin none, dan background graphics</span>
        </div>
        <Link href="/master-data/students">Kembali</Link>
        <CardPrintTrigger />
      </div>
      <section className={styles.sheet}>
        <IdentityCard
          card={card}
          personType="student"
          qr={qr}
          fields={[
            { label: 'NIS', value: card.nis },
            { label: 'NISN', value: card.nisn },
            { label: 'TTL', value: birth },
            { label: 'Alamat', value: card.address },
          ]}
        />
      </section>
    </main>
  );
}
