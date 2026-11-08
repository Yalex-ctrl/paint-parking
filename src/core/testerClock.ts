import { addDays } from './dates';

/**
 * The tester tool "advance the clock": the game reads the real clock everywhere, so time is moved forward by moving every date that
 * was kept BACK by the same amount (the time stamps in milliseconds, and the days written "2026-11-02"). A countdown that was running
 * is then over by that much, a daily reward that was taken yesterday can be taken again... Pure: the profile in, the profile out.
 */
const EPOCH_MIN = 1_000_000_000_000; // 2001, in ms: a number above it is a time stamp
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function shiftTime<T>(value: T, ms: number): T {
  const days = Math.round(ms / 86_400_000);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return v > EPOCH_MIN ? v - ms : v;
    if (typeof v === 'string') return DAY.test(v) && days > 0 ? addDays(v as never, -days) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
