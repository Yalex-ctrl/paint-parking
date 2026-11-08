import { createRng, type Rng } from '../core/rng';
import { DELTA } from '../core/grid';
import { compile, createState, freeVehicles, scanLine, type Board } from './engine';
import { mechanicsForLevel, isBreathingLevel } from './mechanics';
import { metrics, solve, solveBoard } from './solver';
import {
  OBSTACLE_KINDS,
  VEHICLE_COLORS,
  isHorizontal,
  laneOf,
  mechanicsOf,
  vehicleCells,
  vehicleDirs,
  type Dir,
  type Gate,
  type Level,
  type LotShape,
  type Mechanic,
  type Obstacle,
  type OneWay,
  type Vehicle,
} from './types';

/* ------------------------------------------------------------------------------------------
 * The generator. A lot is built BACKWARDS, so it can always be emptied: starting from an empty
 * lot, vehicles are added one at a time, and each new vehicle must have at least one direction
 * that leads to the edge, given the vehicles already there. Taking the vehicles away in the
 * reverse order of their arrival is then a solution. Gates and one-way lanes are added last and
 * kept only if the solver still empties the lot and they really change something.
 * ---------------------------------------------------------------------------------------- */

export type Recipe = {
  rows: number;
  cols: number;
  shape: LotShape;
  /** How many vehicles to put in. */
  vehicles: number;
  /** Chance that a vehicle is a truck (3 cells). */
  truckShare: number;
  obstacles: number;
  /** The share of the places the vehicles must take, 0..1. */
  minFill: number;
  maxFill: number;
  /** How strongly a new vehicle prefers to sit on the way out of the earlier ones (0 = anywhere). */
  greed: number;
  gates: number;
  oneWays: number;
  /** The mechanics the level is built around (what it must hold; the tutorial's one alone). */
  mechanics: Mechanic[];
  tutorial?: Mechanic;
  /** Levels 6 and beyond: no vehicle without interest, both axes well represented. */
  strict: boolean;
  /** The least share of the vehicles that are free at the start. */
  minFreeStart: number;
  /** How many moves of vehicles the search for the target difficulty may try (600 by default). */
  climbMoves?: number;
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The first five levels: tiny lots, a handful of vehicles, most of them free. */
const FIRST_LEVELS: { rows: number; cols: number; vehicles: number }[] = [
  { rows: 3, cols: 3, vehicles: 2 },
  { rows: 3, cols: 3, vehicles: 3 },
  { rows: 4, cols: 3, vehicles: 3 },
  { rows: 4, cols: 4, vehicles: 4 },
  { rows: 4, cols: 4, vehicles: 4 },
];

/** The tutorial levels: small, the new mechanic alone, and necessary. */
const TUTORIALS: Record<Mechanic, { rows: number; cols: number; vehicles: number; truckShare: number; obstacles: number }> = {
  obstacle: { rows: 4, cols: 4, vehicles: 5, truckShare: 0, obstacles: 2 },
  truck: { rows: 5, cols: 4, vehicles: 5, truckShare: 0.4, obstacles: 0 },
  gate: { rows: 5, cols: 5, vehicles: 7, truckShare: 0, obstacles: 0 },
  oneWay: { rows: 5, cols: 4, vehicles: 6, truckShare: 0, obstacles: 0 },
};

/** The progress through the campaign: 0 at level 5, 1 at level 50, going on after. */
const progressOf = (id: number) => Math.max(0, (id - 5) / 45);

/** The share of places taken, level 6 (0.62) to level 50 (0.84), at most 0.85. */
const plannedFill = (t: number) => Math.min(0.85, 0.62 + 0.22 * Math.min(t, 1.05));

export function recipeFor(id: number): Recipe {
  if (id <= 5) {
    const f = FIRST_LEVELS[Math.max(0, id - 1)];
    return { ...f, shape: 'rect', truckShare: 0, obstacles: 0, minFill: 0, maxFill: 0.9, greed: id <= 2 ? 0 : id === 3 ? 1.5 : 3, gates: 0, oneWays: 0, mechanics: [], strict: false, minFreeStart: 0.5 };
  }
  const { mechanics, tutorial } = mechanicsForLevel(id);
  if (tutorial) {
    const tu = TUTORIALS[tutorial];
    return {
      rows: tu.rows,
      cols: tu.cols,
      shape: 'rect',
      vehicles: tu.vehicles,
      truckShare: tu.truckShare,
      obstacles: tu.obstacles,
      minFill: 0,
      maxFill: 0.9,
      greed: 0.5,
      gates: tutorial === 'gate' ? 1 : 0,
      oneWays: tutorial === 'oneWay' ? 1 : 0,
      mechanics,
      tutorial,
      strict: false,
      minFreeStart: 0.3,
    };
  }
  const t = progressOf(id);
  const breath = isBreathingLevel(id);
  const rows = clamp(Math.round(4 + 4 * t), 4, 10);
  const cols = clamp(Math.round(4 + 2 * t), 4, 7);
  const has = (m: Mechanic) => mechanics.includes(m);
  const obstacles = has('obstacle') ? clamp(1 + Math.floor(t * 3), 1, 4) : 0;
  const truckShare = has('truck') ? clamp(0.15 + 0.1 * t, 0.15, 0.3) : 0;
  const usable = rows * cols - obstacles;
  const fill = breath ? Math.max(0.6, plannedFill(t) - 0.1) : plannedFill(t);
  const avgLen = 2 + truckShare;
  // Never past the most the lot may be filled (cars only: 2 cells each).
  const vehicles = Math.max(4, Math.min(Math.round((fill * usable) / avgLen), Math.floor((0.85 * usable) / avgLen)));
  return {
    rows,
    cols,
    shape: 'rect',
    vehicles,
    truckShare,
    obstacles,
    minFill: 0.6,
    maxFill: 0.85,
    greed: breath ? 0.2 : 0.8 + 0.8 * Math.min(t, 1),
    gates: has('gate') ? (t > 0.6 ? 2 : 1) : 0,
    oneWays: has('oneWay') ? (t > 0.6 ? 2 : 1) : 0,
    mechanics,
    strict: true,
    minFreeStart: 0.15,
  };
}

/** The daily challenges: bigger, more spectacular lots (trucks, original shapes, islands of obstacles), as hard as levels 40-50. */
export function dailyRecipe(index: number): Recipe {
  const rng = createRng(index * 1597 + 31);
  const shapes: LotShape[] = ['L', 'cross', 'islands', 'rect', 'L', 'cross', 'islands'];
  const shape = shapes[index % shapes.length];
  // A cross needs room in its arms.
  const rows = shape === 'cross' ? rng.int(8, 9) : rng.int(7, 9);
  const cols = shape === 'cross' ? 7 : rng.int(6, 7);
  const obstacles = shape === 'islands' ? rng.int(5, 8) : rng.int(0, 3);
  const truckShare = 0.4;
  const voidCount = voidsFor(shape, rows, cols).length;
  const usable = rows * cols - voidCount - obstacles;
  const fill = rng.int(74, 82) / 100;
  return {
    rows,
    cols,
    shape,
    vehicles: Math.round((fill * usable) / (2 + truckShare)),
    truckShare,
    obstacles,
    minFill: 0.68,
    maxFill: 0.85,
    greed: 1.5,
    gates: index % 3 === 0 ? 1 : 0,
    oneWays: index % 3 === 1 ? 2 : 0,
    mechanics: ['truck', ...(obstacles > 0 ? (['obstacle'] as Mechanic[]) : []), ...(index % 3 === 0 ? (['gate'] as Mechanic[]) : []), ...(index % 3 === 1 ? (['oneWay'] as Mechanic[]) : [])],
    strict: true,
    minFreeStart: 0.1,
    climbMoves: 3000,
  };
}

/** The cells that are not parking places in a lot of this shape. */
export function voidsFor(shape: LotShape, rows: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  if (shape === 'L') {
    const a = Math.max(2, Math.floor(rows * 0.4));
    const b = Math.max(2, Math.ceil(cols * 0.5));
    for (let r = 0; r < a; r++) for (let c = cols - b; c < cols; c++) out.push([r, c]);
  } else if (shape === 'cross') {
    const a = Math.max(1, Math.floor(rows / 4));
    const b = Math.max(1, Math.floor(cols / 3));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r < a || r >= rows - a) && (c < b || c >= cols - b)) out.push([r, c]);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ building */

const seedFor = (id: number, attempt: number) => (Math.imul(id, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0;

type Candidate = { r: number; c: number; horizontal: boolean; len: 2 | 3; openDirs: Dir[] };

/** The cells on the way from a vehicle to the edge in `dir`, not counting the vehicle itself. */
function pathCells(board: Board, v: Vehicle, dir: Dir): number[] {
  const [dr, dc] = DELTA[dir];
  const [hr, hc] = [dir === 'L' || dir === 'R' ? v.r : dir === 'D' ? v.r + v.len - 1 : v.r, dir === 'U' || dir === 'D' ? v.c : dir === 'R' ? v.c + v.len - 1 : v.c];
  const out: number[] = [];
  for (let r = hr + dr, c = hc + dc; r >= 0 && r < board.rows && c >= 0 && c < board.cols; r += dr, c += dc) out.push(r * board.cols + c);
  return out;
}

/** The weighted pick of an index. */
function pickWeighted(rng: Rng, weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * What a new vehicle (its cells are marked) would do to the vehicles already placed: how many open ways out it closes, and how many
 * vehicles it shuts in completely (no way out left). Shutting vehicles in is what builds long chains of blocking vehicles.
 */
function blockedWays(board: Board, occ: Int16Array, placed: number, mark: Uint8Array, depth: number[]): { blocks: number; closes: number } {
  let blocks = 0;
  let closes = 0;
  for (let id = 0; id < placed; id++) {
    const u = board.level.vehicles[id];
    let open = 0;
    let stillOpen = 0;
    for (const d of vehicleDirs(u)) {
      if (!scanLine(board, occ, 0, id, d).open) continue;
      open++;
      if (pathCells(board, u, d).some((cell) => mark[cell])) blocks++;
      else stillOpen++;
    }
    // A vehicle that is already deep in a chain counts for more: shutting it in makes the chain longer.
    if (open > 0 && stillOpen === 0) closes += 1 + 0.7 * Math.max(0, depth[id] - 1);
  }
  return { blocks, closes };
}

function placeObstacles(rng: Rng, level: Level, count: number, shape: LotShape): void {
  const { rows, cols } = level;
  const taken = new Set(level.voids.map(([r, c]) => r * cols + c));
  const kinds = OBSTACLE_KINDS;
  const add = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols || taken.has(r * cols + c)) return false;
    taken.add(r * cols + c);
    level.obstacles.push({ r, c, kind: rng.pick(kinds) });
    return true;
  };
  let guard = 0;
  while (level.obstacles.length < count && guard++ < 200) {
    const r = rng.int(0, rows - 1);
    const c = rng.int(0, cols - 1);
    if (!add(r, c)) continue;
    // Islands: a bollard or a pot is followed by a neighbour or two.
    if (shape === 'islands') {
      const [dr, dc] = DELTA[rng.pick(['U', 'D', 'L', 'R'] as const)];
      if (level.obstacles.length < count && rng.next() < 0.7) add(r + dr, c + dc);
    }
  }
}

function emptyLevel(id: number, seed: number, recipe: Recipe): Level {
  return {
    id,
    seed,
    rows: recipe.rows,
    cols: recipe.cols,
    voids: voidsFor(recipe.shape, recipe.rows, recipe.cols),
    obstacles: [],
    vehicles: [],
    gates: [],
    oneWays: [],
    solution: [],
    optimal: 0,
    difficulty: 0,
    layers: 0,
    avgFree: 0,
    avgChain: 0,
    traps: 0,
    fill: 0,
    shape: recipe.shape,
    mechanics: [],
  };
}

/** Puts the vehicles in, one at a time, each with a way out. Returns false when the lot could not be filled. */
function placeVehicles(rng: Rng, level: Level, recipe: Recipe): boolean {
  const { rows, cols } = level;
  const board = compile(level);
  const occ = new Int16Array(rows * cols).fill(-1);
  const mark = new Uint8Array(rows * cols);
  let horizontals = 0;

  for (let k = 0; k < recipe.vehicles; k++) {
    // How deep each placed vehicle is in a chain of blockers (the round it would leave in).
    level.vehicles.length = k;
    const depth = solveBoard(board).layerOf;
    const wantTruck = rng.next() < recipe.truckShare;
    const lens: (2 | 3)[] = wantTruck ? [3, 2] : [2, 3];
    let candidates: Candidate[] = [];
    for (const len of lens) {
      if (len === 3 && recipe.truckShare === 0) continue;
      candidates = [];
      for (const horizontal of [true, false]) {
        const maxR = horizontal ? rows - 1 : rows - len;
        const maxC = horizontal ? cols - len : cols - 1;
        for (let r = 0; r <= maxR; r++) {
          for (let c = 0; c <= maxC; c++) {
            let free = true;
            for (let i = 0; i < len && free; i++) {
              const idx = horizontal ? r * cols + c + i : (r + i) * cols + c;
              if (board.solid[idx] || occ[idx] >= 0) free = false;
            }
            if (!free) continue;
            // Test the lines out with the vehicle in place: the front direction is drawn later, the axis is what counts.
            const probe: Vehicle = { id: k, r, c, dir: horizontal ? 'R' : 'D', len, color: 0 };
            level.vehicles[k] = probe;
            const open = vehicleDirs(probe).filter((d) => scanLine(board, occ, 0, k, d).open);
            if (open.length > 0) candidates.push({ r, c, horizontal, len, openDirs: open });
          }
        }
      }
      if (candidates.length > 0) {
        // Remember the length that gave candidates.
        break;
      }
    }
    if (candidates.length === 0) {
      level.vehicles.length = k;
      return false;
    }

    // Prefer places that close the ways out of earlier vehicles; keep both axes in use.
    const weights = candidates.map((cand) => {
      const probe: Vehicle = { id: k, r: cand.r, c: cand.c, dir: cand.horizontal ? 'R' : 'D', len: cand.len, color: 0 };
      level.vehicles[k] = probe;
      for (const [r, c] of vehicleCells(probe)) mark[r * cols + c] = 1;
      const { blocks, closes } = blockedWays(board, occ, k, mark, depth);
      for (const [r, c] of vehicleCells(probe)) mark[r * cols + c] = 0;
      let w = (1 + 0.5 * blocks) * Math.exp(recipe.greed * 2.4 * closes);
      if (cand.openDirs.length === 1) w *= 1.3;
      const share = k === 0 ? 0.5 : horizontals / k;
      const wantH = share < 0.45 ? 2 : share > 0.55 ? 0.5 : 1;
      w *= cand.horizontal ? wantH : 1 / wantH;
      return w;
    });
    const cand = candidates[pickWeighted(rng, weights)];
    const front: Dir = cand.horizontal ? (rng.next() < 0.5 ? 'L' : 'R') : rng.next() < 0.5 ? 'U' : 'D';
    const vehicle: Vehicle = { id: k, r: cand.r, c: cand.c, dir: front, len: cand.len, color: 0 };
    level.vehicles[k] = vehicle;
    for (const [r, c] of vehicleCells(vehicle)) occ[r * cols + c] = k;
    if (cand.horizontal) horizontals++;
  }
  assignColors(rng, level);
  return true;
}

/** Colours: all different while there are enough, neighbours apart. */
function assignColors(rng: Rng, level: Level) {
  const bag = rng.shuffle(Array.from({ length: VEHICLE_COLORS }, (_, i) => i));
  level.vehicles.forEach((v, i) => {
    v.color = i < bag.length ? bag[i] : rng.int(0, VEHICLE_COLORS - 1);
  });
}

/* ------------------------------------------------------------------------------------------ difficulty */

const scoreOf = (level: Level): number => {
  const sol = solve(level);
  return sol.solvable ? metrics(level, sol).difficulty : -1;
};

/**
 * Moves vehicles around, one at a time, keeping the lot solvable, until its difficulty is close to the target: a move is kept when
 * it brings the difficulty nearer to the target. This is what makes a lot hard: the first placement is random, this makes the
 * vehicles shut each other in.
 */
function climb(rng: Rng, level: Level, recipe: Recipe, target: number, iterations: number): Level {
  const { rows, cols } = level;
  const n = level.vehicles.length;
  const solid = compile(level).solid;
  const minFree = Math.max(1, Math.ceil(recipe.minFreeStart * n), recipe.strict ? 2 : 1);
  let current = level;
  let d = scoreOf(current);
  for (let it = 0; it < iterations && Math.abs(d - target) > 0.7; it++) {
    const id = rng.int(0, n - 1);
    const v = current.vehicles[id];
    const taken = solid.slice();
    for (const o of current.vehicles) if (o.id !== id) for (const [r, c] of vehicleCells(o)) taken[r * cols + c] = 1;
    const flip = rng.next() < 0.2;
    const horizontal = flip ? !isHorizontal(v) : isHorizontal(v);
    const r = rng.int(0, horizontal ? rows - 1 : rows - v.len);
    const c = rng.int(0, horizontal ? cols - v.len : cols - 1);
    let free = true;
    for (let i = 0; i < v.len && free; i++) if (taken[horizontal ? r * cols + c + i : (r + i) * cols + c]) free = false;
    if (!free) continue;
    const dir: Dir = horizontal === isHorizontal(v) ? v.dir : horizontal ? (rng.next() < 0.5 ? 'L' : 'R') : rng.next() < 0.5 ? 'U' : 'D';
    const next: Level = { ...current, vehicles: current.vehicles.map((x) => (x.id === id ? { ...x, r, c, dir } : x)) };
    if (recipe.strict) {
      const h = horizontalShare(next);
      if (h < 0.32 || h > 0.68) continue;
    }
    const nd = scoreOf(next);
    if (nd < 0 || Math.abs(nd - target) > Math.abs(d - target)) continue;
    const board = compile(next);
    if (freeVehicles(board, createState(board)).length < minFree) continue;
    current = next;
    d = nd;
  }
  return current;
}

/* ------------------------------------------------------------------------------------------ gates and one-way lanes */

const withGate = (level: Level, gate: Gate): Level => ({ ...level, gates: [...level.gates, gate] });
const withOneWay = (level: Level, w: OneWay): Level => ({ ...level, oneWays: [...level.oneWays, w] });

/** A gate on the edge a free vehicle would leave by, closed until `need` vehicles are gone; kept only if it changes the start. */
function addGate(rng: Rng, level: Level): Level | null {
  const board = compile(level);
  const state = createState(board);
  const free0 = freeVehicles(board, state);
  const n = level.vehicles.length;
  const lanesOf = (side: Dir) => (side === 'L' || side === 'R' ? level.rows : level.cols);
  for (const id of rng.shuffle(free0)) {
    const v = level.vehicles[id];
    const open = vehicleDirs(v).filter((d) => scanLine(board, state.occ, 0, id, d).open);
    // Both ways must not be open: otherwise the vehicle just leaves the other way and the gate means nothing.
    if (open.length !== 1) continue;
    const side = open[0];
    const lane = laneOf(v);
    const extra = rng.next() < 0.4 && lane + 1 < lanesOf(side) ? 1 : 0;
    for (const need of rng.shuffle([2, 3, 4].filter((x) => x <= n - 1))) {
      const candidate = withGate(level, { side, from: lane, to: lane + extra, need });
      const sol = solve(candidate);
      if (!sol.solvable) continue;
      // The gate must hold the vehicle back: it is no longer free at the start.
      if (sol.freeAt[0].includes(id)) continue;
      return candidate;
    }
  }
  return null;
}

/** An arrow that allows only one of the two ways of a vehicle; kept only if the lot can still be emptied and the arrow matters. */
function addOneWay(rng: Rng, level: Level): Level | null {
  const board = compile(level);
  const state = createState(board);
  const used = new Set(level.oneWays.map((w) => `${w.dir === 'L' || w.dir === 'R' ? 'H' : 'V'}${w.lane}`));
  const base = solve(level);
  const ids = rng.shuffle(level.vehicles.map((v) => v.id));
  for (const id of ids) {
    const v = level.vehicles[id];
    const key = `${isHorizontal(v) ? 'H' : 'V'}${laneOf(v)}`;
    if (used.has(key)) continue;
    const [a, b] = vehicleDirs(v);
    const openA = scanLine(board, state.occ, 0, id, a).open;
    const openB = scanLine(board, state.occ, 0, id, b).open;
    // The arrow points at the way that is shut at the start (the vehicle must wait), or at either way when both are open.
    const allowed: Dir | null = openA && !openB ? b : openB && !openA ? a : openA && openB ? rng.pick([a, b]) : null;
    if (!allowed) continue;
    const candidate = withOneWay(level, { dir: allowed, lane: laneOf(v) });
    const sol = solve(candidate);
    if (!sol.solvable) continue;
    // It matters when it changes something: the order of rounds, or the vehicle's way out.
    const changed = sol.layers !== base.layers || sol.layerOf[id] !== base.layerOf[id] || sol.dirs[sol.order.indexOf(id)] !== base.dirs[base.order.indexOf(id)];
    if (!changed) continue;
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------ checks */

/** Vehicles that neither block nor are blocked by anything: they could be taken out of the level. */
export function isolatedVehicles(level: Level): number {
  const board = compile(level);
  const lines = level.vehicles.map((v) => new Set(vehicleDirs(v).flatMap((d) => pathCells(board, v, d))));
  const cells = level.vehicles.map((v) => new Set(vehicleCells(v).map(([r, c]) => r * level.cols + c)));
  const solidInLine = (i: number) => [...lines[i]].some((cell) => board.solid[cell]);
  let isolated = 0;
  for (let i = 0; i < level.vehicles.length; i++) {
    let interacts = solidInLine(i);
    for (let j = 0; j < level.vehicles.length && !interacts; j++) {
      if (i === j) continue;
      if ([...cells[j]].some((cell) => lines[i].has(cell)) || [...cells[i]].some((cell) => lines[j].has(cell))) interacts = true;
    }
    if (!interacts) isolated++;
  }
  return isolated;
}

/** The share of vehicles that are horizontal. */
export const horizontalShare = (level: Level): number => level.vehicles.filter(isHorizontal).length / Math.max(1, level.vehicles.length);

/** The share of the places (not counting obstacles and voids) that vehicles take. */
export function fillOf(level: Level): number {
  const usable = level.rows * level.cols - level.voids.length - level.obstacles.length;
  const taken = level.vehicles.reduce((s, v) => s + v.len, 0);
  return usable > 0 ? taken / usable : 0;
}

/** Is the mechanic really needed by the level? (a variant without it must differ at the start of the level) */
export function mechanicMatters(level: Level, m: Mechanic): boolean {
  const board = compile(level);
  const free = new Set(freeVehicles(board, createState(board)));
  switch (m) {
    case 'obstacle': {
      const bare = { ...level, obstacles: [] as Obstacle[] };
      const b = compile(bare);
      return freeVehicles(b, createState(b)).some((id) => !free.has(id));
    }
    case 'truck': {
      // A truck is in the way of someone at the start, or itself shut in.
      const hasTruck = level.vehicles.some((v) => v.len === 3);
      const state = createState(board);
      const blocksSomeone = level.vehicles.some((v) =>
        vehicleDirs(v).some((d) => {
          const s = scanLine(board, state.occ, 0, v.id, d);
          return s.blocker?.type === 'vehicle' && level.vehicles[s.blocker.id].len === 3;
        }),
      );
      return hasTruck && blocksSomeone;
    }
    case 'gate': {
      const open = { ...level, gates: level.gates.map((g) => ({ ...g, need: 0 })) };
      const b = compile(open);
      return freeVehicles(b, createState(b)).some((id) => !free.has(id));
    }
    case 'oneWay':
      return level.oneWays.length > 0;
  }
}

export function qualityProblem(level: Level, recipe: Recipe): string | null {
  const sol = solve(level);
  if (!sol.solvable) return 'not solvable';
  if (recipe.strict) {
    const fill = fillOf(level);
    if (fill < recipe.minFill - 0.001 || fill > recipe.maxFill + 0.001) return `fill ${fill.toFixed(2)} out of range`;
    const h = horizontalShare(level);
    if (h < 0.3 || h > 0.7) return `axes ${h.toFixed(2)}`;
    if (isolatedVehicles(level) > 0) return 'an isolated vehicle';
  }
  const board = compile(level);
  const free0 = freeVehicles(board, createState(board)).length;
  if (free0 / level.vehicles.length < recipe.minFreeStart - 1e-9) return `only ${free0} free at the start`;
  if (recipe.tutorial && !mechanicMatters(level, recipe.tutorial)) return `the ${recipe.tutorial} does not matter`;
  if (recipe.tutorial === 'truck' && !level.vehicles.some((v) => v.len === 3)) return 'no truck';
  return null;
}

/** One attempt at a level. Null when the recipe could not be carried out with this seed. */
export function generateLevel(id: number, recipe: Recipe, seed: number, target?: number): Level | null {
  const rng = createRng(seed);
  let level = emptyLevel(id, seed, recipe);
  placeObstacles(rng, level, recipe.obstacles, recipe.shape);
  if (!placeVehicles(rng, level, recipe)) return null;
  if (target !== undefined && !recipe.tutorial && id > 3) level = climb(rng, level, recipe, target, recipe.climbMoves ?? 600);
  for (let i = 0; i < recipe.gates; i++) {
    const next = addGate(rng, level);
    if (!next) break;
    level = next;
  }
  for (let i = 0; i < recipe.oneWays; i++) {
    const next = addOneWay(rng, level);
    if (!next) break;
    level = next;
  }
  if (recipe.gates > 0 && level.gates.length === 0 && recipe.mechanics.includes('gate') && (recipe.tutorial === 'gate' || recipe.strict)) return null;
  if (recipe.oneWays > 0 && level.oneWays.length === 0 && recipe.mechanics.includes('oneWay') && (recipe.tutorial === 'oneWay' || recipe.strict)) return null;
  const problem = qualityProblem(level, recipe);
  if (problem) return null;
  const sol = solve(level);
  const m = metrics(level, sol);
  return {
    ...level,
    solution: sol.order,
    optimal: level.vehicles.length,
    difficulty: m.difficulty,
    layers: m.layers,
    avgFree: m.avgFree,
    avgChain: m.avgChain,
    traps: m.traps,
    fill: Math.round(fillOf(level) * 100) / 100,
    mechanics: mechanicsOf(level),
    tutorial: recipe.tutorial,
  };
}

/* ------------------------------------------------------------------------------------------ the curve */

/**
 * The difficulty a level is steered toward: a regular climb with no sudden fall. Levels 1-5 are the very easy ones. The numbers
 * come from the measured difficulty of generated lots (see scripts/level-stats.ts).
 */
export function targetDifficulty(id: number): number {
  const base = id <= 5 ? 3.3 + 0.5 * (id - 1) : 5.5 + 0.5 * (Math.min(id, 50) - 6) + 0.15 * Math.max(0, id - 50);
  // The climb stops there: past it a bigger lot, not a higher number, is what makes a level harder.
  const capped = Math.min(base, MAX_TARGET);
  return isBreathingLevel(id) ? capped * 0.8 : capped;
}

const MAX_TARGET = 40;

export type BuildOptions = {
  recipe?: Recipe;
  /** The difficulty to come closest to (the curve by default). Null = the first valid attempt. */
  target?: number | null;
  attempts?: number;
  /** Levels easier than this are thrown away (the daily challenges must all be spectacular). */
  minDifficulty?: number;
  /** Stop as soon as the difficulty is this close to the target. */
  tolerance?: number;
};

/** The level of a given number: the best of a few seeded attempts. Always the same for the same number. */
export function buildLevel(id: number, options: BuildOptions = {}): Level {
  const recipe = options.recipe ?? recipeFor(id);
  const steered = options.target !== null;
  const target = options.target ?? targetDifficulty(id);
  const attempts = options.attempts ?? 120;
  const tolerance = options.tolerance ?? 1.2;
  let best: Level | null = null;
  for (let k = 0; k < attempts; k++) {
    const level = generateLevel(id, recipe, seedFor(id, k), steered ? target : undefined);
    if (!level) continue;
    if (options.minDifficulty !== undefined && level.difficulty < options.minDifficulty) continue;
    if (!steered) return level;
    if (!best || Math.abs(level.difficulty - target) < Math.abs(best.difficulty - target)) best = level;
    if (Math.abs(best.difficulty - target) <= tolerance) break;
  }
  if (!best) throw new Error(`No valid level for number ${id} after ${attempts} attempts`);
  return best;
}
