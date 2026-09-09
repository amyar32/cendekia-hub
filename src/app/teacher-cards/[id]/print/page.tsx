import Image from 'next/image';
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
      `SELECT t.id,t.employee_code,t.nip,t.name,t.photo_url,t.birth_date,t.join_date,
        t.employment_status,t.qr_token,school.name AS school_name,school.logo_url
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
        employment_status: 'permanent' | 'contract' | 'honorary';
        qr_token: string;
        school_name: string;
        logo_url: string;
      }
    | undefined;
  if (!card) notFound();
  const qr = await QRCode.toDataURL(`cendekia:teacher-checkin:${card.qr_token}`, {
    width: 700,
    margin: 1,
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
  const employment = {
    permanent: 'Guru tetap',
    contract: 'Guru kontrak',
    honorary: 'Guru honorer',
  }[card.employment_status];

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
        <article className={styles.card}>
          <div className={styles.orb} />
          <header>
            <div className={styles.brand}>
              {card.logo_url ? (
                <Image src={card.logo_url} alt="Logo sekolah" width={54} height={54} unoptimized />
              ) : (
                <div className={styles.logo}>CH</div>
              )}
              <div>
                <h1>{card.school_name}</h1>
                <p>CENDEKIA HUB · TEACHER SERVICES</p>
              </div>
            </div>
            <span className={styles.title}>KARTU GURU</span>
          </header>
          <div className={styles.content}>
            <div className={styles.photoBlock}>
              {card.photo_url ? (
                <Image
                  src={card.photo_url}
                  alt={`Foto ${card.name}`}
                  width={138}
                  height={154}
                  unoptimized
                />
              ) : (
                <div className={styles.photoFallback}>{card.name.slice(0, 2).toUpperCase()}</div>
              )}
              <span>GURU AKTIF</span>
            </div>
            <div className={styles.identity}>
              <h2>{card.name}</h2>
              <dl>
                <div>
                  <dt>KODE</dt>
                  <dd>{card.employee_code}</dd>
                </div>
                <div>
                  <dt>NIP</dt>
                  <dd>{card.nip || '—'}</dd>
                </div>
                <div>
                  <dt>LAHIR</dt>
                  <dd>{formatDate(card.birth_date)}</dd>
                </div>
                <div className={styles.address}>
                  <dt>STATUS</dt>
                  <dd>{employment}</dd>
                </div>
              </dl>
            </div>
            <div className={styles.qr}>
              <Image src={qr} alt="QR cek-in guru" width={136} height={136} unoptimized />
              <b>PINDAI UNTUK CEK-IN</b>
              <span>{card.employee_code}</span>
            </div>
          </div>
          <footer>
            <b>KARTU IDENTITAS RESMI</b>
            <span>
              Kartu hanya berlaku untuk guru yang namanya tercantum dan tidak dapat
              dipindahtangankan.
            </span>
          </footer>
        </article>
      </section>
    </main>
  );
}
