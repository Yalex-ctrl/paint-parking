import { t } from './i18n';

/**
 * How a time left is written everywhere: "12:34" under an hour, "3 h 20" under a day, "2 j 5 h" beyond. Rounded up to the second
 * (a countdown never shows 00:00 while there is still time).
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (total < 3600) return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours < 24) return t('time.hm', { h: hours, m: pad(minutes) });
  return t('time.dh', { d: Math.floor(hours / 24), h: hours % 24 });
}

/** Milliseconds from `now` to the next local midnight (when the counters of the day start again). */
export function msUntilMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}
