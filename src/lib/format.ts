function parseTimestamp(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string) {
  const date = parseTimestamp(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

export function formatTime(value: string | null | undefined, timeZone = 'Asia/Jakarta') {
  const date = parseTimestamp(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}
