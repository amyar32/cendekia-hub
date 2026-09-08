'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Group, Select, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconCamera,
  IconCheck,
  IconClock,
  IconDoorExit,
  IconKeyboard,
  IconQrcode,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import styles from './checkin-scanner.module.css';

type Student = { name: string; nis: string; photo_url: string; class_name: string };
type Recent = Student & { id: string; status: 'present' | 'late'; checked_in_at: string };
type Summary = { total: number; present: number; late: number };
type ScanResult = {
  outcome: 'success' | 'duplicate';
  student: Student;
  status: 'present' | 'late';
  checked_in_at: string;
  summary: Summary;
  recent: Recent[];
};
type Config = {
  school: { name: string; logo_url: string; timezone: string };
  date: string;
  late_after: string;
  summary: Summary;
  recent: Recent[];
};

const emptySummary = { total: 0, present: 0, late: 0 };

export function CheckinScanner({ operatorName }: { operatorName: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanningRef = useRef(false);
  const lastScanRef = useRef({ code: '', at: 0 });
  const clearResultRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [clock, setClock] = useState(new Date());
  const [sound, setSound] = useState(true);

  useEffect(() => {
    queueMicrotask(() => setSound(localStorage.getItem('checkin-scanner-sound') !== 'off'));
    fetch('/api/modules/student-checkins/scanner')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body as Config;
      })
      .then((body) => {
        setConfig(body);
        setSummary(body.summary);
        setRecent(body.recent);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Data scanner gagal dimuat.'),
      );
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      const code = rawCode.trim();
      if (!code || scanningRef.current) return;
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 5000) return;
      scanningRef.current = true;
      lastScanRef.current = { code, at: now };
      setError('');
      try {
        const response = await fetch('/api/modules/student-checkins/scanner', {
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
        setTimeout(() => {
          scanningRef.current = false;
        }, 700);
      }
    },
    [beep],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    const reader = new BrowserQRCodeReader();
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
      audio: false,
    };

    async function startScanner() {
      const video = videoRef.current;
      if (!video) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        if (cancelled) return;

        controls = await reader.decodeFromVideoElement(video, (decoded) => {
          if (decoded) void submitCode(decoded.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        setCameraError('');
        controlsRef.current = controls;
        const inputs = await BrowserQRCodeReader.listVideoInputDevices();
        if (!cancelled)
          setDevices(
            inputs.map((item, index) => ({
              value: item.deviceId,
              label: item.label || `Kamera ${index + 1}`,
            })),
          );
      } catch {
        if (!cancelled)
          setCameraError(
            'Kamera tidak dapat dibuka. Izinkan akses kamera lalu muat ulang halaman.',
          );
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      controls?.stop();
      if (controlsRef.current === controls) controlsRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video?.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [deviceId, submitCode]);

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
            <Text className={styles.subtitle}>GERBANG KEHADIRAN SISWA</Text>
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
          <div className={styles.camera}>
            <video ref={videoRef} muted playsInline />
            <div className={styles.cameraShade} />
            <div className={styles.frame}>
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className={styles.scanLine} />
            {!result && !error && (
              <div className={styles.prompt}>
                <IconCamera size={22} />
                <span>Arahkan QR kartu siswa ke kotak</span>
              </div>
            )}
            {cameraError && (
              <div className={styles.cameraMessage}>
                <IconAlertTriangle size={32} />
                <Text>{cameraError}</Text>
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
                    <Text className={styles.studentName}>{result.student.name}</Text>
                    <Text className={styles.resultMessage}>
                      {result.student.nis} · {result.student.class_name}
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
          <div className={styles.cameraFooter}>
            <Group gap="xs">
              <span className={styles.liveDot} />
              <Text>Scanner aktif</Text>
            </Group>
            {devices.length > 1 ? (
              <Select
                size="xs"
                data={devices}
                value={deviceId}
                placeholder="Pilih kamera"
                onChange={setDeviceId}
                w={220}
              />
            ) : (
              <Text>{operatorName}</Text>
            )}
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
          </div>
          <div className={styles.recentHeader}>
            <div>
              <Text>Baru saja hadir</Text>
              <span>Diperbarui otomatis</span>
            </div>
            <Link href="/student-checkins">Lihat daftar</Link>
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
                      {item.class_name || 'Tanpa rombel'} · {item.nis}
                    </span>
                  </div>
                  <div className={styles.recentTime}>
                    {new Intl.DateTimeFormat('id-ID', {
                      timeZone,
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(`${item.checked_in_at}Z`))}
                    <span className={item.status === 'late' ? styles.late : ''}>
                      {item.status === 'late' ? 'Terlambat' : 'Hadir'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Belum ada siswa yang cek-in hari ini.</div>
            )}
          </div>
          <form className={styles.manual} onSubmit={submitManual}>
            <IconKeyboard size={18} />
            <TextInput
              variant="unstyled"
              placeholder="Ketik NIS jika kartu bermasalah"
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
