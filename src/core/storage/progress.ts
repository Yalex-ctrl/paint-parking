import { benchTimed } from '../render/bench';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { runWhenIdle } from '../services/idleQueue';
import { KEYS } from './keys';

const KEY = KEYS.progress;

export type Progress = {
  /** 1-based id of the next level to play. */
  current: number;
  /** Best star count per level id. */
  stars: Record<number, 1 | 2 | 3>;
  /** Fewest moves a level was finished in. */
  moves: Record<number, number>;
};

const fresh = (): Progress => ({ current: 1, stars: {}, moves: {} });

/**
 * The progress is kept in memory once it has been read: finishing a level reads and writes it without ever touching the phone's
 * storage on the spot (the write is queued for when the ball has landed on the next level, see services/idleQueue).
 */
let cache: Progress | null = null;
let dirty = false;

/** Works the stars out again from the best moves when the rules of the stars changed (the game gives the rule). */
export type RecomputeStars = (stars: Record<number, 1 | 2 | 3>, moves: Record<number, number>) => Record<number, 1 | 2 | 3>;

export async function loadProgress(recompute?: RecomputeStars): Promise<Progress> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      cache = fresh();
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const moves = parsed.moves ?? {};
    cache = {
      current: Math.max(parsed.current ?? 1, 1),
      // If the star thresholds changed, the game works the stars out again from the best number of moves.
      stars: recompute ? recompute(parsed.stars ?? {}, moves) : (parsed.stars ?? {}),
      moves,
    };
    return cache;
  } catch {
    cache = fresh();
    return cache;
  }
}

/** The progress as it is in memory (null until it has been read once, at the start of the app). */
export const peekProgress = (): Progress | null => cache;

async function write() {
  if (!cache || !dirty) return;
  dirty = false;
  try {
    await AsyncStorage.setItem(KEY, benchTimed('save progress (stringify)', () => JSON.stringify(cache)));
  } catch {
    // Progress is a nicety; never block the game on a storage failure.
  }
}

/** Writes now (the app is going to the background, or a reset is about to wipe it). */
export const flushProgress = (): Promise<void> => write();

/** After a reset of the progress: forget what was in memory. */
export function forgetProgress(): void {
  cache = null;
  dirty = false;
}

/**
 * Records a finished level and unlocks the next one, in memory and at once (no waiting for the storage); the write is queued for
 * when the game is quiet. Needs the progress to have been read already (`loadProgress`).
 */
export function completeLevelNow(levelId: number, stars: 1 | 2 | 3, moves?: number): Progress {
  const progress = cache ?? fresh();
  cache = progress;
  progress.stars[levelId] = Math.max(progress.stars[levelId] ?? 0, stars) as 1 | 2 | 3;
  if (moves !== undefined) progress.moves[levelId] = Math.min(progress.moves[levelId] ?? Infinity, moves);
  // The campaign never ends: after the last stored level, levels are generated on the phone (game/infinite.ts).
  progress.current = Math.max(progress.current, levelId + 1);
  dirty = true;
  runWhenIdle(() => {
    void write();
  });
  return progress;
}

/** Records a finished level and unlocks the next one. Returns the updated progress. */
export async function completeLevel(levelId: number, stars: 1 | 2 | 3, moves?: number): Promise<Progress> {
  await loadProgress();
  const progress = completeLevelNow(levelId, stars, moves);
  await write();
  return progress;
}

export const totalStars = (p: Progress) => Object.values(p.stars).reduce<number>((n, s) => n + s, 0);
