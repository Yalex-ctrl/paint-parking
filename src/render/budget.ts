import type { Level } from '../game/types';
import { chuteTriangles } from './slideGeometry';
import { slideCenterline, slideLength } from './slidePath';

/**
 * The performance budget of a level, counted before it is ever drawn: fewer than 60 draw calls and fewer than 120 000 triangles,
 * scenery included. The generator rejects a level that goes over (and `scripts/level-budget.ts` prints the numbers).
 *
 * It is an ESTIMATE made of the parts the scene is built from (each part is one draw call, or one per instanced mesh), not a reading
 * of the renderer: the real figure of a build is shown by the frame counter of the developer menu ("calls"), and these constants must
 * be checked against it whenever a part of the scene is added. The assumptions are written as constants so they are easy to adjust.
 */
export const BUDGET = { drawCalls: 60, triangles: 120_000 } as const;

/**
 * Draw calls that every board has, whatever it holds: the island, the bridge, the sky and clouds, the walls, the slab, the shadows,
 * the floor and paint instances, the two gates with their threshold, the ball (body, band, shadow), its trail, the pools of particles
 * and decals, the coins and the ambience.
 */
export const BASE_CALLS = 32;
/** The scenery: one instanced mesh per mesh of each model of the theme; the planner keeps at most this many. */
export const DECOR_CALLS_CAP = 14;
/** Draw calls of a special tile that is already in the game (stop, bend, portal, x2, fragile wall, bomb): instanced, about one each. */
const OLD_CALLS: Record<string, number> = { stops: 1, corners: 1, portals: 2, doubles: 1, fragile: 1, bombs: 1 };

/** Triangles the scenery may hold (the planner and the models of a theme keep under it). */
export const DECOR_TRIANGLES_CAP = 60_000;
/** Triangles of the island, the bridge, the clouds, the ball, the gates and the pools, whatever the level. */
export const SCENE_TRIANGLES = 24_000;

export type Budget = {
  drawCalls: number;
  triangles: number;
  /** Where the draw calls come from. */
  parts: Record<string, number>;
};

/** The draw calls and the triangles the three newest mechanics add to a level. */
export function newMechanicsCost(level: Level): { calls: Record<string, number>; triangles: number } {
  const f = level.features;
  const calls: Record<string, number> = {};
  let triangles = 0;
  const raised = (f.raised ?? []).length;
  const ramps = (f.ramps ?? []).length;
  if (raised > 0 || ramps > 0) {
    // The planks of the sides, the posts and the walls of the ramps (one mesh each), the ridges and the arrows of the ramps (instanced).
    calls.platformTrim = 1;
    calls.platformFittings = 1;
    triangles += raised * 40 + 400;
  }
  if (ramps > 0) {
    calls.rampRidges = 1;
    calls.rampArrows = 1;
    triangles += ramps * 90;
  }
  const slides = f.slides ?? [];
  if (slides.length > 0) {
    // Per chute: the wood (rims, arches, trestles, gantries), the floor, the paint of the ball on it, the flap; for the level: the
    // chevrons of the entries and the ones in the troughs. The triangles are counted on the real meshes.
    calls.chutes = slides.length * 4;
    calls.chuteChevrons = 1;
    for (const s of slides) triangles += chuteTriangles(level, s) + 8 * 4;
  }
  const collapse = (f.collapse ?? []).length;
  if (collapse > 0) {
    // The cracked slabs, the holes they leave, and the one pool of debris that every fall draws from.
    calls.collapseSlabs = 1;
    calls.collapseHoles = 1;
    calls.debris = 2; // the pieces and the puffs of dust: two pools
    triangles += collapse * (12 + 20) + 24 * 12;
  }
  return { calls, triangles };
}

/** The whole budget of a level, without the geometry of its own walls (they are counted by `boardTriangles` when it is known). */
export function estimateBudget(level: Level, boardTriangles = 12_000): Budget {
  const parts: Record<string, number> = { base: BASE_CALLS, decor: DECOR_CALLS_CAP };
  const f = level.features as unknown as Record<string, unknown[]>;
  for (const [key, n] of Object.entries(OLD_CALLS)) if ((f[key] ?? []).length > 0) parts[key] = n;
  const added = newMechanicsCost(level);
  Object.assign(parts, added.calls);
  const drawCalls = Object.values(parts).reduce((a, b) => a + b, 0);
  const triangles = SCENE_TRIANGLES + DECOR_TRIANGLES_CAP + boardTriangles + added.triangles;
  return { drawCalls, triangles, parts };
}

export const withinBudget = (level: Level, boardTriangles?: number): boolean => {
  const b = estimateBudget(level, boardTriangles);
  return b.drawCalls < BUDGET.drawCalls && b.triangles < BUDGET.triangles;
};

/** Length of the longest chute of a level, for the report. */
export const longestSlide = (level: Level): number => Math.max(0, ...(level.features.slides ?? []).map((s) => slideLength(slideCenterline(level, s))));
