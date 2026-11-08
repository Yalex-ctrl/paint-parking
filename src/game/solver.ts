import { applyGesture, cloneState, compile, createState, freeVehicles, openDirs, scan, type Board, type GameState } from './engine';
import type { Dir, Level } from './types';
import { vehicleDirs } from './types';

/**
 * The solver. Vehicles only ever leave, and a vehicle that has left never blocks anything again (nor does it close a gate: the
 * count of vehicles gone only grows). So a lot can be emptied if and only if one can keep removing a free vehicle until none is
 * left, in any order: there is no search, and no choice can ever be a mistake.
 */
export type Solution = {
  solvable: boolean;
  /** Vehicle ids in the order they leave: each round removes every vehicle that is free at that moment. */
  order: number[];
  /** The direction each vehicle of `order` leaves in. */
  dirs: Dir[];
  /** Rounds of removal (every free vehicle leaves at each round). 0 for an empty lot. */
  layers: number;
  /** The round (1-based) a vehicle leaves in, by vehicle id; 0 when it never can. */
  layerOf: number[];
  /** `freeAt[k]` = the free vehicles when the first k vehicles of `order` are gone. Has `order.length` entries (+1 when stuck). */
  freeAt: number[][];
  /** Vehicles that can never leave (empty when solvable). */
  stuck: number[];
};

export function solveBoard(board: Board, from?: GameState): Solution {
  const n = board.level.vehicles.length;
  const state = from ? cloneState(from) : createState(board);
  const order: number[] = [];
  const dirs: Dir[] = [];
  const freeAt: number[][] = [];
  const layerOf: number[] = new Array(n).fill(0);
  let layers = 0;
  for (;;) {
    const round = freeVehicles(board, state);
    if (round.length === 0) break;
    layers++;
    for (const id of round) {
      // Earlier vehicles of the same round have left: the list at this moment is what the hint shows.
      freeAt.push(freeVehicles(board, state));
      const open = openDirs(board, state, id);
      const dir = open[0];
      applyGesture(board, state, id, dir);
      order.push(id);
      dirs.push(dir);
      layerOf[id] = layers;
    }
  }
  const stuck = board.level.vehicles.filter((v) => !state.gone[v.id]).map((v) => v.id);
  if (stuck.length > 0) freeAt.push([]);
  return { solvable: stuck.length === 0, order, dirs, layers, layerOf, freeAt, stuck };
}

export const solve = (level: Level): Solution => solveBoard(compile(level));

/** The solver from a game in progress: the next vehicles to move are in `order`. */
export const solveFrom = (board: Board, state: GameState): Solution => solveBoard(board, state);

export type Metrics = {
  layers: number;
  avgFree: number;
  avgChain: number;
  traps: number;
  difficulty: number;
};

/** The numbers that tell how hard a lot is; they are stored in the level file. */
export function metrics(level: Level, sol: Solution): Metrics {
  const board = compile(level);
  const state = createState(board);
  const n = level.vehicles.length;
  const steps = Math.max(1, sol.order.length);

  // Mean count of free vehicles per state, and the same as a share of what is left (the fewer, the harder).
  let freeSum = 0;
  let shareSum = 0;
  for (let k = 0; k < sol.order.length; k++) {
    const f = sol.freeAt[k].length;
    freeSum += f;
    shareSum += f / (n - k);
  }
  const avgFree = freeSum / steps;
  const freeShare = shareSum / steps;

  // A vehicle in the round r needed r - 1 rounds of others to leave first: the length of its chain of blockers.
  const chainSum = level.vehicles.reduce((s, v) => s + Math.max(0, sol.layerOf[v.id] - 1), 0);
  const avgChain = n > 0 ? chainSum / n : 0;

  // A trap looks free (a run of two empty cells or more in front of it) but is blocked in both directions.
  let traps = 0;
  for (const v of level.vehicles) {
    const [a, b] = vehicleDirs(v);
    const sa = scan(board, state, v.id, a);
    const sb = scan(board, state, v.id, b);
    if (!sa.open && !sb.open && Math.max(sa.steps, sb.steps) >= 2) traps++;
  }

  const kinds = (level.obstacles.length > 0 ? 1 : 0) + (level.vehicles.some((v) => v.len === 3) ? 1 : 0) + (level.gates.length > 0 ? 1 : 0) + (level.oneWays.length > 0 ? 1 : 0);
  const difficulty = 0.55 * n + 2.2 * sol.layers + 1.6 * avgChain + 8 * (1 - freeShare) + 1.2 * traps + 1.0 * kinds;
  return { layers: sol.layers, avgFree: round2(avgFree), avgChain: round2(avgChain), traps, difficulty: Math.round(difficulty * 10) / 10 };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
