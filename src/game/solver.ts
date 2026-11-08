import { applyTap, cloneState, compile, createState, freeVehicles, scan, type Board, type GameState } from './engine';
import type { Level } from './types';

/**
 * The solver. Vehicles only ever leave, and a vehicle that has left never blocks anything again (nor does it close a gate: the
 * count of vehicles gone only grows). So a lot can be emptied if and only if one can keep removing a free vehicle until none is
 * left, in any order: there is no search, and no tap on a free vehicle can ever be a mistake.
 */
export type Solution = {
  solvable: boolean;
  /** Vehicle ids in the order they are tapped: each round removes every vehicle that is free at that moment. */
  order: number[];
  /** Rounds of removal (every free vehicle leaves at each round). 0 for an empty lot. */
  layers: number;
  /** The round (1-based) a vehicle leaves in, by vehicle id; 0 when it never can. */
  layerOf: number[];
  /** `freeAt[k]` = the free vehicles when the first k vehicles of `order` are gone (one more entry when stuck). */
  freeAt: number[][];
  /** Vehicles that can never leave (empty when solvable). */
  stuck: number[];
};

export function solveBoard(board: Board, from?: GameState): Solution {
  const n = board.level.vehicles.length;
  const state = from ? cloneState(from) : createState(board);
  const order: number[] = [];
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
      applyTap(board, state, id);
      order.push(id);
      layerOf[id] = layers;
    }
  }
  const stuck = board.level.vehicles.filter((v) => !state.gone[v.id]).map((v) => v.id);
  if (stuck.length > 0) freeAt.push([]);
  return { solvable: stuck.length === 0, order, layers, layerOf, freeAt, stuck };
}

export const solve = (level: Level): Solution => solveBoard(compile(level));

/** The solver from a game in progress: the next vehicles to tap are in `order`. */
export const solveFrom = (board: Board, state: GameState): Solution => solveBoard(board, state);

export type Metrics = {
  layers: number;
  avgFree: number;
  avgChain: number;
  traps: number;
  freeStart: number;
  difficulty: number;
};

/**
 * A trap: a vehicle that looks as if it could leave (the way opposite to its arrow is clear up to the edge) but is blocked where its
 * arrow points.
 */
export function trapCount(level: Level): number {
  const board = compile(level);
  const state = createState(board);
  let traps = 0;
  for (const v of level.vehicles) {
    if (scan(board, state, v.id).open) continue;
    // The opposite way: look along the line from the other end of the vehicle.
    const mirrored = { ...v, back: !v.back };
    const probe: Level = { ...level, vehicles: level.vehicles.map((x) => (x.id === v.id ? mirrored : x)) };
    const pb = compile(probe);
    const ps = createState(pb);
    if (scan(pb, ps, v.id).open) traps++;
  }
  return traps;
}

/** The numbers that tell how hard a lot is; they are stored in the level file. */
export function metrics(level: Level, sol: Solution): Metrics {
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
  const freeStart = n > 0 && sol.freeAt.length > 0 ? sol.freeAt[0].length / n : 0;

  // A vehicle in the round r needed r - 1 rounds of others to leave first: the length of its chain of blockers.
  const chainSum = level.vehicles.reduce((s, v) => s + Math.max(0, sol.layerOf[v.id] - 1), 0);
  const avgChain = n > 0 ? chainSum / n : 0;
  const traps = trapCount(level);

  const kinds = (level.obstacles.length > 0 ? 1 : 0) + (level.vehicles.some((v) => v.len === 3) ? 1 : 0) + (level.gates.length > 0 ? 1 : 0) + (level.oneWays.length > 0 ? 1 : 0);
  const difficulty = 0.45 * n + 2.2 * sol.layers + 2.2 * avgChain + 10 * (1 - freeShare) + 1.0 * traps + 1.0 * kinds;
  return { layers: sol.layers, avgFree: round2(avgFree), avgChain: round2(avgChain), traps, freeStart: round2(freeStart), difficulty: Math.round(difficulty * 10) / 10 };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

