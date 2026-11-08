import { MAX_COLS, MAX_ROWS, buildLevelSteps } from './campaign';
import { LEVELS, LEVEL_COUNT } from './levels';
import { entrySideOf, exitSideOf } from './sides';
import { kindOfPassage, orientationFor, transformLevel } from './transform';
import type { Level } from './types';

/**
 * Levels after the stored campaign, generated on the phone with the same recipe as the stored ones (game/campaign.ts):
 * size, mechanics, entry and exit sides and the difficulty to aim for all come from the level number. The work is cut into
 * slices of a few milliseconds (the search is a generator), so it can run behind the level being played without a hitch.
 * When it does not finish in time, a stored level is used instead, turned around so that its entry and exit are on the
 * sides the neighbouring levels expect.
 */

/** Generation stops after this long: the level falls back to a stored one. */
export const DEFAULT_BUDGET_MS = 25_000;
/** Longest uninterrupted run before giving the screen a chance to draw a frame. */
const SLICE_MS = 6;

/**
 * A stored level standing in for level `id`: one of the last hundred stored levels that has the same kind of passage
 * (straight or with a turn), rotated or mirrored so its entry and exit are on the right sides.
 */
export function fallbackLevel(id: number): Level {
  const entry = entrySideOf(id);
  const exit = exitSideOf(id);
  const kind = kindOfPassage(entry, exit);
  const span = Math.min(100, LEVEL_COUNT);
  for (let k = 0; k < span; k++) {
    const source = LEVELS[LEVEL_COUNT - span + ((id + k) % span)];
    if (!source.entry) continue;
    if (kindOfPassage(source.entry.side, source.exit.dir) !== kind) continue;
    const o = orientationFor(source.entry.side, source.exit.dir, entry, exit);
    if (!o) continue;
    const level = { ...transformLevel(source, o, id), tutorial: undefined, color: source.color };
    // A quarter turn swaps the width and the height: a big board that no longer fits the limits is not taken.
    if (level.cols - 2 > MAX_COLS || level.rows - 2 > MAX_ROWS) continue;
    return level;
  }
  // Not reachable with the stored campaign (it has both kinds); kept so the game never waits on nothing.
  return { ...LEVELS[LEVEL_COUNT - 1], id };
}

export type InfiniteOptions = {
  /** Time allowed before falling back to a stored level. */
  budgetMs?: number;
  /** Gives the screen a chance to draw (a timer by default). */
  defer?: () => Promise<void>;
  now?: () => number;
};

const cache = new Map<number, Level>();
const running = new Map<number, Promise<Level>>();

/** The level if it is already built (generated or fallen back). */
export const cachedInfiniteLevel = (id: number): Level | undefined => cache.get(id);

/**
 * Builds level `id` (past the stored levels) in the background. Resolves with the generated level, or, if the time budget
 * runs out, with a stored level standing in for it. Never rejects; asking twice shares the work.
 */
export function generateInfiniteLevel(id: number, opts: InfiniteOptions = {}): Promise<Level> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = running.get(id);
  if (pending) return pending;

  const now = opts.now ?? Date.now;
  const defer = opts.defer ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = now() + budget;
  const job = (async () => {
    let result: Level | null = null;
    try {
      const steps = buildLevelSteps(id, { attempts: 80, tolerance: 0.15, exact: false, timeMs: budget });
      let sliceStart = now();
      for (;;) {
        if (now() >= deadline) break;
        const r = steps.next();
        if (r.done) {
          result = r.value;
          break;
        }
        if (now() - sliceStart >= SLICE_MS) {
          await defer();
          sliceStart = now();
        }
      }
    } catch {
      result = null;
    }
    const level = result ?? fallbackLevel(id);
    cache.set(id, level);
    running.delete(id);
    return level;
  })();
  running.set(id, job);
  return job;
}

/** For tests. */
export function clearInfiniteCache() {
  cache.clear();
  running.clear();
}
