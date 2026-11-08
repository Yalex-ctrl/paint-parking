/**
 * Work that must not happen while the ball crosses from one level to the next: the saves (the whole profile written to the phone's
 * storage), the analytics, the freeing of the level that was left. It is queued, and runs only when nothing is holding the queue:
 * the screen holds it from the moment the ball leaves the board and lets it go once the ball has landed on the next level, and the
 * work then runs one piece at a time, a few milliseconds apart, so that no frame has to pay for several of them at once.
 */
import { benchTimed } from '../render/bench';

const GAP_MS = 24;
/** A hold that is never released (a bug elsewhere) lets go by itself after this long. */
const WATCHDOG_MS = 8000;

const queue: (() => void)[] = [];
let holds = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;

function pump(delay: number) {
  if (timer || holds > 0 || queue.length === 0) return;
  timer = setTimeout(() => {
    timer = null;
    if (holds > 0) return;
    const job = queue.shift();
    try {
      if (job) benchTimed('idle job', job);
    } catch {
      // A failed save must never take the game down.
    }
    pump(GAP_MS);
  }, delay);
}

/** Queues `fn` for when the game is quiet (right away when it already is, though never inside the caller's own frame). */
export function runWhenIdle(fn: () => void): void {
  queue.push(fn);
  pump(0);
}

/** The ball is leaving: nothing queued runs until `releaseIdle`. Holds count: every `holdIdle` needs its `releaseIdle`. */
export function holdIdle(): void {
  holds++;
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    holds = 0;
    pump(GAP_MS);
  }, WATCHDOG_MS);
}

/** The ball has landed: the queue starts again after `settleMs` (the new level gets a moment to be on screen first). */
export function releaseIdle(settleMs = 350): void {
  holds = Math.max(0, holds - 1);
  if (holds === 0) {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    pump(settleMs);
  }
}

export const isIdleHeld = (): boolean => holds > 0;
export const idleQueueLength = (): number => queue.length;

/** Runs everything that is waiting, now (the app is about to go to the background: nothing may be lost). */
export function flushIdleQueue(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      job?.();
    } catch {
      // Ignored: see above.
    }
  }
}

/** For tests. */
export function resetIdleQueue(): void {
  queue.length = 0;
  holds = 0;
  if (timer) clearTimeout(timer);
  if (watchdog) clearTimeout(watchdog);
  timer = null;
  watchdog = null;
}
