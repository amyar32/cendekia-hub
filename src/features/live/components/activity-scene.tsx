import { IconCalendarTime } from '@tabler/icons-react';
import {
  LIVE_ACTIVITY_PAGE_SIZE,
  liveActivityLabels,
  liveActivityOrder,
  livePage,
  type LiveDisplaySnapshot,
} from '@/lib/live-display';
import styles from './live-display.module.css';
import { EmptyState } from './empty-state';

const phaseLabels = { current: 'Berlangsung', upcoming: 'Berikutnya', finished: 'Selesai' };
const sessionLabels = {
  not_started: 'Absensi belum dibuka',
  open: 'Absensi terbuka',
  closed: 'Absensi ditutup',
};
const teacherStatusLabels = {
  present: 'Hadir',
  late: 'Terlambat',
  absent: 'Tidak hadir',
  missing: 'Belum check-in',
};

export function ActivityScene({ data, page }: { data: LiveDisplaySnapshot; page: number }) {
  const shown = livePage(
    liveActivityOrder(data.activities.filter((activity) => activity.kind !== 'tahfidz')),
    page,
    LIVE_ACTIVITY_PAGE_SIZE,
  );
  return (
    <div className={`${styles.scene} ${styles.activityScene}`}>
      <section className={styles.sceneHeading}>
        <div>
          <span className={styles.largeIcon}>
            <IconCalendarTime size={30} />
          </span>
          <div>
            <span>AGENDA SEKOLAH HARI INI</span>
            <h2>Pelajaran, ujian & ekstrakurikuler</h2>
          </div>
        </div>
        <div className={styles.headingStats}>
          <span>
            <b>{data.activities.filter((a) => a.phase === 'current').length}</b>Berlangsung
          </span>
          <span>
            <b>{data.activities.filter((a) => a.phase === 'upcoming').length}</b>Berikutnya
          </span>
        </div>
      </section>
      <div className={styles.activitySummary}>
        {Object.entries(liveActivityLabels).map(([kind, label]) => (
          <div key={kind}>
            <strong>{data.activities.filter((a) => a.kind === kind).length}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className={styles.activityCards} aria-label="Daftar kegiatan">
        {shown.map((activity) => (
          <article className={styles.activityCard} key={activity.id}>
            <div className={styles.activityCardTop}>
              <span className={styles.activityKind}>{liveActivityLabels[activity.kind]}</span>
              <span className={`${styles.status} ${styles[activity.phase]}`}>
                {phaseLabels[activity.phase]}
              </span>
            </div>
            <strong className={styles.activityTime}>
              {activity.start_time} — {activity.end_time}
            </strong>
            <h3>{activity.title}</h3>
            <p>
              {activity.group_label}
              {activity.location ? ` · ${activity.location}` : ''}
            </p>
            <div className={styles.activityTeachers}>
              {activity.teachers.length ? (
                activity.teachers.map((teacher) => (
                  <div key={teacher.id}>
                    <strong>{teacher.name}</strong>
                    <span className={`${styles.status} ${styles[teacher.status]}`}>
                      {teacherStatusLabels[teacher.status]}
                    </span>
                  </div>
                ))
              ) : (
                <span className={`${styles.status} ${styles.missing}`}>
                  Pengawas belum ditugaskan
                </span>
              )}
            </div>
            {activity.session_status && <small>{sessionLabels[activity.session_status]}</small>}
          </article>
        ))}
        {!shown.length && (
          <div className={`${styles.panel} ${styles.activityEmpty}`}>
            <EmptyState>Belum ada kegiatan hari ini.</EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
