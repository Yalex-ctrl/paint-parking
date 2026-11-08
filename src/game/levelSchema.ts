import { z } from 'zod';

import { compile } from './engine';
import {
  MECHANICS,
  OBSTACLE_KINDS,
  VEHICLE_COLORS,
  mechanicsOf,
  vehicleCells,
  type Dir,
  type Gate,
  type Level,
  type LotShape,
  type Obstacle,
  type OneWay,
  type Vehicle,
} from './types';

/**
 * The format of a level, as a schema. The files hold a compact form (short keys, tuples, whatever can be worked out is left
 * out); `decodeLevel` turns it into a `Level`. Every file of levels (the campaign, the daily challenges) goes through it when it
 * is loaded; a development build also checks the schema, and a test checks every file and plays every solution.
 */
const int = z.number().int();
const dir = z.enum(['U', 'D', 'L', 'R']);
const SHAPES = ['rect', 'L', 'cross', 'islands'] as const;

export const compactLevelSchema = z.object({
  /** id, seed, rows, columns */
  i: int.positive(),
  s: z.number(),
  r: int.positive(),
  c: int.positive(),
  /** vehicles: [row, col, front direction, length, colour, 1 when the arrow points to the rear] (the id is the index) */
  v: z
    .array(z.tuple([int.min(0), int.min(0), dir, z.union([z.literal(2), z.literal(3)]), int.min(0).max(VEHICLE_COLORS - 1), z.union([z.literal(0), z.literal(1)])]))
    .min(1),
  /** obstacles: [row, col, kind index] */
  o: z.array(z.tuple([int.min(0), int.min(0), int.min(0).max(OBSTACLE_KINDS.length - 1)])).default([]),
  /** voids: [row, col] */
  x: z.array(z.tuple([int.min(0), int.min(0)])).default([]),
  /** gates: [side, first lane, last lane, vehicles needed] */
  g: z.array(z.tuple([dir, int.min(0), int.min(0), int.positive()])).default([]),
  /** one-way arrows: [row, col, direction] */
  w: z.array(z.tuple([int.min(0), int.min(0), dir])).default([]),
  /** the solution: vehicle ids in the order they are tapped */
  sol: z.array(int.min(0)),
  /** difficulty, layers, mean free, mean chain, traps, fill (percent), free at the start (percent) */
  d: z.number(),
  y: int.min(0),
  f: z.number(),
  a: z.number(),
  t: int.min(0),
  p: z.number().min(0).max(100),
  e: z.number().min(0).max(100),
  /** shape of the lot */
  h: z.enum(SHAPES).default('rect'),
  /** mechanic of the tutorial bubble */
  tu: z.enum(MECHANICS as unknown as [string, ...string[]]).optional(),
});

export type CompactLevel = z.input<typeof compactLevelSchema>;

export function encodeLevel(level: Level): CompactLevel {
  const out: CompactLevel = {
    i: level.id,
    s: level.seed,
    r: level.rows,
    c: level.cols,
    v: level.vehicles.map((v) => [v.r, v.c, v.dir, v.len, v.color, v.back ? 1 : 0]),
    sol: level.solution,
    d: level.difficulty,
    y: level.layers,
    f: level.avgFree,
    a: level.avgChain,
    t: level.traps,
    p: Math.round(level.fill * 100),
    e: Math.round(level.freeStart * 100),
  };
  if (level.obstacles.length) out.o = level.obstacles.map((o) => [o.r, o.c, OBSTACLE_KINDS.indexOf(o.kind)]);
  if (level.voids.length) out.x = level.voids;
  if (level.gates.length) out.g = level.gates.map((g) => [g.side, g.from, g.to, g.need]);
  if (level.oneWays.length) out.w = level.oneWays.map((w) => [w.r, w.c, w.dir]);
  if (level.shape !== 'rect') out.h = level.shape;
  if (level.tutorial) out.tu = level.tutorial;
  return out;
}

/** The level as the game uses it. In a development build a malformed level throws with its id and the path of the mistake. */
export function decodeLevel(raw: unknown): Level {
  const parsed = compactLevelSchema.safeParse(raw);
  if (!parsed.success) {
    const id = (raw as { i?: unknown })?.i;
    const first = parsed.error.issues[0];
    throw new Error(`Malformed level ${String(id)}: ${first.path.join('.')} ${first.message}`);
  }
  const c = parsed.data;
  const vehicles: Vehicle[] = c.v.map(([r, col, d, len, color, back], id) => ({ id, r, c: col, dir: d as Dir, len, color, ...(back ? { back: true } : {}) }));
  const obstacles: Obstacle[] = c.o.map(([r, col, k]) => ({ r, c: col, kind: OBSTACLE_KINDS[k] }));
  const gates: Gate[] = c.g.map(([side, from, to, need]) => ({ side: side as Dir, from, to, need }));
  const oneWays: OneWay[] = c.w.map(([r, col, d]) => ({ r, c: col, dir: d as Dir }));
  const base = { obstacles, vehicles, gates, oneWays };
  return {
    id: c.i,
    seed: c.s,
    rows: c.r,
    cols: c.c,
    voids: c.x.map(([r, col]) => [r, col] as [number, number]),
    ...base,
    solution: c.sol,
    optimal: vehicles.length,
    difficulty: c.d,
    layers: c.y,
    avgFree: c.f,
    avgChain: c.a,
    traps: c.t,
    fill: c.p / 100,
    freeStart: c.e / 100,
    shape: c.h as LotShape,
    mechanics: mechanicsOf(base),
    tutorial: c.tu as Level['tutorial'],
  };
}

/** What is wrong with the arrangement of a level (overlaps, things outside the lot, a bad solution...), or null. */
export function structuralProblem(level: Level): string | null {
  const { rows, cols } = level;
  const taken = new Set<number>();
  const inside = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  for (const [r, c] of level.voids) {
    if (!inside(r, c)) return `void ${r},${c} is outside the lot`;
    taken.add(r * cols + c);
  }
  for (const o of level.obstacles) {
    if (!inside(o.r, o.c)) return `obstacle ${o.r},${o.c} is outside the lot`;
    if (taken.has(o.r * cols + o.c)) return `obstacle ${o.r},${o.c} is on something else`;
    taken.add(o.r * cols + o.c);
  }
  for (const v of level.vehicles) {
    if (v.id !== level.vehicles.indexOf(v)) return `vehicle ${v.id} has the wrong id`;
    for (const [r, c] of vehicleCells(v)) {
      if (!inside(r, c)) return `vehicle ${v.id} leaves the lot`;
      if (taken.has(r * cols + c)) return `vehicle ${v.id} overlaps something at ${r},${c}`;
      taken.add(r * cols + c);
    }
  }
  // An arrow is on a free place: no vehicle is parked on it, and it is not on an obstacle or a void.
  for (const w of level.oneWays) {
    if (!inside(w.r, w.c)) return `arrow ${w.r},${w.c} is outside the lot`;
    if (taken.has(w.r * cols + w.c)) return `arrow ${w.r},${w.c} is on something else`;
  }
  const lanes = (side: Dir) => (side === 'L' || side === 'R' ? rows : cols);
  for (const g of level.gates) if (g.from > g.to || g.to >= lanes(g.side)) return `gate ${g.side} ${g.from}-${g.to} is outside the edge`;
  if (level.solution.length !== level.vehicles.length || new Set(level.solution).size !== level.vehicles.length) return 'the solution does not list every vehicle once';
  compile(level);
  return null;
}
