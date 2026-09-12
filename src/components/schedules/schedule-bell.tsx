'use client';

import { useEffect, useRef, useState } from 'react';
import { playBellSound } from '@/lib/schedule-bell-client';

type BellConfiguration = {
  school_id: string;
  enabled: boolean;
  timezone: string;
  weekdays: number[];
  start_times: string[];
  sound_url: string;
};

const weekdays: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function schoolClock(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
    weekday: weekdays[value.weekday],
  };
}

export function ScheduleBell() {
  const [configuration, setConfiguration] = useState<BellConfiguration | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/modules/schedules/bell')
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as BellConfiguration;
        })
        .then((result) => active && result && setConfiguration(result))
        .catch(() => undefined);
    void load();
    const refresh = window.setInterval(load, 60_000);
    window.addEventListener('schedule-bell-config-changed', load);
    return () => {
      active = false;
      window.clearInterval(refresh);
      window.removeEventListener('schedule-bell-config-changed', load);
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (!audioRef.current) audioRef.current = new window.AudioContext();
      void audioRef.current.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (audioRef.current) void audioRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!configuration?.enabled) return;
    const check = () => {
      const clock = schoolClock(configuration.timezone);
      if (
        !configuration.weekdays.includes(clock.weekday) ||
        !configuration.start_times.includes(clock.time)
      )
        return;
      const audio = audioRef.current;
      if (!audio || audio.state !== 'running') return;
      const ringKey = `${configuration.school_id}:${clock.date}:${clock.time}`;
      if (localStorage.getItem('schedule-bell-last-ring') === ringKey) return;
      localStorage.setItem('schedule-bell-last-ring', ringKey);
      const customAudio = customAudioRef.current;
      if (configuration.sound_url && customAudio) {
        customAudio.currentTime = 0;
        void customAudio.play().catch(() => playBellSound(audio));
      } else {
        playBellSound(audio);
      }
    };
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [configuration]);

  return configuration?.sound_url ? (
    <audio ref={customAudioRef} src={configuration.sound_url} preload="auto" hidden />
  ) : null;
}
