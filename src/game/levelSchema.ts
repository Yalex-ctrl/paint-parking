import { z } from 'zod';

import { emptyFeatures, type Features, type Level } from './types';

/**
 * The format of a level, as a schema. Every file of levels (the campaign, the daily challenges) goes through `normalizeLevel` when it
 * is loaded: the lists a file may lack (the files made before the slides, the platforms or the collapsing floor have no such list) are
 * filled with [] there, once, so no other piece of the game ever has to wonder whether a list exists. In a development build the
 * level is also checked against the schema (and the app stops at once on a malformed one); a test checks every file.
 */
const int = z.number().int();
const cell = z.tuple([int, int]);
const dir = z.enum(['U', 'D', 'L', 'R']);
const cells = z.array(cell).default([]);

const slide = z.object({
  entry: cell,
  mouth: dir,
  exit: cell,
  exitDir: dir,
  path: z.array(cell),
  shape: z.enum(['line', 'L', 'S', 'spiral']),
});

const featuresSchema = z.object({
  stops: cells,
  corners: z.array(z.object({ r: int, c: int, a: dir, b: dir })).default([]),
  portals: z.array(z.object({ a: cell, b: cell })).default([]),
  doubles: cells,
  fragile: cells,
  bombs: cells,
  coins: cells,
  slides: z.array(slide).default([]),
  raised: cells,
  ramps: z.array(z.object({ r: int, c: int, up: dir })).default([]),
  collapse: cells,
});

const mechanic = z.enum(['stop', 'corner', 'slide', 'portal', 'double', 'tier', 'fragile', 'bomb', 'collapse']);

export const levelSchema = z.object({
  id: int,
  seed: z.number(),
  rows: int.positive(),
  cols: int.positive(),
  grid: z.array(z.string()),
  start: cell,
  exit: z.object({ r: int, c: int, dir: dir }),
  entry: z.object({ r: int, c: int, side: dir }).optional(),
  color: z.string(),
  solution: z.string(),
  difficulty: z.number(),
  floorCount: int,
  layers: int,
  deadEnds: int,
  branches: int,
  features: featuresSchema.default(() => ({ ...emptyFeatures() })),
  mechanics: z.array(mechanic).default([]),
  tutorial: z.string().optional(),
  camTilt: z.number().min(0).max(5).optional(),
  /** The star mechanic of a daily challenge, and the day of the week it belongs to (see game/dailyMechanics.ts). */
  star: mechanic.optional(),
});

/** What a level file may hold, before normalisation. */
export type RawLevel = z.input<typeof levelSchema>;

/**
 * The level as the game uses it: every list present (empty when the file has none). Always cheap (no schema run in a release build);
 * in a development build the level is validated too, and a malformed one throws with the id and the path of the mistake.
 */
export function normalizeLevel(raw: unknown): Level {
  const r = raw as Level;
  const level: Level = { ...r, features: { ...emptyFeatures(), ...(r.features as Partial<Features>) }, mechanics: r.mechanics ?? [] };
  if (typeof __DEV__ !== 'undefined' && __DEV__) validateLevel(level);
  return level;
}

/** Throws a readable error if a level does not follow the schema. */
export function validateLevel(raw: unknown): void {
  const result = levelSchema.safeParse(raw);
  if (!result.success) {
    const id = (raw as { id?: unknown })?.id;
    const first = result.error.issues[0];
    throw new Error(`Malformed level ${String(id)}: ${first.path.join('.')} ${first.message}`);
  }
}
