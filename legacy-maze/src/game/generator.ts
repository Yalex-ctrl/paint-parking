import { cropLevel } from './crop';
import {
  KIND_CORNER,
  KIND_FLOOR,
  KIND_PORTAL,
  KIND_STOP,
  OPP,
  applyMove,
  cellOf,
  createState,
  hasInfiniteLoop,
  measure,
  newBoard,
  traceSlide,
  type Carver,
  type Trace,
} from './engine';
import { coinsForLevel, mechanicsForLevel } from '../core/progression';
import { DAILY_LEVEL_BASE } from '../core/worlds';
import { createRng, type Rng } from '../core/rng';
import { DELTA, DIRS, emptyFeatures, mechanicsOf, type Dir, type Features, type Level, type Mechanic, type Tutorial } from './types';

export type GenParams = {
  /** Playable area, outer wall ring excluded. */
  innerRows: number;
  innerCols: number;
  /** Number of plain random slides carved around the special pieces. */
  slides: number;
  /** How many of those slides should turn 90° (the others reverse). */
  turns: number;
  /** Minimum number of dead-end cells (floor cells with exactly 3 wall sides). */
  deadEnds: number;
  /** Minimum number of junctions (floor cells open on >= 3 sides). */
  branches: number;
  /** Longest corridor a single plain slide may carve. */
  maxSlide?: number;
  /** Mechanics the level must really contain. */
  mechanics: Mechanic[];
  /** Number of optional coins. */
  coins: number;
  /** Tutorial levels: the mechanic is alone and the level stays tiny. */
  tutorial?: Tutorial;
};

/**
 * Paint colours. The ball is gold, so nothing yellow, gold or orange here: the ball must always
 * stand out from the paint (the hues stay at least 40 degrees away from the ball's).
 */
export const LEVEL_COLORS = [
  '#ff4d6d', '#2ec4b6', '#4cc9f0', '#9b5de5', '#f15bb5', '#3a86ff',
  '#06d6a0', '#118ab2', '#c77dff', '#e63946', '#2b9348', '#7b2cbf',
];

/** Difficulty ramp: t in [0, 1] -> board size and plain-slide parameters (5x5 up to 11x13). */
export function paramsForProgress(t: number): Omit<GenParams, 'mechanics' | 'coins'> {
  const innerCols = Math.round(5 + 6 * t);
  const innerRows = Math.round(5 + 8 * t);
  const slides = Math.round(4 + 24 * t);
  return {
    innerRows,
    innerCols,
    slides,
    turns: Math.round(slides * (0.55 + 0.35 * t)),
    // The first ~8 levels may be plain corridors; after that: junctions and dead ends.
    deadEnds: t < 0.016 ? 0 : t < 0.2 ? 2 : t < 0.5 ? 3 : 4,
    branches: t < 0.016 ? 0 : t < 0.3 ? 1 : 2,
  };
}

const SWIPES_ADDED: Partial<Record<Mechanic, number>> = { stop: 3, fragile: 1 };

/** Levels 1 to 5 are a few swipes long: the player must be through them in a few seconds. */
export const INTRO_LEVELS = 5;

/** Everything the generator needs for campaign level `id` (1-based, out of 500). */
export function paramsForLevel(id: number, total = 500): GenParams {
  if (id <= INTRO_LEVELS) {
    const slides = [1, 1, 1, 2, 2][id - 1];
    return {
      innerRows: 4,
      innerCols: id <= 3 ? 4 : 5,
      slides,
      turns: 1,
      deadEnds: 0,
      branches: 0,
      mechanics: [],
      coins: coinsForLevel(id),
    };
  }
  const { mechanics, tutorial } = mechanicsForLevel(id);
  const base = paramsForProgress((id - 1) / (total - 1));
  const coins = coinsForLevel(id);
  if (tutorial) {
    // Very simple: a small board where the new piece is alone and indispensable.
    const plain = tutorial === 'double' ? 4 : tutorial === 'bomb' ? 3 : 1;
    return {
      innerRows: tutorial === 'double' ? 5 : 6,
      innerCols: 5,
      slides: plain,
      turns: Math.ceil(plain / 2),
      deadEnds: 0,
      branches: 0,
      mechanics,
      coins,
      tutorial,
    };
  }
  const roomy = mechanics.length > 0;
  return {
    ...base,
    innerRows: roomy ? Math.max(base.innerRows, 6) : base.innerRows,
    innerCols: roomy ? Math.max(base.innerCols, 6) : base.innerCols,
    // Gadgets that add swipes of their own replace some plain slides (double coats and bombs add none).
    slides: Math.max(2, base.slides - mechanics.reduce((n, m) => n + (SWIPES_ADDED[m] ?? 0), 0)),
    mechanics,
    coins,
  };
}

/** Counts floor cells enclosed on exactly 3 sides (a cell closed on 4 sides is an isolated pocket, not a dead end). */
export function countDeadEnds(grid: string[]): number {
  let n = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== '.') continue;
      let walls = 0;
      for (const d of DIRS) {
        const [dr, dc] = DELTA[d];
        if (grid[r + dr][c + dc] === '#') walls++;
      }
      if (walls === 3) n++;
    }
  }
  return n;
}

/** Counts floor cells open on >= 3 sides (T and + junctions). */
export function countBranches(grid: string[]): number {
  let n = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== '.') continue;
      let open = 0;
      for (const d of DIRS) {
        const [dr, dc] = DELTA[d];
        if (grid[r + dr][c + dc] === '.') open++;
      }
      if (open >= 3) n++;
    }
  }
  return n;
}

/**
 * Plays the stored solution on the level and checks everything the game promises: every
 * swipe moves the ball, the exit opens only after the last coat and the final swipe leaves
 * the board; and no swipe from anywhere can loop forever.
 */
export function verifyLevel(level: Level): boolean {
  const state = createState(level);
  const moves = level.solution;
  for (let i = 0; i < moves.length; i++) {
    const last = i === moves.length - 1;
    if (last && state.layers !== level.layers) return false;
    const res = applyMove(level, state, moves[i] as Dir);
    if (!res || res.looped) return false;
    if (res.exited !== last) return false;
  }
  return state.finished && state.layers === level.layers && !hasInfiniteLoop(level);
}

/**
 * Builds a level that is solvable by construction. A ball is simulated with the real rules
 * (`traceSlide`) while corridors and special pieces are carved in front of it, one swipe at
 * a time, and every swipe is recorded. A swipe's stopping wall is "locked" so later carving
 * never removes it, which keeps every earlier swipe valid on the finished board. Special
 * pieces are built as small "gadgets" whose recorded swipes need the piece:
 *  - stop: a corridor with a stop tile in the middle and a side branch that can only be
 *    entered by halting on that tile;
 *  - corner: a bend that carries the ball into a side corridor in one swipe;
 *  - portal: a pocket of floor only reachable through a portal;
 *  - fragile wall: a gate to a new corridor, opened by hitting the wall;
 *  - bomb: isolated pockets in the corners of a 3x3 area, painted only by the bomb;
 *  - double coat: tiles the recorded solution crosses at least twice.
 * Finally the exit corridor reaches the outer ring. The result is replayed with the real
 * engine before it is returned.
 */
export function generateLevel(params: GenParams, seed: number, id = 0, maxAttempts = 80): Level | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = tryGenerate(params, rng, seed, id);
    if (level) return level;
  }
  return null;
}

const perp = (d: number) => (d < 2 ? [2, 3] : [0, 1]);

function tryGenerate(p: GenParams, rng: Rng, seed: number, id: number): Level | null {
  const rows = p.innerRows + 2;
  const cols = p.innerCols + 2;
  const b = newBoard(rows, cols);
  const { n, off } = b;
  const locked = new Uint8Array(n);
  const broken = new Uint8Array(8);
  const fragileList: number[] = [];
  const portalList: [number, number][] = [];
  const moves: number[] = [];
  const maxSlide = p.maxSlide ?? Math.max(2, Math.ceil(Math.max(p.innerRows, p.innerCols) * 0.7));

  const isInner = (i: number) => {
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    return r >= 1 && c >= 1 && r <= p.innerRows && c <= p.innerCols;
  };
  const isRing = (i: number) => {
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    return r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
  };

  let pos = (1 + rng.int(0, p.innerRows - 1)) * cols + 1 + rng.int(0, p.innerCols - 1);
  const start = pos;
  b.wall[pos] = 0;
  b.req[pos] = 1;
  let lastMove = -1;

  const snapshot = () => ({
    wall: b.wall.slice(),
    kind: b.kind.slice(),
    cornerA: b.cornerA.slice(),
    cornerB: b.cornerB.slice(),
    portalTo: b.portalTo.slice(),
    portalPair: b.portalPair.slice(),
    req: b.req.slice(),
    fragileId: b.fragileId.slice(),
    locked: locked.slice(),
    broken: broken.slice(),
    moves: moves.length,
    pos,
    lastMove,
    fragile: fragileList.length,
    portals: portalList.length,
  });
  type Snap = ReturnType<typeof snapshot>;
  const restore = (s: Snap) => {
    b.wall.set(s.wall);
    b.kind.set(s.kind);
    b.cornerA.set(s.cornerA);
    b.cornerB.set(s.cornerB);
    b.portalTo.set(s.portalTo);
    b.portalPair.set(s.portalPair);
    b.req.set(s.req);
    b.fragileId.set(s.fragileId);
    locked.set(s.locked);
    broken.set(s.broken);
    moves.length = s.moves;
    pos = s.pos;
    lastMove = s.lastMove;
    fragileList.length = s.fragile;
    portalList.length = s.portals;
  };

  /** One recorded swipe, simulated with the real rules, digging at most `limit` new cells. */
  const run = (d: number, limit: number): { tr: Trace; carved: number } | null => {
    const carve: Carver = { limit, carved: [], canCarve: (i) => isInner(i) && !locked[i] };
    const tr = traceSlide(b, broken, pos, d, false, carve);
    if (tr.looped || (tr.steps.length === 0 && tr.fragile < 0)) return null;
    if (tr.reason === 'wall' || tr.reason === 'portal') {
      const ahead = tr.end + off[tr.lastDir];
      if (b.wall[ahead] && b.fragileId[ahead] < 0) locked[ahead] = 1;
    }
    if (tr.fragile >= 0) broken[tr.fragile] = 1;
    pos = tr.end;
    moves.push(d);
    lastMove = d;
    return { tr, carved: carve.carved.length };
  };

  /** `count` new cells in a row after `from`, or null if any is not free to dig. */
  const lineCells = (from: number, d: number, count: number): number[] | null => {
    const out: number[] = [];
    let cur = from;
    for (let k = 0; k < count; k++) {
      cur += off[d];
      if (!isInner(cur) || !b.wall[cur] || locked[cur] || b.fragileId[cur] >= 0 || b.kind[cur] !== KIND_FLOOR) return null;
      out.push(cur);
    }
    return out;
  };
  /** A plain wall (or the ring) right after `cell`, so a slide stops there. */
  const wallAhead = (cell: number, d: number) => {
    const a = cell + off[d];
    return b.wall[a] === 1 && b.fragileId[a] < 0;
  };

  const plain = (wantTurn: boolean): boolean => {
    let order = rng.shuffle([0, 1, 2, 3]);
    if (lastMove >= 0) {
      const sameAxis = (d: number) => d >> 1 === lastMove >> 1;
      order = [...order.filter((d) => sameAxis(d) !== wantTurn), ...order.filter((d) => sameAxis(d) === wantTurn)];
    }
    for (const d of order) {
      const snap = snapshot();
      const res = run(d, rng.int(1, maxSlide));
      if (res && res.carved >= 1) return true;
      restore(snap);
    }
    return false;
  };

  const gadgetStop = (): boolean => {
    for (let t = 0; t < 25; t++) {
      const snap = snapshot();
      const d = rng.int(0, 3);
      const L = rng.int(3, 6);
      const j = rng.int(1, L - 1);
      const line = lineCells(pos, d, L);
      if (!line || !wallAhead(line[L - 1], d)) continue;
      const pd = perp(d)[rng.int(0, 1)];
      const bl = rng.int(1, 3);
      const q = line[j - 1];
      const branch = lineCells(q, pd, bl);
      if (!branch || !wallAhead(branch[bl - 1], pd)) continue;
      b.kind[q] = KIND_STOP;
      // 1) corridor, halting on the stop tile; 2) side branch; 3) back to the tile; 4) rest of the corridor.
      const r1 = run(d, j);
      const r2 = r1 && r1.tr.end === q && r1.tr.reason === 'stop' ? run(pd, bl) : null;
      const r3 = r2 && r2.tr.end === branch[bl - 1] ? run(OPP[pd], 0) : null;
      const r4 = r3 && r3.tr.end === q && r3.tr.reason === 'stop' ? run(d, L - j) : null;
      if (r4 && r4.tr.end === line[L - 1]) return true;
      restore(snap);
    }
    return false;
  };

  const gadgetCorner = (): boolean => {
    for (let t = 0; t < 25; t++) {
      const snap = snapshot();
      const d = rng.int(0, 3);
      const L = rng.int(1, 4);
      const bl = rng.int(1, 3);
      const pd = perp(d)[rng.int(0, 1)];
      const line = lineCells(pos, d, L);
      if (!line) continue;
      const corner = line[L - 1];
      const branch = lineCells(corner, pd, bl);
      if (!branch || !wallAhead(branch[bl - 1], pd)) continue;
      b.kind[corner] = KIND_CORNER;
      b.cornerA[corner] = OPP[d]; // the side the ball enters through...
      b.cornerB[corner] = pd; // ...and the side it leaves through
      const r = run(d, L + bl);
      if (r && r.tr.end === branch[bl - 1] && r.carved === L + bl) return true;
      restore(snap);
    }
    return false;
  };

  const gadgetPortal = (): boolean => {
    if (portalList.length >= 2) return false;
    for (let t = 0; t < 40; t++) {
      const snap = snapshot();
      const d = rng.int(0, 3);
      const L = rng.int(1, 4);
      const line = lineCells(pos, d, L);
      if (!line) continue;
      const A = line[L - 1];
      const B = (1 + rng.int(0, p.innerRows - 1)) * cols + 1 + rng.int(0, p.innerCols - 1);
      if (!b.wall[B] || locked[B] || b.kind[B] !== KIND_FLOOR) continue;
      // The pocket must be isolated: nothing dug (or about to be) within one cell of it.
      let isolated = true;
      for (let dr = -1; dr <= 1 && isolated; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const j = B + dr * cols + dc;
          if (!b.wall[j] || line.includes(j)) {
            isolated = false;
            break;
          }
        }
      }
      if (!isolated) continue;
      const ahead = B + off[d];
      if (!b.wall[ahead] || b.fragileId[ahead] >= 0) continue; // the ball must stop on the exit portal
      const roomy = perp(d).some((pd) => {
        const nb = B + off[pd];
        return isInner(nb) && b.wall[nb] === 1 && !locked[nb];
      });
      if (!roomy) continue;

      const pair = portalList.length;
      b.kind[A] = KIND_PORTAL;
      b.kind[B] = KIND_PORTAL;
      b.portalTo[A] = B;
      b.portalTo[B] = A;
      b.portalPair[A] = pair;
      b.portalPair[B] = pair;
      b.wall[B] = 0;
      b.req[B] = 1;
      locked[ahead] = 1;
      portalList.push([A, B]);
      const r = run(d, L);
      if (r && r.tr.end === B && r.tr.reason === 'portal') return true;
      restore(snap);
    }
    return false;
  };

  const gadgetFragile = (): boolean => {
    if (fragileList.length >= 3) return false;
    for (let t = 0; t < 30; t++) {
      const snap = snapshot();
      const d = rng.int(0, 3);
      const L = rng.int(1, 4);
      const M = rng.int(1, 3);
      const line = lineCells(pos, d, L);
      if (!line) continue;
      const W = line[L - 1] + off[d];
      if (!isInner(W) || !b.wall[W] || locked[W] || b.fragileId[W] >= 0 || b.kind[W] !== KIND_FLOOR) continue;
      const rem = lineCells(W, d, M);
      if (!rem || !wallAhead(rem[M - 1], d)) continue;
      const fid = fragileList.length;
      b.fragileId[W] = fid;
      b.req[W] = 1;
      locked[W] = 1;
      fragileList.push(W);
      // 1) hit the wall (it breaks); 2) go through it into the new corridor.
      const r1 = run(d, L);
      const r2 = r1 && r1.tr.reason === 'fragile' && r1.tr.fragile === fid && r1.tr.end === line[L - 1] ? run(d, M) : null;
      if (r2 && r2.tr.end === rem[M - 1]) return true;
      restore(snap);
    }
    return false;
  };

  // ---- Plan the recorded swipes: gadgets and plain slides, in a random order.
  const gadgets: (() => boolean)[] = [];
  const times = (k: number, f: () => boolean) => {
    for (let i = 0; i < k; i++) gadgets.push(f);
  };
  const extra = (chance: number) => (!p.tutorial && rng.next() < chance ? 1 : 0);
  if (p.mechanics.includes('stop')) times(1 + extra(0.35), gadgetStop);
  if (p.mechanics.includes('corner')) times(1 + extra(0.5) + extra(0.25), gadgetCorner);
  if (p.mechanics.includes('portal')) times(1 + (id >= 200 ? extra(0.3) : 0), gadgetPortal);
  if (p.mechanics.includes('fragile')) times(1 + extra(0.35), gadgetFragile);
  const ops: ('plain' | 'turn' | (() => boolean))[] = rng.shuffle<'plain' | 'turn' | (() => boolean)>([
    ...gadgets,
    ...Array.from({ length: p.slides }, (_, k): 'plain' | 'turn' => (k < p.turns ? 'turn' : 'plain')),
  ]);
  for (const op of ops) {
    if (typeof op === 'function') {
      let ok = false;
      for (let tries = 0; tries < 3 && !ok; tries++) ok = op();
      if (!ok) return null;
    } else if (!plain(op === 'turn')) {
      break; // no room left for another plain slide
    }
  }

  // ---- Exit corridor: a last slide that reaches the outer ring.
  let exitIdx = -1;
  let exitDir = 0;
  for (const d of rng.shuffle([0, 1, 2, 3])) {
    const snap = snapshot();
    const res = run(d, Infinity);
    if (res) {
      const ahead = res.tr.end + off[res.tr.lastDir];
      if (isRing(ahead) && !isRing(res.tr.end) && res.tr.reason !== 'corner') {
        exitIdx = ahead;
        exitDir = res.tr.lastDir;
        break;
      }
    }
    restore(snap);
  }
  if (exitIdx < 0) {
    // Already standing next to the ring? Then the exit is right there.
    for (const d of rng.shuffle([0, 1, 2, 3])) {
      const ahead = pos + off[d];
      const blockedByCorner = b.kind[pos] === KIND_CORNER && d !== b.cornerA[pos] && d !== b.cornerB[pos];
      if (isRing(ahead) && !blockedByCorner) {
        exitIdx = ahead;
        exitDir = d;
        break;
      }
    }
  }
  if (exitIdx < 0) return null;
  b.exitIdx = exitIdx;
  b.exitDir = exitDir;
  const solutionMoves = [...moves, exitDir];

  // ---- Assemble.
  const toCell = (i: number): [number, number] => cellOf(b, i);
  const assemble = (doubles: number[], bombs: number[], coins: number[]): Level => {
    const grid: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) line += b.wall[r * cols + c] ? '#' : '.';
      grid.push(line);
    }
    const features: Features = emptyFeatures();
    for (let i = 0; i < n; i++) {
      if (!b.wall[i] && b.kind[i] === KIND_STOP) features.stops.push(toCell(i));
      if (!b.wall[i] && b.kind[i] === KIND_CORNER) {
        const [r, c] = toCell(i);
        features.corners.push({ r, c, a: DIRS[b.cornerA[i]], b: DIRS[b.cornerB[i]] });
      }
    }
    for (const [a, o] of portalList) features.portals.push({ a: toCell(a), b: toCell(o) });
    for (const w of fragileList) features.fragile.push(toCell(w));
    features.doubles = doubles.map(toCell);
    features.bombs = bombs.map(toCell);
    features.coins = coins.map(toCell);

    const { floorCount, layers } = measure(grid, features);
    return {
      id,
      seed,
      rows,
      cols,
      grid,
      start: toCell(start),
      exit: { r: toCell(exitIdx)[0], c: toCell(exitIdx)[1], dir: DIRS[exitDir] },
      color: LEVEL_COLORS[seed % LEVEL_COLORS.length],
      solution: solutionMoves.map((d) => DIRS[d]).join(''),
      difficulty: 0,
      floorCount,
      layers,
      deadEnds: countDeadEnds(grid),
      branches: countBranches(grid),
      features,
      mechanics: mechanicsOf(features),
      tutorial: p.tutorial,
    };
  };

  // How often the recorded solution crosses each tile (to place doubles, bombs and coins usefully).
  const base = assemble([], [], []);
  const entries = new Int32Array(n);
  const probe = createState(base);
  for (const d of solutionMoves) {
    const res = applyMove(base, probe, DIRS[d]);
    if (!res) return null;
    for (const s of res.steps) entries[s.cell[0] * cols + s.cell[1]]++;
  }
  if (!probe.finished) return null;

  const plainFloor = (i: number) =>
    !b.wall[i] && b.kind[i] === KIND_FLOOR && i !== start && b.fragileId[i] < 0 && isInner(i);

  // Double coats: tiles the solution already crosses at least twice.
  const doubles: number[] = [];
  if (p.mechanics.includes('double')) {
    const wanted = p.tutorial ? 1 : rng.int(1, 3);
    const candidates = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => plainFloor(i) && entries[i] >= 2));
    doubles.push(...candidates.slice(0, wanted));
    if (doubles.length === 0) return null;
  }

  // Bombs: isolated pockets in the diagonal corners of the bomb's 3x3 area, reachable only by the blast.
  const bombs: number[] = [];
  if (p.mechanics.includes('bomb')) {
    const wanted = p.tutorial ? 1 : rng.int(1, 2);
    const spots = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => plainFloor(i) && entries[i] >= 1 && !doubles.includes(i)));
    for (const x of spots) {
      if (bombs.length >= wanted) break;
      const pockets: number[] = [];
      for (const dr of [-1, 1]) {
        for (const dc of [-1, 1]) {
          const dd = x + dr * cols + dc;
          const enclosed = [-cols, cols, -1, 1].every((o) => b.wall[dd + o] === 1);
          if (isInner(dd) && b.wall[dd] && !locked[dd] && b.fragileId[dd] < 0 && b.kind[dd] === KIND_FLOOR && enclosed) pockets.push(dd);
        }
      }
      if (pockets.length === 0) continue;
      for (const dd of rng.shuffle(pockets).slice(0, rng.int(1, pockets.length))) {
        b.wall[dd] = 0;
        b.req[dd] = 1;
        locked[dd] = 1;
      }
      bombs.push(x);
    }
    if (bombs.length === 0) return null;
  }

  // Coins: optional, on tiles the solution crosses.
  const coinSpots = rng
    .shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => plainFloor(i) && entries[i] >= 1 && !bombs.includes(i) && !doubles.includes(i)))
    .slice(0, p.coins);

  // Crop away the empty wall around the corridors (the exit stays on the border).
  const level = cropLevel(assemble(doubles, bombs, coinSpots));

  // ---- Shape constraints.
  const area = p.innerRows * p.innerCols;
  if (level.floorCount < area * (p.tutorial ? 0.2 : 0.3)) return null;
  if (level.deadEnds < p.deadEnds || level.branches < p.branches) return null;
  for (const m of p.mechanics) if (!level.mechanics.includes(m)) return null;
  return verifyLevel(level) ? level : null;
}

/**
 * The daily challenge number `index` (0..365): harder than the campaign (big boards, 2 or 3 mechanics of all
 * six), the same for every player on a given date. The level id is `DAILY_LEVEL_BASE + index + 1`.
 */
export function paramsForDaily(index: number): GenParams {
  const rng = createRng(index * 7919 + 4242);
  const t = 0.62 + rng.next() * 0.33;
  const base = paramsForProgress(t);
  const mechanics = rng.shuffle<Mechanic>(['stop', 'corner', 'portal', 'double', 'fragile', 'bomb']).slice(0, 2 + (rng.next() < 0.4 ? 1 : 0));
  const need = (m: Mechanic) => mechanics.includes(m);
  return {
    ...base,
    innerRows: Math.max(base.innerRows, 8),
    innerCols: Math.max(base.innerCols, 7),
    slides: Math.max(3, base.slides - (need('stop') ? 3 : 0) - (need('fragile') ? 1 : 0)),
    mechanics,
    coins: 1,
  };
}

export const dailyLevelId = (index: number) => DAILY_LEVEL_BASE + index + 1;
