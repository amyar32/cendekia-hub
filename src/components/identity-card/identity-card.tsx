import Image from 'next/image';
import styles from './identity-card.module.css';

type SchoolIdentity = {
  school_name: string;
  logo_url: string;
  school_npsn: string;
  school_phone: string;
  school_email: string;
  school_address: string;
  principal_name: string;
  principal_nip: string;
  principal_signature_url: string;
  name: string;
  photo_url: string;
};

/** The same proportional artwork is used in the modal and on the printed card. */
export function IdentityCard({
  card,
  personType,
  qr,
  fields,
  photoCaption,
}: {
  card: SchoolIdentity;
  personType: 'student' | 'teacher';
  qr: string;
  fields: { label: string; value: string }[];
  photoCaption?: string;
}) {
  return (
    <div className={styles.frame}>
      <article className={styles.card}>
        <header className={styles.header}>
          {card.logo_url ? (
            <Image
              className={styles.logo}
              src={card.logo_url}
              alt="Logo sekolah"
              width={80}
              height={80}
              unoptimized
              loading="eager"
            />
          ) : (
            <div className={styles.logoFallback}>CH</div>
          )}
          <div className={styles.school}>
            <h1>{card.school_name}</h1>
            <p>
              NPSN: {card.school_npsn || '—'} · Tel: {card.school_phone || '—'} · Email:{' '}
              {card.school_email || '—'}
            </p>
            <p>{card.school_address || 'Alamat sekolah belum diatur'}</p>
          </div>
        </header>
        <div className={styles.content}>
          <div className={styles.photoBlock}>
            {card.photo_url ? (
              <Image
                className={styles.photo}
                src={card.photo_url}
                alt={`Foto ${card.name}`}
                width={160}
                height={200}
                unoptimized
                loading="eager"
              />
            ) : (
              <div className={styles.photoFallback}>{card.name.slice(0, 2).toUpperCase()}</div>
            )}
            {photoCaption && <span className={styles.photoCaption}>{photoCaption}</span>}
          </div>
          <div className={styles.identity}>
            <h2>{card.name}</h2>
            <dl>
              {fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd className={field.label === 'Alamat' ? styles.addressValue : undefined}>
                    {field.value || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={styles.qr}>
            {qr && (
              <Image
                src={qr}
                alt={`QR cek-in ${personType === 'teacher' ? 'guru' : 'siswa'}`}
                width={280}
                height={280}
                unoptimized
                loading="eager"
              />
            )}
            <span className={styles.scanLabel}>Pindai untuk cek-in</span>
            <span className={styles.cardType}>
              KARTU {personType === 'teacher' ? 'GURU' : 'SISWA'}
            </span>
          </div>
        </div>
        <footer className={styles.footer}>
          <div className={styles.principal}>
            <span>Kepala Sekolah</span>
            <div className={styles.signature}>
              {card.principal_signature_url && (
                <Image
                  src={card.principal_signature_url}
                  alt="Tanda tangan kepala sekolah"
                  width={180}
                  height={60}
                  unoptimized
                  loading="eager"
                />
              )}
            </div>
            <strong>{card.principal_name || 'Belum diatur'}</strong>
            {card.principal_nip && <span>NIP {card.principal_nip}</span>}
          </div>
        </footer>
      </article>
    </div>
  );
}
