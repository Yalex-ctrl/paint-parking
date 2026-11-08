import levelsJson from '../../assets/levels.json';
import { normalizeLevel } from './levelSchema';
import type { Level } from './types';

/** The pre-generated campaign (see scripts/generate-levels.ts), easiest first. */
export const LEVELS: Level[] = (levelsJson as unknown[]).map(normalizeLevel);

export const LEVEL_COUNT = LEVELS.length;

/** Level by 1-based id, clamped to the campaign range. */
export const levelById = (id: number): Level => LEVELS[Math.min(Math.max(id, 1), LEVEL_COUNT) - 1];
