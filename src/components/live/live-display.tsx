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
  IconDoorExit,
  IconMaximize,
  IconSchool,
  IconUsers,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveDisplaySnapshot, LivePerson, LiveSchedule } from '@/lib/live-display';
import styles from './live-display.module.css';

const SCENE_DURATION = 15_000;
const POLL_INTERVAL = 5_000;
const sceneNames = ['Ringkasan', 'Kehadiran', 'Jadwal & guru'];

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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <IconCheck size={34} stroke={1.8} />
      {children}
    </div>
  );
}

function OverviewScene({ data }: { data: LiveDisplaySnapshot }) {
  const slot = data.bell.current_slot;
  return (
    <div className={styles.scene}>
      <section className={styles.heroGrid}>
        <article className={styles.periodCard}>
          <div className={styles.eyebrow}>
            <IconBook2 size={18} /> SEDANG BERLANGSUNG
          </div>
          <div className={styles.periodMain}>
            <div>
              <h2>{slot?.name || 'Belum ada kegiatan'}</h2>
              <p>
                {slot
                  ? `${slot.start_time} — ${slot.end_time}`
                  : 'Jadwal pelajaran hari ini belum dimulai'}
              </p>
            </div>
            <div className={styles.liveClassCount}>
              <strong>{data.current_schedules.length}</strong>
              <span>kelas aktif</span>
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
              data.current_schedules.slice(0, 5).map((schedule) => (
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
            {data.notices.slice(0, 4).map((notice, index) => (
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
      <RecentStrip people={data.recent_checkins.slice(0, 6)} timezone={data.school.timezone} />
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

function AttendanceScene({ data }: { data: LiveDisplaySnapshot }) {
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
          <PeopleList people={data.recent_checkins.slice(0, 8)} timezone={data.school.timezone} />
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
            people={data.missing_students.slice(0, 8)}
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
            people={data.missing_teachers.slice(0, 5)}
            timezone={data.school.timezone}
            missing
          />
        </article>
      </section>
    </div>
  );
}

function ScheduleScene({ data }: { data: LiveDisplaySnapshot }) {
  const remainingSchedules = data.day_schedules.filter((item) => item.phase === 'upcoming');
  const allAgendaSlots = Array.from(
    remainingSchedules
      .reduce((groups, schedule) => {
        const key = `${schedule.start_time}-${schedule.end_time}`;
        const slot = groups.get(key);
        if (slot) slot.schedules.push(schedule);
        else
          groups.set(key, {
            key,
            startTime: schedule.start_time,
            endTime: schedule.end_time,
            name: schedule.slot_name,
            schedules: [schedule],
          });
        return groups;
      }, new Map<string, { key: string; startTime: string; endTime: string; name: string; schedules: LiveSchedule[] }>())
      .values(),
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const agendaSlots = allAgendaSlots.slice(0, 6);
  const expandedSlot = agendaSlots[0];
  const denseAgenda = agendaSlots.length > 4;
  const upcomingMissingTeachers = Array.from(
    [...remainingSchedules]
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .reduce((teachers, schedule) => {
        if (schedule.teacher_status !== 'missing' || teachers.has(schedule.teacher_id)) {
          return teachers;
        }
        teachers.set(schedule.teacher_id, {
          id: schedule.teacher_id,
          name: schedule.teacher_name,
          code: schedule.subject_name,
          photo_url: schedule.teacher_photo_url,
          group_label: `${schedule.start_time} · ${schedule.class_name}`,
          person_type: 'teacher' as const,
          status: 'missing' as const,
          checked_in_at: null,
        });
        return teachers;
      }, new Map<string, LivePerson>())
      .values(),
  );
  return (
    <div className={styles.scene}>
      <section className={styles.sceneHeading}>
        <div>
          <span className={styles.largeIcon}>
            <IconCalendarTime size={30} />
          </span>
          <div>
            <span>OPERASIONAL AKADEMIK</span>
            <h2>Kegiatan dan kesiapan berikutnya</h2>
          </div>
        </div>
        <div className={styles.headingStats}>
          <span>
            <b>{allAgendaSlots.length}</b>Slot berikutnya
          </span>
          <span>
            <b>{remainingSchedules.length}</b>Kelas terjadwal
          </span>
          <span>
            <b>{upcomingMissingTeachers.length}</b>Guru berikutnya belum hadir
          </span>
        </div>
      </section>
      <section className={styles.scheduleSceneGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.iconBox}>
                <IconBook2 size={21} />
              </span>
              <h3>Kegiatan selanjutnya</h3>
            </div>
            <span>
              {allAgendaSlots.length > agendaSlots.length
                ? `${agendaSlots.length} dari ${allAgendaSlots.length} slot`
                : `${allAgendaSlots.length} slot`}{' '}
              · {remainingSchedules.length} jadwal
            </span>
          </header>
          <div className={`${styles.agendaGrid} ${denseAgenda ? styles.agendaDense : ''}`}>
            {agendaSlots.length ? (
              agendaSlots.map((slot) => {
                const expanded = slot.key === expandedSlot?.key;
                const missing = slot.schedules.filter(
                  (schedule) => schedule.teacher_status === 'missing',
                ).length;
                return (
                  <div
                    className={`${styles.timelineItem} ${expanded ? styles.timelineExpanded : ''} ${expanded && slot.schedules.length > 6 ? styles.timelineExpandedLarge : ''}`}
                    key={slot.key}
                  >
                    <div className={styles.agendaTime}>
                      <strong>{slot.startTime}</strong>
                      <span>{slot.endTime}</span>
                    </div>
                    <div className={styles.timelineRail}>
                      <i />
                    </div>
                    <div
                      className={`${styles.agendaCard} ${expanded ? styles.agendaUpcoming : styles.slotCompactCard}`}
                    >
                      <div className={styles.slotSummary}>
                        <span>{expanded ? 'JADWAL BERIKUTNYA' : slot.name}</span>
                        <strong>{slot.schedules.length} kelas</strong>
                        <small>
                          {slot.schedules.length - missing} guru siap
                          {missing ? ` · ${missing} belum check-in` : ''}
                        </small>
                      </div>
                      {expanded && (
                        <div className={styles.slotClassList}>
                          {slot.schedules.map((schedule) => (
                            <div className={styles.slotClassRow} key={schedule.id}>
                              <div>
                                <strong>{schedule.subject_name}</strong>
                                <span>Kelas {schedule.class_name}</span>
                              </div>
                              <div className={styles.slotClassTeacher}>
                                <Avatar
                                  src={schedule.teacher_photo_url || undefined}
                                  size={30}
                                  radius="xl"
                                  color="brand"
                                >
                                  {initials(schedule.teacher_name)}
                                </Avatar>
                                <span>{schedule.teacher_name}</span>
                                <i
                                  className={styles[schedule.teacher_status]}
                                  title={statusLabel(schedule.teacher_status)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState>Tidak ada kegiatan berikutnya hari ini.</EmptyState>
            )}
          </div>
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={`${styles.iconBox} ${styles.alertIcon}`}>
                <IconAlertTriangle size={21} />
              </span>
              <h3>Guru jadwal berikutnya</h3>
            </div>
            <span>Belum check-in</span>
          </header>
          <PeopleList
            people={upcomingMissingTeachers.slice(0, 7)}
            timezone={data.school.timezone}
            missing
          />
        </article>
      </section>
    </div>
  );
}

export function LiveDisplay({ operatorName }: { operatorName: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LiveDisplaySnapshot | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [scene, setScene] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [tickerIndex, setTickerIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/live', { cache: 'no-store' });
      if (!response.ok) throw new Error('Snapshot tidak tersedia');
      setSnapshot(await response.json());
      setConnection('live');
    } catch {
      setConnection('offline');
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const poller = window.setInterval(() => void load(), POLL_INTERVAL);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poller);
    };
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const rotation = window.setInterval(
      () => setScene((current) => (current + 1) % sceneNames.length),
      SCENE_DURATION,
    );
    return () => window.clearInterval(rotation);
  }, []);
  useEffect(() => {
    const ticker = window.setInterval(() => setTickerIndex((current) => current + 1), 6000);
    return () => window.clearInterval(ticker);
  }, []);

  const tickerText = useMemo(() => {
    if (!snapshot?.ticker.length) return 'Menunggu data aktivitas sekolah…';
    return snapshot.ticker[tickerIndex % snapshot.ticker.length];
  }, [snapshot, tickerIndex]);

  async function fullscreen() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  if (!snapshot) {
    return (
      <main className={styles.loading}>
        <span className={styles.loadingMark}>
          <IconBroadcast size={34} />
        </span>
        <h1>Live Report</h1>
        <p>Menyusun informasi operasional sekolah…</p>
        <div className={styles.loadingBar}>
          <i />
        </div>
      </main>
    );
  }

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
          <button
            className={styles.iconButton}
            onClick={() => void fullscreen()}
            title="Layar penuh"
          >
            <IconMaximize size={21} />
          </button>
          <button
            className={styles.iconButton}
            onClick={() => void logout()}
            title={`Keluar (${operatorName})`}
          >
            <IconDoorExit size={21} />
          </button>
        </div>
      </header>

      <div className={styles.viewport} key={scene}>
        {scene === 0 && <OverviewScene data={snapshot} />}
        {scene === 1 && <AttendanceScene data={snapshot} />}
        {scene === 2 && <ScheduleScene data={snapshot} />}
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
          {sceneNames.map((name, index) => (
            <button
              key={name}
              aria-label={`Tampilkan ${name}`}
              className={index === scene ? styles.activeScene : ''}
              onClick={() => setScene(index)}
            />
          ))}
        </div>
      </footer>
    </main>
  );
}
