import { createRng, type Rng } from '../core/rng';
import { DELTA, OPPOSITE } from '../core/grid';
import { compile, createState, freeVehicles, scanLine, type Board } from './engine';
import { isBreathingLevel, mechanicsForLevel } from './mechanics';
import { metrics, solve } from './solver';
import {
  OBSTACLE_KINDS,
  VEHICLE_COLORS,
  isHorizontal,
  leadCell,
  mechanicsOf,
  travelDir,
  vehicleCells,
  type Dir,
  type Gate,
  type Level,
  type LotShape,
  type Mechanic,
  type OneWay,
  type Vehicle,
} from './types';

/* ------------------------------------------------------------------------------------------
 * The generator. A lot is built BACKWARDS, so it can always be emptied: starting from an empty
 * lot, vehicles are added one at a time, each with the direction (and the arrow on its roof)
 * chosen so that its way to the edge is clear given the vehicles already there. Tapping the
 * vehicles in the reverse order of their arrival is then a solution. A search then moves
 * vehicles around, keeping the lot solvable, to reach the difficulty of the curve with few
 * vehicles free at the start. Gates and one-way arrows are added last and kept only if the
 * solver still empties the lot.
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
  /** The share of the vehicles that are free at the start must be between these two. */
  minFreeStart: number;
  maxFreeStart: number;
  /** How many moves of vehicles the search for the target difficulty may try (1500 by default). */
  climbMoves?: number;
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

/** The size of the lot and the number of vehicles of a level of the campaign (width x height, in places). */
export function sizeFor(id: number): { cols: number; rows: number; cars: number } {
  if (id <= 1) return { cols: 4, rows: 5, cars: 4 };
  if (id <= 5) return { cols: 5, rows: 6, cars: 6 + (id - 2) };
  if (id <= 20) {
    const t = (id - 6) / 14;
    return { cols: Math.round(lerp(6, 7, t)), rows: Math.round(lerp(7, 9, t)), cars: Math.round(lerp(10, 18, t)) };
  }
  if (id <= 50) {
    const t = (id - 21) / 29;
    return { cols: Math.round(lerp(7, 8, t)), rows: Math.round(lerp(9, 11, t)), cars: Math.round(lerp(18, 30, t)) };
  }
  return { cols: 8, rows: 11, cars: 30 + Math.min(3, Math.floor((id - 50) / 150)) };
}

export function recipeFor(id: number): Recipe {
  const { cols, rows, cars } = sizeFor(id);
  if (id <= 5) {
    return {
      rows,
      cols,
      shape: 'rect',
      vehicles: cars,
      truckShare: 0,
      obstacles: 0,
      minFill: 0,
      maxFill: 0.9,
      greed: id === 1 ? 0 : 1,
      gates: 0,
      oneWays: 0,
      mechanics: [],
      strict: false,
      minFreeStart: id === 1 ? 0.5 : 0.35,
      maxFreeStart: 1,
    };
  }
  const { mechanics, tutorial } = mechanicsForLevel(id);
  const has = (m: Mechanic) => mechanics.includes(m);
  const t = clamp((id - 6) / 44, 0, 1);
  const breath = isBreathingLevel(id);
  const cells = rows * cols;
  const obstacles = has('obstacle') ? clamp(Math.round(cells * 0.025) + (tutorial ? 1 : 0), 1, 5) : 0;
  const truckShare = has('truck') ? (tutorial ? 0.3 : clamp(0.15 + 0.1 * t, 0.15, 0.3)) : 0;
  // A tutorial is simpler: a lot of the usual size, with about two thirds of the vehicles.
  const count = tutorial ? Math.max(6, Math.round(cars * 0.65)) : breath ? Math.max(6, Math.round(cars * 0.8)) : cars;
  const easy = tutorial || breath;
  return {
    rows,
    cols,
    shape: 'rect',
    vehicles: count,
    truckShare,
    obstacles,
    minFill: 0.3,
    maxFill: 0.88,
    greed: easy ? 0.7 : 1.1 + 0.5 * t,
    gates: has('gate') ? (t > 0.6 ? 2 : 1) : 0,
    oneWays: has('oneWay') ? (t > 0.6 ? 3 : 2) : 0,
    mechanics,
    tutorial,
    strict: true,
    minFreeStart: easy ? 0.3 : 0.15,
    maxFreeStart: easy ? 0.55 : 0.3,
  };
}

/** The daily challenges: bigger, more spectacular lots (trucks, original shapes, islands of obstacles), as hard as levels 40-50. */
export function dailyRecipe(index: number): Recipe {
  const rng = createRng(index * 1597 + 31);
  const shapes: LotShape[] = ['L', 'cross', 'islands', 'rect', 'L', 'cross', 'islands'];
  const shape = shapes[index % shapes.length];
  // A cross needs room in its arms.
  const rows = shape === 'cross' ? rng.int(10, 11) : rng.int(9, 11);
  const cols = shape === 'cross' ? 8 : rng.int(7, 8);
  const obstacles = shape === 'islands' ? rng.int(6, 10) : rng.int(0, 4);
  const truckShare = 0.4;
  const usable = rows * cols - voidsFor(shape, rows, cols).length - obstacles;
  const fill = rng.int(58, 70) / 100;
  return {
    rows,
    cols,
    shape,
    vehicles: Math.round((fill * usable) / (2 + truckShare)),
    truckShare,
    obstacles,
    minFill: 0.4,
    maxFill: 0.88,
    greed: 1.6,
    gates: index % 3 === 0 ? 1 : 0,
    oneWays: index % 3 === 1 ? 3 : 0,
    mechanics: ['truck', ...(obstacles > 0 ? (['obstacle'] as Mechanic[]) : []), ...(index % 3 === 0 ? (['gate'] as Mechanic[]) : []), ...(index % 3 === 1 ? (['oneWay'] as Mechanic[]) : [])],
    strict: true,
    minFreeStart: 0.12,
    maxFreeStart: 0.3,
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

/** The cells on the way from a vehicle to the edge, in its one direction, not counting the vehicle itself. */
export function pathCells(board: Board, v: Vehicle): number[] {
  const dir = travelDir(v);
  const [dr, dc] = DELTA[dir];
  const [hr, hc] = leadCell(v, dir);
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

/** A vehicle of this axis, length and way of going placed at (r, c): `dir` is its front, `back` makes it reverse. */
function make(id: number, r: number, c: number, len: 2 | 3, travel: Dir, back: boolean): Vehicle {
  return { id, r, c, dir: back ? OPPOSITE[travel] : travel, len, color: 0, ...(back ? { back: true } : {}) };
}

function placeObstacles(rng: Rng, level: Level, count: number, shape: LotShape): void {
  const { rows, cols } = level;
  const taken = new Set(level.voids.map(([r, c]) => r * cols + c));
  const add = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols || taken.has(r * cols + c)) return false;
    taken.add(r * cols + c);
    level.obstacles.push({ r, c, kind: rng.pick(OBSTACLE_KINDS) });
    return true;
  };
  let guard = 0;
  while (level.obstacles.length < count && guard++ < 300) {
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
    freeStart: 0,
    shape: recipe.shape,
    mechanics: [],
  };
}

type Candidate = { r: number; c: number; horizontal: boolean; len: 2 | 3; travel: Dir };

/** Puts the vehicles in, one at a time, each with a clear way out. Returns false when the lot could not be filled. */
function placeVehicles(rng: Rng, level: Level, recipe: Recipe): boolean {
  const { rows, cols } = level;
  const board = compile(level);
  const occ = new Int16Array(rows * cols).fill(-1);
  const mark = new Uint8Array(rows * cols);
  let horizontals = 0;

  for (let k = 0; k < recipe.vehicles; k++) {
    // Which of the vehicles already there can leave right now (their way is clear): the new one should stand in their way.
    level.vehicles.length = k;
    const placedFree: boolean[] = [];
    for (let id = 0; id < k; id++) placedFree.push(scanLine(board, occ, 0, id).open);
    const wantTruck = rng.next() < recipe.truckShare;
    const lens: (2 | 3)[] = wantTruck ? [3, 2] : [2, 3];
    let candidates: Candidate[] = [];
    for (const len of lens) {
      if (len === 3 && recipe.truckShare === 0) continue;
      candidates = [];
      for (const horizontal of [true, false]) {
        const maxR = horizontal ? rows - 1 : rows - len;
        const maxC = horizontal ? cols - len : cols - 1;
        const travels: Dir[] = horizontal ? ['L', 'R'] : ['U', 'D'];
        for (let r = 0; r <= maxR; r++) {
          for (let c = 0; c <= maxC; c++) {
            let free = true;
            for (let i = 0; i < len && free; i++) {
              const idx = horizontal ? r * cols + c + i : (r + i) * cols + c;
              if (board.solid[idx] || occ[idx] >= 0 || board.arrow[idx] !== 0) free = false;
            }
            if (!free) continue;
            for (const travel of travels) {
              level.vehicles[k] = make(k, r, c, len, travel, false);
              // The way out must be clear (the arrow on the roof is then drawn toward it).
              if (scanLine(board, occ, 0, k).open) candidates.push({ r, c, horizontal, len, travel });
            }
          }
        }
      }
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) {
      level.vehicles.length = k;
      // The lanes are all taken: a lot a few vehicles short of the target is fine, a much emptier one is not.
      if (k >= Math.ceil(recipe.vehicles * 0.92)) break;
      return false;
    }

    // Prefer places that stand in the way of vehicles that could leave; keep both axes in use.
    const weights = candidates.map((cand) => {
      const probe = make(k, cand.r, cand.c, cand.len, cand.travel, false);
      for (const [r, c] of vehicleCells(probe)) mark[r * cols + c] = 1;
      let blocked = 0;
      for (let id = 0; id < k; id++) {
        if (!placedFree[id]) continue;
        for (const cell of pathCells(board, level.vehicles[id])) {
          if (mark[cell]) {
            blocked++;
            break;
          }
        }
      }
      for (const [r, c] of vehicleCells(probe)) mark[r * cols + c] = 0;
      // Standing in front of two or three vehicles at once is what makes long chains.
      let w = Math.exp(recipe.greed * 1.5 * Math.min(blocked, 3));
      const share = k === 0 ? 0.5 : horizontals / k;
      const wantH = share < 0.45 ? 2 : share > 0.55 ? 0.5 : 1;
      w *= cand.horizontal ? wantH : 1 / wantH;
      return w;
    });
    const cand = candidates[pickWeighted(rng, weights)];
    // One vehicle in four has its arrow pointing to the rear: it reverses out.
    const back = rng.next() < 0.25;
    const vehicle = make(k, cand.r, cand.c, cand.len, cand.travel, back);
    level.vehicles[k] = vehicle;
    for (const [r, c] of vehicleCells(vehicle)) occ[r * cols + c] = k;
    if (cand.horizontal) horizontals++;
  }
  assignColors(rng, level);
  return true;
}

/** Colours: all different while there are enough. */
function assignColors(rng: Rng, level: Level) {
  const bag = rng.shuffle(Array.from({ length: VEHICLE_COLORS }, (_, i) => i));
  level.vehicles.forEach((v, i) => {
    v.color = i < bag.length ? bag[i] : rng.int(0, VEHICLE_COLORS - 1);
  });
}

/* ------------------------------------------------------------------------------------------ difficulty */

const freeShareOf = (level: Level): number => {
  const board = compile(level);
  return freeVehicles(board, createState(board)).length / Math.max(1, level.vehicles.length);
};

const scoreOf = (level: Level): number => {
  const sol = solve(level);
  return sol.solvable ? metrics(level, sol).difficulty : -1;
};

/**
 * Moves vehicles around, one at a time, keeping the lot solvable, until its difficulty is close to the target and few vehicles are
 * free at the start: a move is kept when it does not take the lot further from the target.
 */
function climb(rng: Rng, level: Level, recipe: Recipe, target: number, iterations: number): Level {
  const { rows, cols } = level;
  const n = level.vehicles.length;
  const solid = compile(level).solid;
  const penalty = (d: number, share: number) => Math.abs(d - target) + 400 * Math.max(0, share - recipe.maxFreeStart) + 400 * Math.max(0, recipe.minFreeStart - share);
  let current = level;
  let d = scoreOf(current);
  let p = penalty(d, freeShareOf(current));
  for (let it = 0; it < iterations && p > 0.7; it++) {
    const id = rng.int(0, n - 1);
    const v = current.vehicles[id];
    const taken = solid.slice();
    for (const o of current.vehicles) if (o.id !== id) for (const [r, c] of vehicleCells(o)) taken[r * cols + c] = 1;
    for (const w of current.oneWays) taken[w.r * cols + w.c] = 1;
    const flip = rng.next() < 0.15;
    const horizontal = flip ? !isHorizontal(v) : isHorizontal(v);
    const r = rng.int(0, horizontal ? rows - 1 : rows - v.len);
    const c = rng.int(0, horizontal ? cols - v.len : cols - 1);
    let free = true;
    for (let i = 0; i < v.len && free; i++) if (taken[horizontal ? r * cols + c + i : (r + i) * cols + c]) free = false;
    if (!free) continue;
    const travel: Dir = horizontal ? (rng.next() < 0.5 ? 'L' : 'R') : rng.next() < 0.5 ? 'U' : 'D';
    const moved: Vehicle = { ...make(id, r, c, v.len, travel, rng.next() < 0.25), color: v.color };
    const next: Level = { ...current, vehicles: current.vehicles.map((x) => (x.id === id ? moved : x)) };
    if (recipe.strict) {
      const h = horizontalShare(next);
      if (h < 0.32 || h > 0.68) continue;
    }
    const nd = scoreOf(next);
    if (nd < 0) continue;
    const np = penalty(nd, freeShareOf(next));
    if (np > p) continue;
    current = next;
    d = nd;
    p = np;
  }
  return current;
}

/* ------------------------------------------------------------------------------------------ gates and arrows */

const withGate = (level: Level, gate: Gate): Level => ({ ...level, gates: [...level.gates, gate] });

/** A gate on the edge a free vehicle would leave by, closed until `need` vehicles are gone; kept only if it holds that vehicle back. */
function addGate(rng: Rng, level: Level): Level | null {
  const board = compile(level);
  const state = createState(board);
  const free0 = freeVehicles(board, state);
  const n = level.vehicles.length;
  for (const id of rng.shuffle(free0)) {
    const v = level.vehicles[id];
    const side = travelDir(v);
    const lane = side === 'L' || side === 'R' ? v.r : v.c;
    const lanes = side === 'L' || side === 'R' ? level.rows : level.cols;
    const extra = rng.next() < 0.4 && lane + 1 < lanes ? 1 : 0;
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

/**
 * A one-way arrow on an empty place of the way out of a vehicle (the edge place when it is empty), pointing the way that vehicle
 * goes. Any vehicle that would cross it the other way is stopped, so it is kept only if the lot can still be emptied.
 */
function addOneWay(rng: Rng, level: Level): Level | null {
  const board = compile(level);
  const state = createState(board);
  const used = new Set(level.oneWays.map((w) => w.r * level.cols + w.c));
  for (const id of rng.shuffle(level.vehicles.map((v) => v.id))) {
    const v = level.vehicles[id];
    const cells = pathCells(board, v).filter((i) => state.occ[i] < 0 && !board.solid[i] && !used.has(i));
    if (cells.length === 0) continue;
    // The last place before the edge when it is free (the arrow is then painted on the edge of the lot), else any free place.
    const edge = pathCells(board, v).slice(-1)[0];
    const at = cells.includes(edge) ? edge : cells[rng.int(0, cells.length - 1)];
    const w: OneWay = { r: Math.floor(at / level.cols), c: at % level.cols, dir: travelDir(v) };
    const candidate = { ...level, oneWays: [...level.oneWays, w] };
    if (!solve(candidate).solvable) continue;
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------ checks */

/** Vehicles that are free at the start and stand in nobody's way: they could be taken out of the level. */
export function isolatedVehicles(level: Level): number {
  const board = compile(level);
  const state = createState(board);
  const lines = level.vehicles.map((v) => new Set(pathCells(board, v)));
  let isolated = 0;
  for (const v of level.vehicles) {
    if (!scanLine(board, state.occ, 0, v.id).open) continue;
    const cells = vehicleCells(v).map(([r, c]) => r * level.cols + c);
    const blocksSomeone = level.vehicles.some((o) => o.id !== v.id && cells.some((cell) => lines[o.id].has(cell)));
    if (!blocksSomeone) isolated++;
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

/** Is the mechanic really in the level, and does it show? (a variant without it must differ at the start of the level) */
export function mechanicMatters(level: Level, m: Mechanic): boolean {
  const board = compile(level);
  switch (m) {
    case 'obstacle':
      // A vehicle has one way to go, so an obstacle on it would make the level impossible: obstacles shape the lot (what can park where)
      // and stand in the way of nothing. It matters when it is there.
      return level.obstacles.length > 0;
    case 'truck': {
      // A truck is in the way of someone at the start.
      const state = createState(board);
      return level.vehicles.some((v) => {
        const s = scanLine(board, state.occ, 0, v.id);
        return s.blocker?.type === 'vehicle' && level.vehicles[s.blocker.id].len === 3;
      });
    }
    case 'gate': {
      const free = new Set(freeVehicles(board, createState(board)));
      const open = { ...level, gates: level.gates.map((g) => ({ ...g, need: 0 })) };
      const b = compile(open);
      return freeVehicles(b, createState(b)).some((id) => !free.has(id));
    }
    case 'oneWay':
      // An arrow is on the way of a vehicle that goes the way it shows.
      return level.oneWays.some((w) => level.vehicles.some((v) => travelDir(v) === w.dir && pathCells(board, v).includes(w.r * level.cols + w.c)));
  }
}

export function qualityProblem(level: Level, recipe: Recipe): string | null {
  const sol = solve(level);
  if (!sol.solvable) return 'not solvable';
  const fill = fillOf(level);
  if (recipe.strict) {
    if (fill < recipe.minFill - 0.001 || fill > recipe.maxFill + 0.001) return `fill ${fill.toFixed(2)} out of range`;
    const h = horizontalShare(level);
    if (h < 0.3 || h > 0.7) return `axes ${h.toFixed(2)}`;
    // A few free vehicles may stand in nobody's way (the easy exits), but not most of them.
    const free = Math.round(freeShareOf(level) * level.vehicles.length);
    if (isolatedVehicles(level) > Math.ceil(free * 0.4)) return 'too many free vehicles that block nobody';
  }
  const share = freeShareOf(level);
  if (share < recipe.minFreeStart - 1e-9 || share > recipe.maxFreeStart + 1e-9) return `${Math.round(share * 100)} % free at the start`;
  if (freeShareOf(level) * level.vehicles.length < 1) return 'nothing is free';
  if (recipe.tutorial && !mechanicMatters(level, recipe.tutorial)) return `the ${recipe.tutorial} does not matter`;
  return null;
}

/** One attempt at a level. Null when the recipe could not be carried out with this seed. */
export function generateLevel(id: number, recipe: Recipe, seed: number, target?: number): Level | null {
  const rng = createRng(seed);
  let level = emptyLevel(id, seed, recipe);
  placeObstacles(rng, level, recipe.obstacles, recipe.shape);
  if (!placeVehicles(rng, level, recipe)) {
    if (process.env.GEN_DEBUG) console.log('reject', id, 'placement');
    return null;
  }
  if (target !== undefined && id > 1) level = climb(rng, level, recipe, target, recipe.climbMoves ?? 1500);
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
  if (process.env.GEN_DEBUG && recipe.gates > 0 && level.gates.length === 0) console.log('reject', id, 'no gate');
  if (recipe.oneWays > 0 && level.oneWays.length === 0 && process.env.GEN_DEBUG) console.log('reject', id, 'no arrow');
  if (recipe.gates > 0 && level.gates.length === 0 && recipe.mechanics.includes('gate') && (recipe.tutorial === 'gate' || recipe.strict)) return null;
  if (recipe.oneWays > 0 && level.oneWays.length === 0 && recipe.mechanics.includes('oneWay') && (recipe.tutorial === 'oneWay' || recipe.strict)) return null;
  const problem = qualityProblem(level, recipe);
  if (problem) {
    if (process.env.GEN_DEBUG) console.log('reject', id, problem);
    return null;
  }
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
    freeStart: m.freeStart,
    mechanics: mechanicsOf(level),
    tutorial: recipe.tutorial,
  };
}

/* ------------------------------------------------------------------------------------------ the curve */

const MAX_TARGET = 48;

/**
 * The difficulty a level is steered toward: a regular climb with no sudden fall, a little easier one level out of eight. The numbers
 * come from the measured difficulty of generated lots (see scripts/level-stats.ts).
 */
export function targetDifficulty(id: number): number {
  const base = id <= 5 ? 4 + 1.5 * (id - 1) : 12 + 0.55 * (Math.min(id, 50) - 6) + 0.15 * Math.max(0, id - 50);
  const capped = Math.min(base, MAX_TARGET);
  return isBreathingLevel(id) ? capped * 0.8 : capped;
}

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
  const tolerance = options.tolerance ?? 1.5;
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


