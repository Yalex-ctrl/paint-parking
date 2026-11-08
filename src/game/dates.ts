/**
 * Calendar days as plain 'YYYY-MM-DD' strings in the player's LOCAL time zone. Everything about the
 * daily challenge, streaks and rewards is based on these keys, never on instants: that way a day is a
 * day wherever the player is, daylight-saving changes cannot add or remove one, and two players on the
 * same calendar date see the same daily level.
 */
export type DayKey = string;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The local calendar day of a moment. */
export function dayKeyOf(date: Date): DayKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The calendar day at a given instant in a time zone with the given UTC offset (minutes, east positive).
 * The app itself always uses the device's local day (`dayKeyOf`); this exists so that behaviour across
 * time zones can be tested, and to reason about "the same instant, a different day".
 */
export function dayKeyAt(epochMs: number, utcOffsetMinutes: number): DayKey {
  const shifted = new Date(epochMs + utcOffsetMinutes * 60_000);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function parseDay(key: DayKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Whole days since 1970-01-01. Computed in UTC, so there is no daylight-saving drift. */
export function dayNumber(key: DayKey): number {
  const { year, month, day } = parseDay(key);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromDayNumber(n: number): DayKey {
  const d = new Date(n * 86_400_000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (key: DayKey, n: number): DayKey => fromDayNumber(dayNumber(key) + n);

/** `b - a` in days (positive when b is later). */
export const daysBetween = (a: DayKey, b: DayKey): number => dayNumber(b) - dayNumber(a);

/** 1..366 */
export function dayOfYear(key: DayKey): number {
  const { year } = parseDay(key);
  return daysBetween(`${pad(year, 4)}-01-01`, key) + 1;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayMonday0(key: DayKey): number {
  const { year, month, day } = parseDay(key);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}
