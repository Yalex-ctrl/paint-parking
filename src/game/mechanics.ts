import { registerUnlockLevels } from '../core/worlds';
import { createRng } from '../core/rng';
import { MECHANICS, UNLOCK_LEVEL, type Mechanic, type Tutorial } from './types';

registerUnlockLevels(UNLOCK_LEVEL);

/** The mechanic whose tutorial level this is, if any. */
export const tutorialFor = (id: number): Tutorial | undefined => MECHANICS.find((m) => UNLOCK_LEVEL[m] === id);

/** A level out of this many is an easier one, to catch one's breath (see `isBreathingLevel`). */
export const BREATH_EVERY = 8;

/** One level in eight is easier than the one before. Never a tutorial level. */
export const isBreathingLevel = (id: number): boolean => id > 5 && id % BREATH_EVERY === 6 && !tutorialFor(id);

/** At most this many kinds of mechanics in one level (the tutorial levels have one). */
export const MAX_KINDS = 3;

const WEIGHT: Record<Mechanic, number> = { obstacle: 0.6, truck: 0.7, gate: 0.35, oneWay: 0.35 };

/**
 * Which mechanics level `id` is built around:
 *  - a mechanic's first level is its tutorial: that mechanic alone;
 *  - every other level uses up to `MAX_KINDS` of the mechanics already unlocked (a breathing level uses none or one), and the
 *    newest mechanic keeps coming back for a while so it gets practised.
 */
export function mechanicsForLevel(id: number): { mechanics: Mechanic[]; tutorial?: Tutorial } {
  const tutorial = tutorialFor(id);
  if (tutorial) return { mechanics: [tutorial], tutorial };
  const unlocked = MECHANICS.filter((m) => UNLOCK_LEVEL[m] < id);
  if (unlocked.length === 0) return { mechanics: [] };
  const rng = createRng(id * 7919 + 13);
  const chosen = new Set<Mechanic>();
  const newest = unlocked[unlocked.length - 1];
  if (id - UNLOCK_LEVEL[newest] < 10) chosen.add(newest);
  for (const m of rng.shuffle(unlocked)) if (rng.next() < WEIGHT[m]) chosen.add(m);
  const limit = isBreathingLevel(id) ? 1 : MAX_KINDS;
  const picked = MECHANICS.filter((m) => chosen.has(m));
  // Keep the newest first when the limit cuts the list.
  const kept = picked.sort((a, b) => (a === newest ? -1 : b === newest ? 1 : 0)).slice(0, limit);
  return { mechanics: MECHANICS.filter((m) => kept.includes(m)) };
}
