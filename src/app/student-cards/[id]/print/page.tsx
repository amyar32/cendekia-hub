import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { z } from 'zod';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { currentSchoolId } from '@/app/api/modules/_shared/academic-context';
import { StudentCardPrintTrigger } from '@/components/students/student-card-print-trigger';
import styles from './print.module.css';

type Params = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export default async function StudentCardPrintPage({ params }: Params) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.permissions, 'students.read')) redirect('/student-checkins');
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsedId.success) notFound();
  const card = db()
    .prepare(
      `SELECT s.id,s.nis,s.nisn,s.name,s.photo_url,s.birth_place,s.birth_date,s.address,s.qr_token,
        school.name AS school_name,school.logo_url
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
      }
    | undefined;
  if (!card) notFound();
  const qr = await QRCode.toDataURL(`cendekia:checkin:${card.qr_token}`, {
    width: 700,
    margin: 1,
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
        <StudentCardPrintTrigger />
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
                <p>CENDEKIA HUB · STUDENT SERVICES</p>
              </div>
            </div>
            <span className={styles.title}>KARTU SISWA</span>
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
              <span>SISWA AKTIF</span>
            </div>
            <div className={styles.identity}>
              <h2>{card.name}</h2>
              <dl>
                <div>
                  <dt>NIS</dt>
                  <dd>{card.nis}</dd>
                </div>
                <div>
                  <dt>NISN</dt>
                  <dd>{card.nisn || '—'}</dd>
                </div>
                <div>
                  <dt>TTL</dt>
                  <dd>{birth}</dd>
                </div>
                <div className={styles.address}>
                  <dt>Alamat</dt>
                  <dd>{card.address || '—'}</dd>
                </div>
              </dl>
            </div>
            <div className={styles.qr}>
              <Image src={qr} alt="QR cek-in siswa" width={136} height={136} unoptimized />
              <b>PINDAI UNTUK CEK-IN</b>
              <span>{card.nis}</span>
            </div>
          </div>
          <footer>
            <b>KARTU IDENTITAS RESMI</b>
            <span>
              Kartu hanya berlaku untuk siswa yang namanya tercantum dan tidak dapat
              dipindahtangankan.
            </span>
          </footer>
        </article>
      </section>
    </main>
  );
}
