import { IdentityCard } from '@/components/identity-card/identity-card';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { z } from 'zod';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { CardPrintTrigger } from '@/components/identity-card/card-print-trigger';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import styles from '@/components/identity-card/identity-card-print.module.css';

type Params = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export default async function TeacherCardPrintPage({ params }: Params) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.permissions, 'teachers.read')) redirect('/checkins');
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsedId.success) notFound();
  const card = db()
    .prepare(
      `SELECT t.id,t.employee_code,t.nip,t.name,t.photo_url,t.birth_date,t.join_date,t.blood_type,t.address,
        t.qr_token,school.name AS school_name,school.logo_url,
        school.npsn AS school_npsn,school.phone AS school_phone,
        school.email AS school_email,school.address AS school_address,
        school.principal_name,school.principal_nip,school.principal_signature_url
       FROM teachers t JOIN schools school ON school.id=t.school_id
       WHERE t.id=? AND t.school_id=?`,
    )
    .get(parsedId.data, currentSchoolId()) as
    | {
        id: string;
        employee_code: string;
        nip: string;
        name: string;
        photo_url: string;
        birth_date: string | null;
        join_date: string | null;
        blood_type: string;
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
  const qr = await QRCode.toDataURL(`cendekia:teacher-checkin:${card.qr_token}`, {
    width: 700,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${value}T00:00:00Z`))
      : '—';
  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <strong>Pratinjau cetak kartu</strong>
          <span>Ukuran 90 × 55 mm · gunakan skala 100%, margin none, dan background graphics</span>
        </div>
        <Link href="/master-data/teachers">Kembali</Link>
        <CardPrintTrigger />
      </div>
      <section className={styles.sheet}>
        <IdentityCard
          card={card}
          personType="teacher"
          qr={qr}
          fields={[
            { label: 'Kode Guru', value: card.employee_code },
            { label: 'NIP/NUPTK', value: card.nip },
            { label: 'Lahir', value: formatDate(card.birth_date) },
            { label: 'G.Darah', value: card.blood_type },
            { label: 'Alamat', value: card.address },
          ]}
        />
      </section>
    </main>
  );
}
