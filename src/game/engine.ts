import { DELTA, type Dir } from '../core/grid';
import { leadCell, travelDir, vehicleCells, type Level } from './types';

/* ------------------------------------------------------------------------------------------
 * The rules of the parking. The same compiled form is used by the game, the solver and the
 * generator, so they can never disagree about what a tap does.
 * ---------------------------------------------------------------------------------------- */

export type Board = {
  level: Level;
  rows: number;
  cols: number;
  /** 1 on a cell nothing can enter: a void of the lot shape or an obstacle. */
  solid: Uint8Array;
  /** The one-way arrow of each cell: 0 none, else 1 + the index of the direction in `ARROW_DIRS`. */
  arrow: Uint8Array;
};

export const ARROW_DIRS: readonly Dir[] = ['U', 'D', 'L', 'R'];

export function compile(level: Level): Board {
  const { rows, cols } = level;
  const solid = new Uint8Array(rows * cols);
  for (const [r, c] of level.voids) solid[r * cols + c] = 1;
  for (const o of level.obstacles) solid[o.r * cols + o.c] = 1;
  const arrow = new Uint8Array(rows * cols);
  for (const w of level.oneWays) arrow[w.r * cols + w.c] = 1 + ARROW_DIRS.indexOf(w.dir);
  return { level, rows, cols, solid, arrow };
}

/** What stops a vehicle. */
export type Blocker = { type: 'vehicle'; id: number } | { type: 'obstacle' } | { type: 'gate'; index: number } | { type: 'oneWay' };

export type Scan = {
  /** True when the vehicle can leave the lot. */
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
 * Follows the line of a vehicle from its head toward the edge, in the one direction it can go. The generator uses it on partial lots
 * (no gate yet, `exited` = 0), so it takes plain arrays.
 */
export function scanLine(board: Board, occ: Int16Array, exited: number, vehicleId: number): Scan {
  const v = board.level.vehicles[vehicleId];
  const dir = travelDir(v);
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
    // A one-way arrow lets a vehicle over it only in its own direction.
    const a = board.arrow[i];
    if (a !== 0 && ARROW_DIRS[a - 1] !== dir) return { open: false, steps, blocker: { type: 'oneWay' } };
    steps++;
    r += dr;
    c += dc;
  }
  const lane = dr !== 0 ? v.c : v.r;
  const gates = board.level.gates;
  for (let g = 0; g < gates.length; g++) {
    const gate = gates[g];
    if (gate.side === dir && lane >= gate.from && lane <= gate.to && exited < gate.need) return { open: false, steps, blocker: { type: 'gate', index: g } };
  }
  return { open: true, steps, blocker: null };
}

export const scan = (board: Board, state: GameState, vehicleId: number): Scan => scanLine(board, state.occ, state.exited, vehicleId);

/** Can this vehicle leave right now? */
export const isFree = (board: Board, state: GameState, vehicleId: number): boolean => !state.gone[vehicleId] && scan(board, state, vehicleId).open;

/** The vehicles that can leave right now, by id. */
export function freeVehicles(board: Board, state: GameState): number[] {
  const out: number[] = [];
  for (const v of board.level.vehicles) if (isFree(board, state, v.id)) out.push(v.id);
  return out;
}

export type TapResult =
  /** A tap on a vehicle that has left: nothing happens, no move counted. */
  | { kind: 'ignored'; reason: 'gone' }
  /** The vehicle leaves: `steps` free cells inside the lot, then it joins the road. */
  | { kind: 'exit'; vehicle: number; dir: Dir; steps: number }
  /** The vehicle drives `steps` cells, hits `blocker` and comes back. */
  | { kind: 'bump'; vehicle: number; dir: Dir; steps: number; blocker: Blocker };

/**
 * A tap on a vehicle. It drives the one way its arrow shows: out of the lot when the way is clear (it is removed), else up to
 * what is in the way, where it bumps and comes back (a collision). Either way it counts one move. Updates the state in place.
 */
export function applyTap(board: Board, state: GameState, vehicleId: number): TapResult {
  if (state.gone[vehicleId]) return { kind: 'ignored', reason: 'gone' };
  const v = board.level.vehicles[vehicleId];
  const dir = travelDir(v);
  const s = scan(board, state, vehicleId);
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

/** Taps vehicles one after the other; returns the final state. */
export function replay(level: Level, order: readonly number[]): GameState {
  const board = compile(level);
  const state = createState(board);
  for (const id of order) applyTap(board, state, id);
  return state;
}
