import { bombTargets, buildBoard, createState, traceSlide, type GameState } from './engine';
import { buildModel, type Model } from './solver';
import { DIRS, type Level } from './types';

export type BeamOptions = {
  /** States kept per depth (the best by painted layers). */
  width?: number;
  /** Longest solution looked for. */
  maxDepth?: number;
  /** Stop (null) after this long, in milliseconds. */
  timeMs?: number;
  /** Which of the best-equal states survive: a different seed gives a different search. */
  seed?: number;
};

export type BeamResult = {
  moves: string;
  /** States visited (a rough measure of how hard the search was). */
  states: number;
  /** How many legal swipes the player has, on average, at the states of the solution (choices at each step). */
  branching: number;
  /** Of those, how many paint something new (real alternatives). */
  ambiguity: number;
};

/**
 * Looks for a way to paint everything and leave, on levels too open for an exhaustive search. A beam search: at each
 * depth only the `width` states that have painted the most are kept, states seen before are dropped. It finds a
 * solution when there is one among the promising lines, not necessarily the shortest, and never lies: the answer is
 * always a real sequence of swipes (verified by the caller with the real engine).
 */
export function solveBeam(level: Level, from: GameState = createState(level), opts: BeamOptions = {}, model: Model = buildModel(level)): BeamResult | null {
  const steps = beamSteps(level, from, opts, model);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** States expanded between two pauses of the incremental search. */
export const BEAM_CHUNK = 40;

/** The same search as `solveBeam`, pausing often so a phone can run it a few milliseconds at a time (see game/infinite.ts). */
export function* beamSteps(level: Level, from: GameState, opts: BeamOptions, model: Model): Generator<void, BeamResult | null, void> {
  let sinceYield = 0;
  const width = opts.width ?? 400;
  const maxDepth = opts.maxDepth ?? 80;
  const deadline = opts.timeMs !== undefined ? Date.now() + opts.timeMs : Infinity;
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

  let sp1 = 0n;
  let sp2 = 0n;
  let painted0 = 0;
  for (let i = 0; i < b.n; i++) {
    if (from.coat[i] >= 1) {
      sp1 |= bit1[i];
      painted0++;
    }
    if (from.coat[i] >= 2) {
      sp2 |= bit2[i];
      painted0++;
    }
  }
  let sbr = 0;
  for (let i = 0; i < nFragile; i++) if (from.broken[i]) sbr |= 1 << i;
  let sbu = 0;
  for (let i = 0; i < nBomb; i++) if (from.bombUsed[i]) sbu |= 1 << i;
  const startKey = encode(sp1, sp2, sbr, sbu, from.pos[0] * b.cols + from.pos[1]);

  type Entry = { key: bigint; painted: number };
  const parent = new Map<bigint, [bigint, number]>();
  parent.set(startKey, [-1n, -1]);
  let frontier: Entry[] = [{ key: startKey, painted: painted0 }];
  const brokenArr = new Uint8Array(Math.max(1, nFragile));
  let seedState = (opts.seed ?? 1) >>> 0 || 1;
  const jitter = () => {
    seedState = (seedState * 1664525 + 1013904223) >>> 0;
    return seedState / 4294967296;
  };

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

  // Choices at the states along the solution, measured on the states the search actually expanded.
  let expanded = 0;
  let legalSum = 0;
  let paintingSum = 0;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: (Entry & { score: number })[] = [];
    for (const { key, painted } of frontier) {
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
      let legal = 0;
      let painting = 0;
      for (let d = 0; d < 4; d++) {
        const tr = traceSlide(b, brokenArr, pos, d, open);
        if (tr.exited) return { moves: rebuild(key, d), states: parent.size, branching: expanded ? legalSum / expanded : 1, ambiguity: expanded ? paintingSum / expanded : 0 };
        if (tr.steps.length === 0 && tr.fragile < 0) continue;
        legal++;
        let np1 = cp1;
        let np2 = cp2;
        let nbu = cbu;
        let count = painted;
        const paint = (i: number) => {
          if (b.req[i] === 0) return;
          if (b.req[i] === 2 && np1 & bit1[i]) {
            if (!(np2 & bit2[i])) count++;
            np2 |= bit2[i];
          } else {
            if (!(np1 & bit1[i])) count++;
            np1 |= bit1[i];
          }
        };
        let nbr = cbr;
        if (tr.fragile >= 0) nbr |= 1 << tr.fragile;
        for (const slot of tr.collapsed) nbr |= 1 << slot;
        for (const s of tr.steps) {
          paint(s.i);
          const bomb = b.bombId[s.i];
          if (bomb >= 0 && !(nbu & (1 << bomb))) {
            nbu |= 1 << bomb;
            for (const j of bombTargets(b, brokenArr, s.i)) paint(j);
          }
        }
        if (count > painted) painting++;
        const nk = encode(np1, np2, nbr, nbu, tr.end);
        if (!parent.has(nk)) {
          parent.set(nk, [key, d]);
          // Paint more first; keep a touch of randomness so equal states are not always dropped the same way.
          next.push({ key: nk, painted: count, score: count + jitter() * 0.9 });
        }
      }
      expanded++;
      legalSum += legal;
      paintingSum += painting;
      if (++sinceYield >= BEAM_CHUNK) {
        sinceYield = 0;
        yield;
      }
    }
    if (Date.now() > deadline) return null;
    next.sort((x, y) => y.score - x.score);
    frontier = next.slice(0, width);
  }
  return null;
}

/** The same search, checked with the real engine: returns the solution only if replaying it paints everything and leaves. */
export function solveBeamVerified(level: Level, opts: BeamOptions = {}): BeamResult | null {
  const res = solveBeam(level, createState(level), opts);
  if (!res) return null;
  buildBoard(level);
  return res;
}
