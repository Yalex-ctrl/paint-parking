import levelsJson from '../../assets/levels.json';
import { buildLevel } from './generator';
import { decodeLevel } from './levelSchema';
import type { Level } from './types';

/** The pre-generated campaign (see scripts/generate-levels.ts), easiest first. */
export const LEVELS: Level[] = (levelsJson as unknown[]).map(decodeLevel);

export const LEVEL_COUNT = LEVELS.length;

/** Levels past the stored campaign, built on the phone with the same recipe (a few are kept). */
const built = new Map<number, Level>();

/** Level by 1-based id: a stored one, or (past the file) one built from its number: always the same for the same number. */
export function levelById(id: number): Level {
  const n = Math.max(1, id);
  if (n <= LEVEL_COUNT) return LEVELS[n - 1];
  let level = built.get(n);
  if (!level) {
    level = buildLevel(n);
    built.set(n, level);
    if (built.size > 12) built.delete(built.keys().next().value as number);
  }
  return level;
}

/** The fewest moves of a stored level, or null past the file (used to work the stars out again). */
export const optimalOf = (id: number): number | null => LEVELS[id - 1]?.optimal ?? null;
