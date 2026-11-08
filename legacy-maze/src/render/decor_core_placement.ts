import { createRng, type Rng } from '../../rng';
import { DELTA, type Level } from '../../../game/types';
import { cellX, cellZ } from '../../../render/coords';
import { insideIsland } from '../../../render/islandLayout';
import { DECOR_MODELS, MAX_DECOR, type DecorModel } from './catalog';

/** What a world wants around the board: relative weight of each kind, and optionally the only trees allowed. */
export type DecorTheme = { weights: Partial<Record<DecorModel['kind'], number>>; onlyTrees?: string[] };

export const DEFAULT_DECOR_THEME: DecorTheme = { weights: { tree: 2, bush: 3.2, flower: 2.6, grass: 2.2, stone: 0.5, wood: 0.35 } };

export type Placed = {
  model: DecorModel;
  x: number;
  z: number;
  rotY: number;
  scale: number;
};

/** World-space footprint radius and height of a placement. */
export const radiusOf = (p: Placed) => p.model.radius * p.scale;
export const heightOf = (p: Placed) => p.model.height * p.scale;

/** Clear gap (in cells) kept between the board's outer edge and any decor. */
export const BOARD_GAP = 1;
const EXIT_LENGTH = 7;
const EXIT_HALF_WIDTH = 2;

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A lane of the ground plane leaving a ring cell (the exit or the entry) in direction `dir`, kept free of decor. */
function laneFrom(level: Level, r: number, c: number, dir: keyof typeof DELTA): Box {
  const x = cellX(level, c);
  const z = cellZ(level, r);
  const [dr, dc] = DELTA[dir];
  const x1 = x + dc * EXIT_LENGTH;
  const z1 = z + dr * EXIT_LENGTH;
  return {
    minX: Math.min(x, x1) - (dc === 0 ? EXIT_HALF_WIDTH : 0.5),
    maxX: Math.max(x, x1) + (dc === 0 ? EXIT_HALF_WIDTH : 0.5),
    minZ: Math.min(z, z1) - (dr === 0 ? EXIT_HALF_WIDTH : 0.5),
    maxZ: Math.max(z, z1) + (dr === 0 ? EXIT_HALF_WIDTH : 0.5),
  };
}

/** Where the ball travels after leaving through the exit (the bridge to the next board), kept free of decor. */
export const exitKeepOut = (level: Level): Box => laneFrom(level, level.exit.r, level.exit.c, level.exit.dir);

/** The bridge behind the entry, kept free of decor (null for an isolated level). */
export const entryKeepOut = (level: Level): Box | null => (level.entry ? laneFrom(level, level.entry.r, level.entry.c, level.entry.side) : null);

/** Distance from a point to the board rectangle (0 when on it). */
export const distToBoard = (level: Level, x: number, z: number) =>
  Math.hypot(Math.max(Math.abs(x) - level.cols / 2, 0), Math.max(Math.abs(z) - level.rows / 2, 0));

/** The hard, camera-independent rules. */
export function worldOk(level: Level, p: Placed): boolean {
  const r = radiusOf(p);
  if (distToBoard(level, p.x, p.z) < BOARD_GAP + r) return false;
  // The island is only as wide as the board's surroundings: nothing hangs over its edge.
  if (!insideIsland(level, p.x, p.z, r)) return false;
  // Tall pieces never stand in front of the board (bottom of the screen).
  if (p.model.tall && p.z > level.rows / 2 - 0.5) return false;
  const e = exitKeepOut(level);
  if (p.x > e.minX - r && p.x < e.maxX + r && p.z > e.minZ - r && p.z < e.maxZ + r) return false;
  const n = entryKeepOut(level);
  if (n && p.x > n.minX - r && p.x < n.maxX + r && p.z > n.minZ - r && p.z < n.maxZ + r) return false;
  return true;
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng.next() * (hi - lo);

type Zone = 'left' | 'right' | 'back' | 'front';

/** Random model for a grove: trees dominate beside/behind the board, only low pieces in front. */
function pickModel(rng: Rng, low: boolean, theme: DecorTheme): DecorModel {
  const weight = (m: DecorModel) => theme.weights[m.kind] ?? 0;
  const allowed = (m: DecorModel) => (!low || !m.tall) && weight(m) > 0 && (m.kind !== 'tree' || !theme.onlyTrees || theme.onlyTrees.includes(m.name));
  let pool = DECOR_MODELS.filter(allowed);
  // A world with nothing low to put in front of the board still gets something.
  if (pool.length === 0) pool = DECOR_MODELS.filter((m) => !m.tall && weight(m) > 0);
  if (pool.length === 0) pool = DECOR_MODELS.filter((m) => !m.tall);
  const w = (m: DecorModel) => weight(m) || 0.1;
  let roll = rng.next() * pool.reduce((n, m) => n + w(m), 0);
  for (const m of pool) {
    roll -= w(m);
    if (roll <= 0) return m;
  }
  return pool[pool.length - 1];
}

/** Centre of a grove. Sides lean toward the back, where the view is wide enough to show them. */
function anchorFor(level: Level, rng: Rng, zone: Zone): { x: number; z: number } {
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  const g = BOARD_GAP;
  switch (zone) {
    case 'left':
      return { x: -hw - g - between(rng, 0.3, 6), z: between(rng, -hd - 6, hd * 0.6) };
    case 'right':
      return { x: hw + g + between(rng, 0.3, 6), z: between(rng, -hd - 6, hd * 0.6) };
    case 'back':
      return { x: between(rng, -hw - 6, hw + 6), z: -hd - g - between(rng, 0.5, 9) };
    default:
      return { x: between(rng, -hw - 5, hw + 5), z: hd + g + between(rng, 0.3, 6) };
  }
}

/**
 * Deterministic decor plan for a level (seeded by the level seed): groves of 2-4 pieces (never a lone piece)
 * on the left, right, behind and in front of the board (low pieces only in front), up
 * to 12 pieces in total, all outside the board and the exit lane. `accept` adds the
 * camera-dependent checks (nothing may hide a cell or the ball on screen).
 */
export function planDecor(level: Level, accept: (p: Placed) => boolean = () => true, theme: DecorTheme = DEFAULT_DECOR_THEME): Placed[] {
  const steps = planDecorSteps(level, accept, theme);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Longest uninterrupted run (ms) of the scenery search before it lets the scene draw a frame. */
const SLICE_MS = 5;

/** The same plan as a generator that pauses every few milliseconds: it can be worked out behind a level being played. */
export function* planDecorSteps(
  level: Level,
  accept: (p: Placed) => boolean = () => true,
  theme: DecorTheme = DEFAULT_DECOR_THEME,
): Generator<void, Placed[], void> {
  let sliceStart = Date.now();
  const rng = createRng((level.seed ^ 0x9e3779b9) >>> 0);
  const placed: Placed[] = [];
  const zones: Zone[] = rng.shuffle<Zone>(['left', 'right', 'back', 'front']).concat(rng.shuffle<Zone>(['left', 'right', 'back', 'front']), ['back', 'front', 'left', 'right']);

  for (const zone of zones) {
    const size = 2 + Math.floor(rng.next() * 3); // 2-4 pieces
    for (let anchorTry = 0; anchorTry < 40; anchorTry++) {
      if (Date.now() - sliceStart > SLICE_MS) {
        yield;
        sliceStart = Date.now();
      }
      if (placed.length >= MAX_DECOR) return placed;
      const anchor = anchorFor(level, rng, zone);
      const grove: Placed[] = [];
      for (let k = 0; k < size && placed.length + grove.length < MAX_DECOR; k++) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const model = pickModel(rng, zone === 'front', theme);
          const angle = rng.next() * Math.PI * 2;
          const reach = k === 0 ? 0 : between(rng, 0.9, 2.2);
          const p: Placed = {
            model,
            x: anchor.x + Math.cos(angle) * reach,
            z: anchor.z + Math.sin(angle) * reach,
            rotY: rng.next() * Math.PI * 2,
            scale: between(rng, model.scale[0], model.scale[1]),
          };
          if (!worldOk(level, p)) continue;
          // Groves may overlap a little (canopies touching), but not stack.
          const others = placed.concat(grove);
          if (!others.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > (radiusOf(o) + radiusOf(p)) * 0.75)) continue;
          if (!accept(p)) continue;
          grove.push(p);
          break;
        }
      }
      // A lone piece looks dropped there by chance: groves need at least two.
      if (grove.length >= 2) {
        placed.push(...grove);
        break;
      }
    }
  }
  return placed;
}
