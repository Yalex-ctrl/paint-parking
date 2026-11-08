import { adsBannerHeight } from '../core/config/app';
import { LEVEL_COUNT } from '../game/levels';
import { levelOfId } from '../game/dailyLevels';
import type { Margins } from './cameraFit';
import { prepareLevelSteps, type PreparedLevel, type Viewport } from './prepare';

/** Free band for the board in a level: below the header and the stars, above the buttons (the same numbers the game screen uses). */
export const HEADER_H = 8 + 45 + 8 + 44 + 8 + 30; // three rows (see components/LevelHud.tsx)
export const STARS_H = 24;
export const BUTTONS_H = 80 + adsBannerHeight; // the two buttons, and the room kept for an ad banner
export const gameMargins = (insets: { top: number; bottom: number }): Margins => ({ top: insets.top + HEADER_H + STARS_H, bottom: insets.bottom + BUTTONS_H });

/** Levels prepared in advance: the one being played is not in here, the 12 after it are. The most ever kept (memory). */
export const AHEAD = 12;
const MAX_KEPT = AHEAD + 2;
/** Pause (ms) between two steps of a preparation, so the scene keeps drawing in between. */
const STEP_GAP_MS = 24;
/** The same while nothing moves on the screen (a pop-up, a reward, the menu, the tour): the preparation goes much faster. */
const IDLE_STEP_GAP_MS = 3;
let idle = false;
let paused = false;
const gap = () => (idle ? IDLE_STEP_GAP_MS : STEP_GAP_MS);

/**
 * Tells the cache that the screen is idle (a reward or a pop-up is showing, the player is reading): the levels ahead are then prepared
 * at full speed, so they are all there by the time the player is back to playing.
 */
export function setWarmIdle(on: boolean): void {
  idle = on;
}

/** The ball is crossing from one level to the next: nothing is prepared until it has landed (no work during the crossing). */
export function setWarmPaused(on: boolean): void {
  paused = on;
  if (!on) pump();
}

const key = (id: number, vp: Viewport, m: Margins, decor: boolean) => `${id}:${Math.round(vp.width)}x${Math.round(vp.height)}:${Math.round(m.top)}:${Math.round(m.bottom)}:${decor ? 1 : 0}`;
const idOf = (k: string) => Number(k.split(':')[0]);

const ready = new Map<string, PreparedLevel>();
const pending: { id: number; vp: Viewport; margins: Margins; decor: boolean }[] = [];
let running = false;
let epoch = 0;

/** Keeps at most MAX_KEPT levels: the ones furthest back (smallest numbers) are let go first. */
function trim() {
  while (ready.size > MAX_KEPT) {
    let oldest: string | null = null;
    for (const k of ready.keys()) if (oldest === null || idOf(k) < idOf(oldest)) oldest = k;
    if (oldest === null) return;
    ready.get(oldest)?.dispose();
    ready.delete(oldest);
  }
}

/** One preparation at a time, a piece per tick: a level, then the next, never two at once. */
function pump() {
  if (running || paused) return;
  const job = pending.shift();
  if (!job) return;
  const k = key(job.id, job.vp, job.margins, job.decor);
  if (ready.has(k)) {
    pump();
    return;
  }
  running = true;
  const mine = epoch;
  const steps = prepareLevelSteps(levelOfId(job.id), job.vp, job.margins, job.decor);
  const run = () => {
    if (paused) {
      // Held: look again a little later (the step is not lost).
      setTimeout(run, 60);
      return;
    }
    if (mine !== epoch) {
      // The player moved on: this one is not needed any more.
      running = false;
      pump();
      return;
    }
    const r = steps.next();
    if (r.done) {
      ready.set(k, r.value);
      trim();
      running = false;
      setTimeout(pump, gap());
    } else setTimeout(run, gap());
  };
  setTimeout(run, gap());
}

/**
 * Prepares level `from` and the `count - 1` after it in the background (island, board, scenery plan, camera), one after the other
 * and a piece per tick. Used when the player opens the pop-up of a level on the map (the level and the 8 after it) and while a
 * level is played (the 8 after the next one). Levels already prepared, the daily challenges and the levels the phone has to
 * generate are skipped.
 */
export function warmAhead(from: number, count: number, vp: Viewport, margins: Margins, decor: boolean) {
  for (let id = from; id < from + count && id <= LEVEL_COUNT; id++) {
    const k = key(id, vp, margins, decor);
    if (ready.has(k) || pending.some((j) => j.id === id)) continue;
    pending.push({ id, vp, margins, decor });
  }
  pump();
}

/** The player jumped elsewhere: what was waiting is dropped, and what is kept behind the level they are on is released. */
export function pruneBefore(id: number) {
  epoch++;
  pending.length = 0;
  for (const k of [...ready.keys()]) {
    if (idOf(k) < id - 1) {
      ready.get(k)?.dispose();
      ready.delete(k);
    }
  }
}

/** The level prepared ahead for these exact conditions, handed over (it leaves the cache), or null. */
export function takePrepared(id: number, vp: Viewport, margins: Margins, decor: boolean): PreparedLevel | null {
  const k = key(id, vp, margins, decor);
  const hit = ready.get(k) ?? null;
  if (hit) ready.delete(k);
  return hit;
}

/** For tests and the memory watch: how many prepared levels are kept. */
export const keptCount = () => ready.size;
