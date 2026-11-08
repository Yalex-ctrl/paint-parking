import { DELTA, type Dir } from '../core/grid';
import { isHorizontal, laneOf, leadCell, vehicleCells, vehicleDirs, type Level } from './types';

/* ------------------------------------------------------------------------------------------
 * The rules of the parking. The same compiled form is used by the game, the solver and the
 * generator, so they can never disagree about what a gesture does.
 * ---------------------------------------------------------------------------------------- */

export type Board = {
  level: Level;
  rows: number;
  cols: number;
  /** 1 on a cell nothing can enter: a void of the lot shape or an obstacle. */
  solid: Uint8Array;
  /** For each row / column, the only direction its vehicles may leave in (null = both). */
  oneWayRow: (Dir | null)[];
  oneWayCol: (Dir | null)[];
};

export function compile(level: Level): Board {
  const { rows, cols } = level;
  const solid = new Uint8Array(rows * cols);
  for (const [r, c] of level.voids) solid[r * cols + c] = 1;
  for (const o of level.obstacles) solid[o.r * cols + o.c] = 1;
  const oneWayRow: (Dir | null)[] = new Array(rows).fill(null);
  const oneWayCol: (Dir | null)[] = new Array(cols).fill(null);
  for (const w of level.oneWays) {
    if (w.dir === 'L' || w.dir === 'R') oneWayRow[w.lane] = w.dir;
    else oneWayCol[w.lane] = w.dir;
  }
  return { level, rows, cols, solid, oneWayRow, oneWayCol };
}

/** What stops a vehicle. */
export type Blocker = { type: 'vehicle'; id: number } | { type: 'obstacle' } | { type: 'gate'; index: number } | { type: 'oneWay' };

export type Scan = {
  /** True when the vehicle can leave the lot in this direction. */
  open: boolean;
  /** Free cells between the head of the vehicle and the first thing in the way (or the edge). */
  steps: number;
  blocker: Blocker | null;
};

export type GameState = {
  /** The vehicle on each cell, -1 when empty. */
  occ: Int16Array;
  /** 1 once a vehicle has left. */
  gone: Uint8Array;
  exited: number;
  moves: number;
  collisions: number;
  finished: boolean;
};

export function createState(board: Board): GameState {
  const { level, rows, cols } = board;
  const occ = new Int16Array(rows * cols).fill(-1);
  for (const v of level.vehicles) for (const [r, c] of vehicleCells(v)) occ[r * cols + c] = v.id;
  return { occ, gone: new Uint8Array(level.vehicles.length), exited: 0, moves: 0, collisions: 0, finished: level.vehicles.length === 0 };
}

export function cloneState(s: GameState): GameState {
  return { ...s, occ: s.occ.slice(), gone: s.gone.slice() };
}

/**
 * Follows the line of a vehicle from its head toward the edge in `dir`: the generator uses it on partial lots (no gate yet), so
 * it takes plain arrays. `gates` is empty there.
 */
export function scanLine(board: Board, occ: Int16Array, exited: number, vehicleId: number, dir: Dir): Scan {
  const v = board.level.vehicles[vehicleId];
  const [dr, dc] = DELTA[dir];
  const [hr, hc] = leadCell(v, dir);
  let r = hr + dr;
  let c = hc + dc;
  let steps = 0;
  while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
    const i = r * board.cols + c;
    if (board.solid[i]) return { open: false, steps, blocker: { type: 'obstacle' } };
    const o = occ[i];
    if (o >= 0 && o !== vehicleId) return { open: false, steps, blocker: { type: 'vehicle', id: o } };
    steps++;
    r += dr;
    c += dc;
  }
  const horizontal = isHorizontal(v);
  const allowed = horizontal ? board.oneWayRow[v.r] : board.oneWayCol[v.c];
  if (allowed && allowed !== dir) return { open: false, steps, blocker: { type: 'oneWay' } };
  const lane = laneOf(v);
  const gates = board.level.gates;
  for (let g = 0; g < gates.length; g++) {
    const gate = gates[g];
    if (gate.side === dir && lane >= gate.from && lane <= gate.to && exited < gate.need) return { open: false, steps, blocker: { type: 'gate', index: g } };
  }
  return { open: true, steps, blocker: null };
}

export const scan = (board: Board, state: GameState, vehicleId: number, dir: Dir): Scan => scanLine(board, state.occ, state.exited, vehicleId, dir);

/** The directions in which a vehicle can leave right now (forward first). */
export function openDirs(board: Board, state: GameState, vehicleId: number): Dir[] {
  if (state.gone[vehicleId]) return [];
  return vehicleDirs(board.level.vehicles[vehicleId]).filter((d) => scan(board, state, vehicleId, d).open);
}

/** The vehicles that can leave right now, by id. */
export function freeVehicles(board: Board, state: GameState): number[] {
  const out: number[] = [];
  for (const v of board.level.vehicles) if (!state.gone[v.id] && openDirs(board, state, v.id).length > 0) out.push(v.id);
  return out;
}

export type GestureResult =
  /** A gesture along the other axis, or on a vehicle that has left: nothing happens, no move counted (the vehicle shakes). */
  | { kind: 'ignored'; reason: 'offAxis' | 'gone' }
  /** The vehicle leaves: `steps` free cells inside the lot, then it joins the road. */
  | { kind: 'exit'; vehicle: number; dir: Dir; steps: number }
  /** The vehicle drives `steps` cells, hits `blocker` and comes back. */
  | { kind: 'bump'; vehicle: number; dir: Dir; steps: number; blocker: Blocker };

/**
 * A gesture on a vehicle: a swipe along its axis, or a tap (= forward). Updates the state in place: an exit removes the vehicle,
 * a bump counts a collision; both count one move.
 */
export function applyGesture(board: Board, state: GameState, vehicleId: number, dir: Dir): GestureResult {
  if (state.gone[vehicleId]) return { kind: 'ignored', reason: 'gone' };
  const v = board.level.vehicles[vehicleId];
  if (!vehicleDirs(v).includes(dir)) return { kind: 'ignored', reason: 'offAxis' };
  const s = scan(board, state, vehicleId, dir);
  state.moves++;
  if (!s.open) {
    state.collisions++;
    return { kind: 'bump', vehicle: vehicleId, dir, steps: s.steps, blocker: s.blocker! };
  }
  for (const [r, c] of vehicleCells(v)) state.occ[r * board.cols + c] = -1;
  state.gone[vehicleId] = 1;
  state.exited++;
  if (state.exited === board.level.vehicles.length) state.finished = true;
  return { kind: 'exit', vehicle: vehicleId, dir, steps: s.steps };
}

/** A tap: the vehicle goes forward. */
export const applyTap = (board: Board, state: GameState, vehicleId: number): GestureResult => applyGesture(board, state, vehicleId, board.level.vehicles[vehicleId].dir);

/** Plays vehicles one after the other, each driving forward if it can, else backward; returns the final state. */
export function replay(level: Level, order: readonly number[]): GameState {
  const board = compile(level);
  const state = createState(board);
  for (const id of order) {
    const dirs = openDirs(board, state, id);
    applyGesture(board, state, id, dirs[0] ?? level.vehicles[id].dir);
  }
  return state;
}
