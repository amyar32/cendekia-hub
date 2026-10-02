'use client';

import { Avatar, Image } from '@mantine/core';

import {
  IconAlertTriangle,
  IconBell,
  IconBook2,
  IconBroadcast,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconDeviceDesktop,
  IconSchool,
  IconUsers,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LIVE_PAGE_DURATION,
  livePage,
  liveScenePageCounts,
  nextLiveFrame,
  type LiveFrame,
  type LiveDisplaySnapshot,
  type LivePerson,
  type LiveSchedule,
} from '@/lib/live-display';
import styles from '@/features/live/components/live-display.module.css';
import { ActivityScene } from './activity-scene';
import { EmptyState } from './empty-state';
import { HalaqahScene } from './halaqah-scene';

const POLL_INTERVAL = 5_000;
const sceneNames = ['Ringkasan', 'Kehadiran', 'Jadwal & guru', 'Kegiatan sekolah', 'Halaqah'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const selected = parts.length === 1 ? parts : [parts[0], parts.at(-1)!];
  return selected
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('id-ID');
}

function formatClock(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatCheckin(value: string | null, timezone: string) {
  if (!value) return 'Belum check-in';
  const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.valueOf())) return value.slice(11, 16);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(parsed);
}

function attendanceRate(present: number, late: number, total: number) {
  return total ? Math.round(((present + late) / total) * 100) : 0;
}

function statusLabel(status: LivePerson['status'] | LiveSchedule['teacher_status']) {
  if (status === 'present') return 'Hadir';
  if (status === 'late') return 'Terlambat';
  if (status === 'absent') return 'Tidak hadir';
  return 'Belum check-in';
}

function PersonAvatar({ person, size = 42 }: { person: LivePerson; size?: number }) {
  return (
    <Avatar src={person.photo_url || undefined} size={size} radius="xl" color="brand">
      {initials(person.name)}
    </Avatar>
  );
}

function StatusPill({ status }: { status: LivePerson['status'] | LiveSchedule['teacher_status'] }) {
  return <span className={`${styles.status} ${styles[status]}`}>{statusLabel(status)}</span>;
}

function AttendanceCard({
  icon: Icon,
  label,
  data,
}: {
  icon: typeof IconUsers;
  label: string;
  data: LiveDisplaySnapshot['attendance']['students'];
}) {
  const rate = attendanceRate(data.present, data.late, data.total);
  return (
    <article className={styles.attendanceCard}>
      <div className={styles.cardTitle}>
        <span className={styles.iconBox}>
          <Icon size={23} />
        </span>
        <span>{label}</span>
        <strong>{rate}%</strong>
      </div>
      <div className={styles.metricLine}>
        <strong>{data.present + data.late}</strong>
        <span>dari {data.total} telah check-in</span>
      </div>
      <div className={styles.progress}>
        <span style={{ width: `${rate}%` }} />
      </div>
      <div className={styles.miniStats}>
        <span>
          <i className={styles.dotGreen} />
          {data.present} tepat waktu
        </span>
        <span>
          <i className={styles.dotAmber} />
          {data.late} terlambat
        </span>
        <span>
          <i className={styles.dotRed} />
          {data.absent + data.missing} belum hadir
        </span>
      </div>
    </article>
  );
}

function OverviewScene({ data, page }: { data: LiveDisplaySnapshot; page: number }) {
  const slot = data.bell.current_slot;
  return (
    <div className={styles.scene}>
      <section className={styles.heroGrid}>
        <article className={styles.periodCard}>
          <div className={styles.eyebrow}>
            <IconBook2 size={18} /> SLOT WAKTU SAAT INI
          </div>
          <div className={styles.periodMain}>
            <div>
              <h2>{slot?.name || 'Di luar slot bel'}</h2>
              <p>
                {slot
                  ? `${slot.start_time} — ${slot.end_time}`
                  : 'Tidak ada slot waktu yang sedang berjalan'}
              </p>
            </div>
            <div className={styles.liveClassCount}>
              <strong>
                {data.activities.filter((activity) => activity.phase === 'current').length}
              </strong>
              <span>kegiatan aktif</span>
            </div>
          </div>
        </article>
        <CountdownCard data={data} />
        <AttendanceCard icon={IconUsers} label="Kehadiran murid" data={data.attendance.students} />
        <AttendanceCard icon={IconSchool} label="Guru terjadwal" data={data.attendance.teachers} />
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.iconBox}>
                <IconCalendarTime size={21} />
              </span>
              <h3>Jadwal saat ini</h3>
            </div>
            <span>{data.current_schedules.length} kegiatan</span>
          </header>
          <div className={styles.scheduleTable}>
            {data.current_schedules.length ? (
              livePage(data.current_schedules, page, 5).map((schedule) => (
                <div className={styles.scheduleRow} key={schedule.id}>
                  <div className={styles.timeBlock}>
                    {schedule.start_time}
                    <small>{schedule.end_time}</small>
                  </div>
                  <div>
                    <strong>{schedule.subject_name}</strong>
                    <span>{schedule.subject_code}</span>
                  </div>
                  <div className={styles.classCell}>
                    <strong>{schedule.class_name.trim()}</strong>
                  </div>
                  <div className={styles.teacherCell}>
                    <Avatar
                      src={schedule.teacher_photo_url || undefined}
                      size={34}
                      radius="xl"
                      color="brand"
                    >
                      {initials(schedule.teacher_name)}
                    </Avatar>
                    <span>{schedule.teacher_name}</span>
                  </div>
                  <StatusPill status={schedule.teacher_status} />
                </div>
              ))
            ) : (
              <EmptyState>Tidak ada kelas yang sedang berlangsung.</EmptyState>
            )}
          </div>
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={`${styles.iconBox} ${styles.alertIcon}`}>
                <IconAlertTriangle size={21} />
              </span>
              <h3>Perlu perhatian</h3>
            </div>
            <span>{data.notices.length} informasi</span>
          </header>
          <div className={styles.noticeList}>
            {livePage(data.notices, page, 3).map((notice, index) => (
              <div
                className={`${styles.notice} ${styles[notice.tone]}`}
                key={`${notice.title}-${index}`}
              >
                <i />
                <div>
                  <strong>{notice.title}</strong>
                  <span>{notice.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
      <RecentStrip
        people={livePage(data.recent_checkins, page, 3)}
        timezone={data.school.timezone}
      />
    </div>
  );
}

function CountdownCard({ data }: { data: LiveDisplaySnapshot }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const next = data.bell.next_slot;
  const currentClock = formatClock(now, data.school.timezone).split('.').join(':');
  const [hour, minute, second] = currentClock.split(':').map(Number);
  const currentSeconds = hour * 3600 + minute * 60 + second;
  const [nextHour, nextMinute] = (next?.start_time || '00:00').split(':').map(Number);
  const remaining = Math.max(0, nextHour * 3600 + nextMinute * 60 - currentSeconds);
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  return (
    <article className={styles.countdownCard}>
      <div className={styles.eyebrow}>
        <IconBell size={18} /> MENUJU BEL BERIKUTNYA
      </div>
      <div className={styles.countdownMain}>
        <strong>{next ? countdown : '--:--'}</strong>
        <div>
          <b>{next?.start_time || 'Selesai'}</b>
          <span>{next?.name || 'Tidak ada jadwal berikutnya'}</span>
        </div>
      </div>
      <div className={styles.bellState}>
        <i className={data.school.bell_enabled ? styles.activeBell : ''} /> Bel otomatis{' '}
        {data.school.bell_enabled ? 'aktif' : 'nonaktif'}
      </div>
    </article>
  );
}

function RecentStrip({ people, timezone }: { people: LivePerson[]; timezone: string }) {
  return (
    <section className={styles.recentPanel}>
      <div className={styles.recentHeading}>
        <IconClock size={22} />
        <div>
          <strong>Baru saja check-in</strong>
          <span>Diperbarui otomatis</span>
        </div>
      </div>
      <div className={styles.recentPeople}>
        {people.length ? (
          people.map((person) => (
            <div className={styles.recentPerson} key={person.id}>
              <PersonAvatar person={person} />
              <div>
                <strong>{person.name}</strong>
                <span>
                  {person.group_label} · {formatCheckin(person.checked_in_at, timezone)}
                </span>
              </div>
              <StatusPill status={person.status} />
            </div>
          ))
        ) : (
          <EmptyState>Belum ada check-in hari ini.</EmptyState>
        )}
      </div>
    </section>
  );
}

function PeopleList({
  people,
  timezone,
  missing = false,
}: {
  people: LivePerson[];
  timezone: string;
  missing?: boolean;
}) {
  if (!people.length)
    return <EmptyState>{missing ? 'Semua sudah check-in.' : 'Belum ada aktivitas.'}</EmptyState>;
  return (
    <div className={styles.peopleList}>
      {people.map((person) => (
        <div className={styles.personRow} key={person.id}>
          <PersonAvatar person={person} size={46} />
          <div className={styles.personIdentity}>
            <strong>{person.name}</strong>
            <span>
              {person.group_label} · {person.code || 'Tanpa nomor induk'}
            </span>
          </div>
          <div className={styles.personTime}>
            {missing ? (
              <StatusPill status="missing" />
            ) : (
              <>
                <strong>{formatCheckin(person.checked_in_at, timezone)}</strong>
                <StatusPill status={person.status} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttendanceScene({ data, page }: { data: LiveDisplaySnapshot; page: number }) {
  return (
    <div className={styles.scene}>
      <section className={styles.sceneHeading}>
        <div>
          <span className={styles.largeIcon}>
            <IconUsers size={30} />
          </span>
          <div>
            <span>MONITOR KEHADIRAN</span>
            <h2>Siapa yang sudah dan belum check-in</h2>
          </div>
        </div>
        <div className={styles.headingStats}>
          <span>
            <b>{data.attendance.students.present + data.attendance.students.late}</b>Murid hadir
          </span>
          <span>
            <b>{data.attendance.students.missing + data.attendance.students.absent}</b>Belum hadir
          </span>
          <span>
            <b>{data.attendance.students.late}</b>Terlambat
          </span>
        </div>
      </section>
      <section className={styles.detailGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.iconBox}>
                <IconCheck size={21} />
              </span>
              <h3>Check-in terbaru</h3>
            </div>
            <span>{data.recent_checkins.length} terbaru</span>
          </header>
          <PeopleList
            people={livePage(data.recent_checkins, page, 6)}
            timezone={data.school.timezone}
          />
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={`${styles.iconBox} ${styles.alertIcon}`}>
                <IconAlertTriangle size={21} />
              </span>
              <h3>Murid belum check-in</h3>
            </div>
            <span>{data.attendance.students.missing} orang</span>
          </header>
          <PeopleList
            people={livePage(data.missing_students, page, 6)}
            timezone={data.school.timezone}
            missing
          />
        </article>
        <article className={`${styles.panel} ${styles.teacherMissingPanel}`}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.iconBox}>
                <IconSchool size={21} />
              </span>
              <h3>Guru terjadwal belum check-in</h3>
            </div>
            <span>{data.attendance.teachers.missing}</span>
          </header>
          <PeopleList
            people={livePage(data.missing_teachers, page, 6)}
            timezone={data.school.timezone}
            missing
          />
        </article>
      </section>
    </div>
  );
}

function ScheduleScene({ data, page }: { data: LiveDisplaySnapshot; page: number }) {
  const upcoming = data.day_schedules.filter((s) => s.phase === 'upcoming');
  const shown = livePage(upcoming, page, 6);
  return (
    <div className={styles.scene}>
      <section className={styles.sceneHeading}>
        <div>
          <span className={styles.largeIcon}>
            <IconCalendarTime size={30} />
          </span>
          <div>
            <span>JADWAL PELAJARAN BERIKUTNYA</span>
            <h2>Kelas dan kesiapan guru</h2>
          </div>
        </div>
        <div className={styles.headingStats}>
          <span>
            <b>{upcoming.length}</b>Jadwal berikutnya
          </span>
          <span>
            <b>{data.suspended_lessons}</b>Ditangguhkan saat ujian
          </span>
        </div>
      </section>
      <article className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <span className={styles.iconBox}>
              <IconBook2 size={21} />
            </span>
            <h3>Agenda pelajaran</h3>
          </div>
          <span>{upcoming.length} jadwal · berganti otomatis</span>
        </header>
        <div className={styles.scheduleTable}>
          {shown.length ? (
            shown.map((s) => (
              <div className={styles.scheduleRow} key={s.id}>
                <div className={styles.timeBlock}>
                  {s.start_time}
                  <small>{s.end_time}</small>
                </div>
                <div>
                  <strong>{s.subject_name}</strong>
                  <span>{s.slot_name}</span>
                </div>
                <div className={styles.classCell}>
                  <strong>{s.class_name.trim()}</strong>
                </div>
                <div className={styles.teacherCell}>
                  <Avatar
                    src={s.teacher_photo_url || undefined}
                    size={36}
                    radius="xl"
                    color="brand"
                  >
                    {initials(s.teacher_name)}
                  </Avatar>
                  <span>{s.teacher_name}</span>
                </div>
                <StatusPill status={s.teacher_status} />
              </div>
            ))
          ) : (
            <EmptyState>Tidak ada pelajaran berikutnya hari ini.</EmptyState>
          )}
        </div>
      </article>
    </div>
  );
}

export function LiveDisplay() {
  const [snapshot, setSnapshot] = useState<LiveDisplaySnapshot | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [frame, setFrame] = useState<LiveFrame>({ scene: 0, pages: [0, 0, 0, 0, 0], step: 0 });
  const [now, setNow] = useState(() => new Date());
  const [tickerIndex, setTickerIndex] = useState(0);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const scene = frame.scene;
  const counts = snapshot ? liveScenePageCounts(snapshot) : [1, 1, 1, 1, 1];
  const pageCount = counts[scene];
  const page = frame.pages[scene] % pageCount;
  const hasSnapshot = Boolean(snapshot);

  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/live', {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      if (response.status === 401)
        throw new Error('Sesi layar berakhir. Operator perlu masuk kembali.');
      if (response.status === 403) throw new Error('Akun ini tidak memiliki akses Live TV.');
      if (!response.ok) throw new Error('Snapshot tidak tersedia');
      const data: LiveDisplaySnapshot = await response.json();
      if (controller.signal.aborted) return;
      setSnapshot(data);
      setConnection('live');
      setError('');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setConnection('offline');
      const accessError =
        cause instanceof Error &&
        (cause.message.startsWith('Sesi layar') || cause.message.startsWith('Akun ini'));
      setError(
        accessError ? cause.message : 'Koneksi terputus. Menghubungkan kembali secara otomatis…',
      );
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const poller = window.setInterval(() => void load(), POLL_INTERVAL);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poller);
      request.current?.abort();
      request.current = null;
    };
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!hasSnapshot) return;
    const rotation = window.setTimeout(
      () => setFrame((current) => nextLiveFrame(current, pageCount)),
      LIVE_PAGE_DURATION,
    );
    return () => window.clearTimeout(rotation);
  }, [frame, hasSnapshot, pageCount]);
  useEffect(() => {
    const ticker = window.setInterval(() => setTickerIndex((current) => current + 1), 6000);
    return () => window.clearInterval(ticker);
  }, []);
  const tickerText = useMemo(
    () =>
      snapshot?.ticker.length
        ? snapshot.ticker[tickerIndex % snapshot.ticker.length]
        : 'Menunggu data aktivitas sekolah…',
    [snapshot, tickerIndex],
  );

  if (!snapshot)
    return (
      <main className={styles.loading}>
        <span className={styles.loadingMark}>
          <IconBroadcast size={34} />
        </span>
        <h1>Live Report</h1>
        <p role={error ? 'alert' : undefined}>
          {error || 'Menyusun informasi operasional sekolah…'}
        </p>
        <div className={styles.loadingBar}>
          <i />
        </div>
        {error && <small>Mencoba kembali setiap 5 detik.</small>}
      </main>
    );

  return (
    <main className={styles.display}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          {snapshot.school.logo_url ? (
            <Image
              src={snapshot.school.logo_url}
              alt={`Logo ${snapshot.school.name}`}
              className={styles.schoolLogo}
            />
          ) : (
            <span className={styles.brandMark}>
              <IconBroadcast size={28} />
            </span>
          )}
          <div>
            <h1>
              Live <b>Report</b>
            </h1>
            <span>{snapshot.school.name}</span>
          </div>
        </div>
        <div className={styles.headerCenter}>
          <span>{formatDate(now, snapshot.school.timezone)}</span>
          <strong>{formatClock(now, snapshot.school.timezone)}</strong>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.academic}>
            <span>TAHUN AJARAN</span>
            <strong>{snapshot.academic.year}</strong>
            <small>{snapshot.academic.semester}</small>
          </div>
          <div className={`${styles.connection} ${styles[connection]}`}>
            {connection === 'live' ? <IconWifi size={18} /> : <IconWifiOff size={18} />}
            <span>
              {connection === 'live'
                ? 'LIVE'
                : connection === 'connecting'
                  ? 'MENGHUBUNGKAN'
                  : 'TERPUTUS'}
            </span>
          </div>
        </div>
      </header>
      {error && (
        <div className={styles.errorBanner} role="alert">
          <IconAlertTriangle size={18} />
          <span>{error} Menampilkan data terakhir.</span>
          <strong>Data {formatCheckin(snapshot.generated_at, snapshot.school.timezone)}</strong>
        </div>
      )}
      <div className={styles.viewport} key={`${scene}-${page}`}>
        {scene === 0 && <OverviewScene data={snapshot} page={page} />}
        {scene === 1 && <AttendanceScene data={snapshot} page={page} />}
        {scene === 2 && <ScheduleScene data={snapshot} page={page} />}
        {scene === 3 && <ActivityScene data={snapshot} page={page} />}
        {scene === 4 && <HalaqahScene data={snapshot} page={page} />}
      </div>
      <div className={styles.rotationProgress} key={`progress-${scene}-${page}-${frame.step}`}>
        <i style={{ animationDuration: `${LIVE_PAGE_DURATION}ms` }} />
      </div>
      <footer className={styles.footer}>
        <div className={styles.tickerLabel}>
          <IconBroadcast size={17} /> INFO TERKINI
        </div>
        <div className={styles.ticker}>
          <span key={tickerText}>{tickerText}</span>
        </div>
        <div className={styles.sceneControls}>
          <IconDeviceDesktop size={17} />
          <span>{sceneNames[scene]}</span>
          <span>
            Halaman {page + 1}/{pageCount}
          </span>
          {sceneNames.map((name, index) => (
            <i key={name} aria-label={name} className={index === scene ? styles.activeScene : ''} />
          ))}
        </div>
      </footer>
    </main>
  );
}
