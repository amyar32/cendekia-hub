'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Group, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconCheck,
  IconClock,
  IconDoorExit,
  IconKeyboard,
  IconQrcode,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import styles from './checkin-scanner.module.css';

type Student = { name: string; nis: string; photo_url: string; class_name: string };
type Recent = Student & {
  id: string;
  status: 'present' | 'late' | 'absent';
  checked_in_at: string;
  person_type: 'student' | 'teacher';
};
type Summary = { total: number; present: number; late: number; absent: number };
type ScanResult = {
  outcome: 'success' | 'duplicate';
  student: Student;
  status: 'present' | 'late';
  checked_in_at: string;
  summary: Summary;
  recent: Recent[];
  person_type: 'student' | 'teacher';
};
type Config = {
  school: { name: string; logo_url: string; timezone: string };
  date: string;
  late_after: string;
  summary: Summary;
  recent: Recent[];
};

const emptySummary = { total: 0, present: 0, late: 0, absent: 0 };
const completeCardPattern = /^cendekia:(?:teacher-)?checkin:[0-9a-f]{48}$/i;

function normalizeCardCode(rawCode: string) {
  const code = rawCode.trim();
  return completeCardPattern.test(code) ? code.toLowerCase() : code;
}

export function CheckinScanner({ operatorName }: { operatorName: string }) {
  const endpoint = '/api/modules/checkins/scanner';
  const router = useRouter();
  const scanningRef = useRef(false);
  const lastScanRef = useRef({ code: '', at: 0 });
  const clearResultRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hidBufferRef = useRef('');
  const hidBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [clock, setClock] = useState(new Date());
  const [sound, setSound] = useState(true);
  const [hidState, setHidState] = useState<'ready' | 'reading' | 'processing'>('ready');
  const [receivedCharacters, setReceivedCharacters] = useState(0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => setSound(localStorage.getItem('checkin-scanner-sound') !== 'off'));
    const loadDashboard = () =>
      fetch(endpoint)
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          return body as Config;
        })
        .then((body) => {
          if (!active) return;
          setConfig(body);
          setSummary(body.summary);
          setRecent(body.recent);
        })
        .catch((cause) => {
          if (active)
            setError(cause instanceof Error ? cause.message : 'Data scanner gagal dimuat.');
        });
    void loadDashboard();
    const timer = setInterval(() => setClock(new Date()), 1000);
    const dashboardTimer = setInterval(loadDashboard, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(dashboardTimer);
    };
  }, [endpoint]);

  const beep = useCallback((kind: 'success' | 'warning' | 'error') => {
    if (localStorage.getItem('checkin-scanner-sound') === 'off') return;
    const AudioContextClass = window.AudioContext;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = kind === 'success' ? 880 : kind === 'warning' ? 520 : 240;
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.2);
  }, []);

  const submitCode = useCallback(
    async (rawCode: string, manual = false) => {
      const code = normalizeCardCode(rawCode);
      if (!code || scanningRef.current) return;
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1500) return;
      scanningRef.current = true;
      setHidState('processing');
      lastScanRef.current = { code, at: now };
      setError('');
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, manual }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        const scan = body as ScanResult;
        setResult(scan);
        setSummary(scan.summary);
        setRecent(scan.recent);
        beep(scan.outcome === 'success' ? 'success' : 'warning');
        if (clearResultRef.current) clearTimeout(clearResultRef.current);
        clearResultRef.current = setTimeout(() => setResult(null), 4200);
      } catch (cause) {
        setResult(null);
        setError(cause instanceof Error ? cause.message : 'QR gagal diproses.');
        beep('error');
        setTimeout(() => setError(''), 4200);
      } finally {
        scanningRef.current = false;
        setHidState('ready');
      }
    },
    [beep, endpoint],
  );

  useEffect(() => {
    function clearHidBuffer() {
      hidBufferRef.current = '';
      setReceivedCharacters(0);
      setHidState('ready');
    }

    function handleHidKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (isEditable || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (!hidBufferRef.current) return;
        event.preventDefault();
        const code = hidBufferRef.current;
        if (hidBufferTimerRef.current) clearTimeout(hidBufferTimerRef.current);
        hidBufferRef.current = '';
        setReceivedCharacters(0);
        setHidState('ready');
        void submitCode(code);
        return;
      }

      if (event.key.length !== 1 || event.repeat) return;
      event.preventDefault();
      hidBufferRef.current += event.key;
      setReceivedCharacters(hidBufferRef.current.length);
      setHidState('reading');
      if (hidBufferTimerRef.current) clearTimeout(hidBufferTimerRef.current);
      if (completeCardPattern.test(hidBufferRef.current)) {
        const code = hidBufferRef.current;
        hidBufferRef.current = '';
        setReceivedCharacters(0);
        setHidState('ready');
        void submitCode(code);
        return;
      }
      hidBufferTimerRef.current = setTimeout(clearHidBuffer, 500);
    }

    window.addEventListener('keydown', handleHidKey, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleHidKey, { capture: true });
      if (hidBufferTimerRef.current) clearTimeout(hidBufferTimerRef.current);
    };
  }, [submitCode]);

  useEffect(
    () => () => {
      if (clearResultRef.current) clearTimeout(clearResultRef.current);
    },
    [],
  );

  function submitManual(event: FormEvent) {
    event.preventDefault();
    void submitCode(manualCode, true);
    setManualCode('');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const timeZone = config?.school.timezone || 'Asia/Jakarta';
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(clock);
  const fullDate = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(clock);

  return (
    <main className={styles.kiosk}>
      <header className={styles.header}>
        <Group gap="sm" wrap="nowrap">
          {config?.school.logo_url ? (
            <Image
              className={styles.logo}
              src={config.school.logo_url}
              alt="Logo sekolah"
              width={48}
              height={48}
              unoptimized
            />
          ) : (
            <div className={styles.logoFallback}>
              <IconQrcode />
            </div>
          )}
          <div>
            <Text className={styles.school}>{config?.school.name || 'Cendekia Hub'}</Text>
            <Text className={styles.subtitle}>GERBANG KEHADIRAN SEKOLAH</Text>
          </div>
        </Group>
        <div className={styles.clock}>
          <Text>{time}</Text>
          <span>{fullDate}</span>
        </div>
        <Group gap="xs" wrap="nowrap" className={styles.headerActions}>
          <Button
            variant="subtle"
            color="gray"
            aria-label={sound ? 'Matikan suara' : 'Nyalakan suara'}
            onClick={() => {
              const next = !sound;
              setSound(next);
              localStorage.setItem('checkin-scanner-sound', next ? 'on' : 'off');
            }}
          >
            {sound ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            aria-label="Layar penuh"
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
            }
          >
            <IconArrowsMaximize size={20} />
          </Button>
          <Button variant="subtle" color="gray" aria-label="Keluar" onClick={() => void logout()}>
            <IconDoorExit size={20} />
          </Button>
        </Group>
      </header>

      <section className={styles.workspace}>
        <div className={styles.scannerPanel}>
          <div className={styles.hidStage}>
            {!result && !error && (
              <div className={styles.hidContent}>
                <div
                  className={`${styles.hidIcon} ${hidState === 'reading' ? styles.hidReading : ''}`}
                >
                  <IconQrcode />
                  <span className={styles.hidPulse} />
                </div>
                <Text className={styles.hidTitle}>
                  {hidState === 'processing'
                    ? 'Memproses kartu…'
                    : hidState === 'reading'
                      ? 'Membaca kartu…'
                      : 'Scan kartu sekarang'}
                </Text>
                <Text className={styles.hidDescription}>
                  Arahkan kode QR pada kartu ke scanner. Jika kartu hilang atau rusak, hubungi admin
                  sekolah untuk mendapatkan kartu pengganti.
                </Text>
                <div className={styles.hidStatus} aria-live="polite">
                  <span className={styles.liveDot} />
                  {hidState === 'reading'
                    ? `${receivedCharacters} karakter diterima`
                    : hidState === 'processing'
                      ? 'Memverifikasi data'
                      : 'Siap memindai'}
                </div>
                <Text className={styles.hidHint}>
                  Scan gagal? Coba sekali lagi atau minta bantuan petugas untuk memasukkan NIS atau
                  kode guru.
                </Text>
              </div>
            )}
            {(result || error) && (
              <div
                className={`${styles.feedback} ${error ? styles.failed : result?.outcome === 'duplicate' ? styles.duplicate : styles.success}`}
              >
                {error ? (
                  <>
                    <div className={styles.resultIcon}>
                      <IconAlertTriangle />
                    </div>
                    <Text className={styles.resultTitle}>Kartu tidak dapat diproses</Text>
                    <Text className={styles.resultMessage}>{error}</Text>
                  </>
                ) : result ? (
                  <>
                    <Avatar
                      src={result.student.photo_url}
                      size={112}
                      radius="50%"
                      className={styles.resultPhoto}
                    />
                    <Text className={styles.resultTitle}>
                      {result.outcome === 'duplicate'
                        ? 'Sudah cek-in'
                        : result.status === 'late'
                          ? 'Cek-in terlambat'
                          : 'Selamat datang!'}
                    </Text>
                    <Text className={styles.personName}>{result.student.name}</Text>
                    <Text className={styles.resultMessage}>
                      {result.person_type === 'teacher' ? 'Guru' : 'Murid'} · {result.student.nis} ·{' '}
                      {result.student.class_name}
                    </Text>
                    <div className={styles.resultTime}>
                      {result.outcome === 'success' ? <IconCheck /> : <IconClock />}
                      {new Intl.DateTimeFormat('id-ID', {
                        timeZone,
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(`${result.checked_in_at}Z`))}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
          <div className={styles.scannerFooter}>
            <Group gap="xs">
              <span className={styles.liveDot} />
              <Text>Mode HID aktif</Text>
            </Group>
            <Text>{operatorName}</Text>
          </div>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.stats}>
            <div>
              <span>CHECK-IN HARI INI</span>
              <strong>{summary.total}</strong>
            </div>
            <div>
              <span>TEPAT WAKTU</span>
              <strong>{summary.present}</strong>
            </div>
            <div>
              <span>TERLAMBAT</span>
              <strong>{summary.late}</strong>
            </div>
            <div>
              <span>TIDAK HADIR</span>
              <strong>{summary.absent}</strong>
            </div>
          </div>
          <div className={styles.recentHeader}>
            <div>
              <Text>Aktivitas terbaru</Text>
              <span>Diperbarui otomatis</span>
            </div>
            <Link href="/checkins">Lihat daftar</Link>
          </div>
          <div className={styles.recentList}>
            {recent.length ? (
              recent.map((item) => (
                <div className={styles.recentItem} key={item.id}>
                  <Avatar src={item.photo_url} size={42} radius="xl">
                    {item.name[0]}
                  </Avatar>
                  <div>
                    <Text>{item.name}</Text>
                    <span>
                      {item.person_type === 'teacher' ? 'Guru' : item.class_name || 'Murid'} ·{' '}
                      {item.nis}
                    </span>
                  </div>
                  <div className={styles.recentTime}>
                    {new Intl.DateTimeFormat('id-ID', {
                      timeZone,
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(`${item.checked_in_at}Z`))}
                    <span
                      className={
                        item.status === 'late'
                          ? styles.late
                          : item.status === 'absent'
                            ? styles.absent
                            : ''
                      }
                    >
                      {item.status === 'late'
                        ? 'Terlambat'
                        : item.status === 'absent'
                          ? 'Tidak hadir'
                          : 'Hadir'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Belum ada murid atau guru yang check-in hari ini.</div>
            )}
          </div>
          <form className={styles.manual} onSubmit={submitManual}>
            <IconKeyboard size={18} />
            <TextInput
              variant="unstyled"
              placeholder="Ketik NIS atau Kode Guru jika kartu bermasalah"
              value={manualCode}
              onChange={(event) => setManualCode(event.currentTarget.value)}
            />
            <Button type="submit" size="xs" disabled={!manualCode.trim()}>
              Proses
            </Button>
          </form>
          <Text className={styles.cutoff}>
            Otomatis terlambat setelah pukul {config?.late_after || '07:15'}
          </Text>
        </aside>
      </section>
    </main>
  );
}
