import { IconBook2 } from '@tabler/icons-react';
import { livePage, type LiveDisplaySnapshot } from '@/lib/live-display';
import styles from './live-display.module.css';

const attendanceLabels = {
  present: 'Hadir',
  late: 'Terlambat',
  absent: 'Tidak hadir',
  missing: 'Belum check-in',
};
const sessionLabels = { not_started: 'Belum dibuka', open: 'Berjalan', closed: 'Ditutup' };

export function HalaqahScene({ data, page }: { data: LiveDisplaySnapshot; page: number }) {
  const groups = data.activities.filter((activity) => activity.kind === 'tahfidz');
  const shown = livePage(groups, page, 12);
  const teachers = new Map(
    groups.flatMap((group) => group.teachers).map((teacher) => [teacher.id, teacher]),
  );
  const checkedIn = [...teachers.values()].filter(
    (teacher) => teacher.status === 'present' || teacher.status === 'late',
  ).length;
  return (
    <div className={`${styles.scene} ${styles.halaqahScene}`}>
      <section className={styles.sceneHeading}>
        <div>
          <span className={styles.largeIcon}>
            <IconBook2 size={30} />
          </span>
          <div>
            <span>MONITOR HALAQAH & TAHFIDZ</span>
            <h2>Kelompok dan kesiapan pembimbing</h2>
          </div>
        </div>
        <div className={styles.headingStats}>
          <span>
            <b>{groups.length}</b>Halaqah hari ini
          </span>
          <span>
            <b>
              {checkedIn}/{teachers.size}
            </b>
            Pembimbing check-in
          </span>
          <span>
            <b>{groups.filter((group) => group.session_status === 'closed').length}</b>Sesi ditutup
          </span>
        </div>
      </section>
      <section className={styles.halaqahGrid} aria-label="Kelompok halaqah">
        {[shown.slice(0, 6), shown.slice(6, 12)].map((column, index) => (
          <article className={styles.halaqahPanel} key={index}>
            <div className={styles.halaqahColumns}>
              <span>Kelompok / pembimbing</span>
              <span>Kehadiran · sesi</span>
            </div>
            {column.map((group) => (
              <div className={styles.halaqahRow} key={group.id}>
                <div className={styles.halaqahIdentity}>
                  <h3>{group.title}</h3>
                  <strong>
                    {group.teachers.map((teacher) => teacher.name).join(', ') ||
                      'Pembimbing belum tersedia'}
                  </strong>
                  <span>
                    {group.start_time}–{group.end_time}
                    {group.location ? ` · ${group.location}` : ''}
                  </span>
                </div>
                <div className={styles.halaqahState}>
                  {group.teachers.map((teacher) => (
                    <span key={teacher.id} className={`${styles.status} ${styles[teacher.status]}`}>
                      {attendanceLabels[teacher.status]}
                    </span>
                  ))}
                  <small
                    className={group.session_status === 'closed' ? styles.halaqahClosed : undefined}
                  >
                    Sesi{' '}
                    {sessionLabels[group.session_status || 'not_started'].toLocaleLowerCase(
                      'id-ID',
                    )}
                  </small>
                </div>
              </div>
            ))}
          </article>
        ))}
        {!shown.length && (
          <div className={styles.halaqahEmpty}>Belum ada jadwal halaqah hari ini.</div>
        )}
      </section>
      <div className={styles.halaqahFooter}>
        <span>
          {groups.length
            ? `${page * 12 + 1}–${Math.min((page + 1) * 12, groups.length)} dari ${groups.length} kelompok`
            : '0 kelompok'}
        </span>
        <span>Semua kelompok tampil bergiliran secara otomatis</span>
      </div>
    </div>
  );
}
