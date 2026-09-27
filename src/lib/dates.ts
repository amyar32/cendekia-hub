const ISO_DATE_SUFFIX = 'T00:00:00Z';

export function isoDateToUtc(value: string) {
  return new Date(`${value}${ISO_DATE_SUFFIX}`);
}

/** Returns an ISO weekday where Monday is 1 and Sunday is 7. */
export function isoWeekday(value: string) {
  const weekday = isoDateToUtc(value).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
