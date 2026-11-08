/**
 * Development profiler for the things that happen during a slide: every event handler (a tile painted, a plip, a coin, the
 * counter...) is timed, and the slowest are listed in the dev badge, so a frame that goes over 20 ms can be put on a name.
 * In a production build `timed` is a plain call.
 */
import { benchRunning } from './bench';
import { traced, tracing } from './transitionTrace';

type Stat = { count: number; total: number; max: number };
const stats = new Map<string, Stat>();

/** Runs `fn`, and in development records how long it took under `name`. */
export function timed<T>(name: string, fn: () => T): T {
  if (tracing() || benchRunning()) return traced(name, fn);
  if (!__DEV__) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - t0;
    const s = stats.get(name) ?? { count: 0, total: 0, max: 0 };
    s.count++;
    s.total += ms;
    if (ms > s.max) s.max = ms;
    stats.set(name, s);
  }
}

/** The slowest handlers, as "tile 3.1 ms, plip 12.4 ms" (the longest single run of each), worst first. */
export function slowest(count = 4, overMs = 2): string {
  return [...stats.entries()]
    .filter(([, s]) => s.max >= overMs)
    .sort((a, b) => b[1].max - a[1].max)
    .slice(0, count)
    .map(([name, s]) => `${name} ${s.max.toFixed(1)}`)
    .join(' · ');
}

export function resetProfiler() {
  stats.clear();
}
