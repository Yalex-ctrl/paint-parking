import { bombTargets, buildBoard, createState, traceSlide, type Board, type GameState } from './engine';
import { DIRS, type Level } from './types';

export type SolveResult = {
  /** Minimum swipes, exit swipe included, e.g. "RDLU". */
  moves: string;
  /** Number of distinct states visited; a rough difficulty signal. */
  states: number;
};

export type SolveOptions = {
  /** Abort (return null) once this many states have been visited. */
  maxStates?: number;
  /** Reject solutions longer than this many swipes. */
  maxMoves?: number;
};

export const DEFAULT_MAX_STATES = 400_000;

/**
 * Per-level constants for the search. The full state of the game is
 * (position, first coats, second coats, broken fragile walls, used bombs); coins do not
 * matter for the goal, so they are not part of it.
 */
export type Model = {
  board: Board;
  /** Bit of each paintable cell in the first-coat mask (cells with req >= 1). */
  bit1: bigint[];
  /** Bit of each double cell in the second-coat mask. */
  bit2: bigint[];
  full1: bigint;
  full2: bigint;
  nDouble: number;
  nFragile: number;
  nBomb: number;
  posBits: bigint;
};

export function buildModel(level: Level): Model {
  const board = buildBoard(level);
  const bit1: bigint[] = new Array(board.n).fill(0n);
  const bit2: bigint[] = new Array(board.n).fill(0n);
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < board.n; i++) {
    if (board.req[i] >= 1) bit1[i] = 1n << BigInt(n1++);
    if (board.req[i] === 2) bit2[i] = 1n << BigInt(n2++);
  }
  return {
    board,
    bit1,
    bit2,
    full1: (1n << BigInt(n1)) - 1n,
    full2: (1n << BigInt(n2)) - 1n,
    nDouble: n2,
    // Fragile walls, then collapsing tiles: both are "broken" bits of the state.
    nFragile: level.features.fragile.length + (level.features.collapse ?? []).length,
    nBomb: level.features.bombs.length,
    posBits: BigInt(Math.max(1, Math.ceil(Math.log2(board.n + 1)))),
  };
}

/** Optimal solve from the level's start. */
export function solve(level: Level, opts: SolveOptions = {}): SolveResult | null {
  return solveFrom(level, createState(level), opts);
}

/** Optimal solve from an arbitrary state (used for hints). */
export function solveFrom(
  level: Level,
  state: GameState,
  opts: SolveOptions = {},
  model: Model = buildModel(level),
): SolveResult | null {
  const steps = solveSteps(level, state, opts, model);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** States visited between two pauses of the incremental solver. */
export const SOLVER_CHUNK = 250;

/**
 * The same search as `solveFrom`, as a generator that pauses every `SOLVER_CHUNK` states, so a caller
 * on a phone can run it a few milliseconds at a time between frames (see game/infinite.ts).
 * It returns the result when it is done.
 */
export function* solveSteps(
  level: Level,
  state: GameState,
  opts: SolveOptions = {},
  model: Model = buildModel(level),
): Generator<void, SolveResult | null, void> {
  let sinceYield = 0;
  const maxStates = opts.maxStates ?? DEFAULT_MAX_STATES;
  const maxMoves = opts.maxMoves ?? Infinity;
  const { board: b, bit1, bit2, full1, full2, nDouble, nFragile, nBomb, posBits } = model;
  const dBits = BigInt(nDouble);
  const fBits = BigInt(nFragile);
  const bBits = BigInt(nBomb);
  const posMask = (1n << posBits) - 1n;
  const d2Mask = (1n << dBits) - 1n;
  const fMask = (1n << fBits) - 1n;
  const bMask = (1n << bBits) - 1n;

  const encode = (p1: bigint, p2: bigint, br: number, bu: number, pos: number) =>
    (((((p1 << dBits) | p2) << fBits) | BigInt(br)) << bBits | BigInt(bu)) << posBits | BigInt(pos);

  // Start state, from the live game state.
  let sp1 = 0n;
  let sp2 = 0n;
  for (let i = 0; i < b.n; i++) {
    if (state.coat[i] >= 1) sp1 |= bit1[i];
    if (state.coat[i] >= 2) sp2 |= bit2[i];
  }
  let sbr = 0;
  for (let i = 0; i < nFragile; i++) if (state.broken[i]) sbr |= 1 << i;
  let sbu = 0;
  for (let i = 0; i < nBomb; i++) if (state.bombUsed[i]) sbu |= 1 << i;
  const startKey = encode(sp1, sp2, sbr, sbu, state.pos[0] * b.cols + state.pos[1]);

  // parent: key -> [parentKey, dirIndex]
  const parent = new Map<bigint, [bigint, number]>();
  parent.set(startKey, [-1n, -1]);
  let frontier: bigint[] = [startKey];
  let depth = 0;
  const brokenArr = new Uint8Array(Math.max(1, nFragile));

  const rebuild = (last: bigint, finalDir: number): string => {
    const out: string[] = [DIRS[finalDir]];
    let k = last;
    for (;;) {
      const [pk, d] = parent.get(k)!;
      if (d < 0) break;
      out.push(DIRS[d]);
      k = pk;
    }
    return out.reverse().join('');
  };

  while (frontier.length > 0 && depth < maxMoves) {
    depth++;
    const next: bigint[] = [];
    for (const key of frontier) {
      // Decode.
      let rest = key;
      const pos = Number(rest & posMask);
      rest >>= posBits;
      const cbu = Number(rest & bMask);
      rest >>= bBits;
      const cbr = Number(rest & fMask);
      rest >>= fBits;
      const cp2 = rest & d2Mask;
      const cp1 = rest >> dBits;
      for (let i = 0; i < nFragile; i++) brokenArr[i] = (cbr >> i) & 1;
      const open = cp1 === full1 && cp2 === full2;

      for (let d = 0; d < 4; d++) {
        const tr = traceSlide(b, brokenArr, pos, d, open);
        if (tr.exited) return { moves: rebuild(key, d), states: parent.size };
        if (tr.steps.length === 0 && tr.fragile < 0) continue;

        let np1 = cp1;
        let np2 = cp2;
        let nbu = cbu;
        const paint = (i: number) => {
          if (b.req[i] === 0) return;
          if (b.req[i] === 2 && np1 & bit1[i]) np2 |= bit2[i];
          else np1 |= bit1[i];
        };
        let nbr = cbr;
        if (tr.fragile >= 0) nbr |= 1 << tr.fragile;
        for (const slot of tr.collapsed) nbr |= 1 << slot;
        for (const s of tr.steps) {
          paint(s.i);
          const bomb = b.bombId[s.i];
          if (bomb >= 0 && !(nbu & (1 << bomb))) {
            nbu |= 1 << bomb;
            // Walls are not painted (a fragile wall only counts once broken), nor the other floor of a platform level.
            for (const j of bombTargets(b, brokenArr, s.i)) paint(j);
          }
        }
        const nk = encode(np1, np2, nbr, nbu, tr.end);
        if (!parent.has(nk)) {
          parent.set(nk, [key, d]);
          next.push(nk);
        }
      }
      if (parent.size > maxStates) return null;
      if (++sinceYield >= SOLVER_CHUNK) {
        sinceYield = 0;
        yield;
      }
    }
    frontier = next;
  }
  return null;
}
