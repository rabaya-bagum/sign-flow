export type RelativeTime =
  | { kind: 'justNow' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'yesterday' }
  | { kind: 'days'; count: number }
  | { kind: 'date'; date: Date };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Buckets a timestamp relative to `now` for compact list labels. */
export function relativeTime(value: Date | string, now: Date = new Date()): RelativeTime {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return { kind: 'justNow' };
  if (diff < HOUR) return { kind: 'minutes', count: Math.floor(diff / MINUTE) };
  const calendarDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (calendarDays === 0) return { kind: 'hours', count: Math.floor(diff / HOUR) };
  if (calendarDays === 1) return { kind: 'yesterday' };
  if (calendarDays < 7) return { kind: 'days', count: calendarDays };
  return { kind: 'date', date };
}
