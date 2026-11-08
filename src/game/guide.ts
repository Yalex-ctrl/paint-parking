import type { GameState } from './engine';
import { solveFrom, solveSteps, SOLVER_CHUNK } from './solver';
import type { Dir, Level } from './types';

/**
 * Help for beginners in the first five levels: the next good swipe, worked out by the solver from where the ball is and what is
 * already painted. Level 1 shows it before every swipe; levels 2 to 5 show it after a few seconds without a swipe; from level 6 on
 * there is no automatic help (the Hint button takes over). If nothing can be solved any more from here, the player is told to start
 * the level again (free in these levels).
 */
export const GUIDE_LAST_LEVEL = 5;
/** Levels 2 to 5: the arrow appears after this long without a swipe. */
export const GUIDE_IDLE_MS = 5000;
/** The first five levels are small: an exhaustive search is quick and its failure means the position is lost. */
const GUIDE_MAX_STATES = 400_000;

export type Guide = { kind: 'move'; dir: Dir } | { kind: 'stuck' };

/** Does this level have automatic help, and which kind? */
export function guideMode(levelId: number, daily: boolean): 'immediate' | 'idle' | null {
  if (daily) return null;
  if (levelId < 1 || levelId > GUIDE_LAST_LEVEL) return null;
  return levelId === 1 ? 'immediate' : 'idle';
}

/** The next good swipe from `state`, or `stuck` when no solution is left. Cheap enough for the first levels; run it in the background. */
export function computeGuide(level: Level, state: GameState): Guide {
  // A level that is already won has nothing left to solve (the ball stands on the gate, which the solver does not model).
  if (state.finished) return { kind: 'stuck' };
  const res = solveFrom(level, state, { maxStates: GUIDE_MAX_STATES });
  if (!res || res.moves.length === 0) return { kind: 'stuck' };
  return { kind: 'move', dir: res.moves[0] as Dir };
}

export type GuideView = { show: 'none' } | { show: 'arrow'; dir: Dir } | { show: 'restart' };

/**
 * What the screen shows now. `idleMs` is the time since the last swipe (or since the level started); `busy` is true while a ball
 * rolls; `guide` is what the solver found for the current position (null while it is still working).
 */
export function guideView(o: { levelId: number; daily: boolean; idleMs: number; busy: boolean; blocked: boolean; guide: Guide | null; allPainted?: boolean }): GuideView {
  const mode = guideMode(o.levelId, o.daily);
  // Every tile is painted already: only the way out is left, and there is nothing to point at.
  if (!mode || o.busy || o.blocked || !o.guide || o.allPainted) return { show: 'none' };
  if (o.guide.kind === 'stuck') return { show: 'restart' };
  if (mode === 'idle' && o.idleMs < GUIDE_IDLE_MS) return { show: 'none' };
  return { show: 'arrow', dir: o.guide.dir };
}

/** Milliseconds of search per slice, and the pause between two slices: the game keeps drawing in between (no frame is held up). */
const SLICE_MS = 4;
const SLICE_GAP_MS = 14;

/**
 * The same answer as `computeGuide`, worked out a few milliseconds at a time between frames (the solver pauses every
 * SOLVER_CHUNK states), so that a ball rolling on the screen never stutters because of it. Returns a function that cancels it
 * (a swipe changes the position: the answer would be for the wrong one).
 */
export function startGuide(level: Level, state: GameState, onDone: (guide: Guide) => void, firstDelayMs = 30): () => void {
  if (state.finished) {
    onDone({ kind: 'stuck' });
    return () => undefined;
  }
  const search = solveSteps(level, state, { maxStates: GUIDE_MAX_STATES });
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const slice = () => {
    timer = null;
    if (cancelled) return;
    const end = Date.now() + SLICE_MS;
    for (;;) {
      const r = search.next();
      if (r.done) {
        onDone(!r.value || r.value.moves.length === 0 ? { kind: 'stuck' } : { kind: 'move', dir: r.value.moves[0] as Dir });
        return;
      }
      if (Date.now() >= end) break;
    }
    timer = setTimeout(slice, SLICE_GAP_MS);
  };
  timer = setTimeout(slice, firstDelayMs);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export const GUIDE_SLICE_STATES = SOLVER_CHUNK;
