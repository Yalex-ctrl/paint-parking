import { DIRS, type Cell, type Dir, type Features, type Level } from './types';

/* ------------------------------------------------------------------------------------------
 * Board: a level compiled into flat typed arrays. The same compiled form is used by the game,
 * the solver and the generator, so they can never disagree about the rules.
 * ---------------------------------------------------------------------------------------- */

export const KIND_FLOOR = 0;
export const KIND_STOP = 1;
export const KIND_CORNER = 2;
export const KIND_PORTAL = 3;

/** Direction indices follow the order of DIRS: U, D, L, R. */
export const DIR_INDEX: Record<Dir, number> = { U: 0, D: 1, L: 2, R: 3 };
export const OPP = [1, 0, 3, 2] as const;

export type Board = {
  rows: number;
  cols: number;
  n: number;
  /** Cell index offset for each direction. */
  off: Int32Array;
  /** 1 for walls, including fragile ones. */
  wall: Uint8Array;
  kind: Uint8Array;
  /** The two open sides of a corner, as direction indices (-1 elsewhere). */
  cornerA: Int8Array;
  cornerB: Int8Array;
  portalTo: Int32Array;
  portalPair: Int8Array;
  /** Coats a cell needs: 0 for walls, 1 for floor and fragile walls, 2 for doubles. */
  req: Uint8Array;
  fragileId: Int16Array;
  /** Height of a floor tile: 0 = low floor, 1 = platform. */
  lvl: Uint8Array;
  /** Direction index of the platform side of a ramp tile (-1 on every other tile). */
  rampUp: Int8Array;
  /** Index, in the `broken` array of the state, of a collapsing tile (-1 elsewhere): after the fragile walls. */
  collapseSlot: Int16Array;
  /** The slide whose entry is this tile (-1 elsewhere). */
  slideAt: Int16Array;
  /** Per slide: direction index of the funnel, the landing tile, the direction of travel on landing. */
  slideMouth: Int8Array;
  slideTo: Int32Array;
  slideOut: Int8Array;
  bombId: Int16Array;
  coinId: Int16Array;
  exitIdx: number;
  exitDir: number;
  startIdx: number;
};

export function newBoard(rows: number, cols: number): Board {
  const n = rows * cols;
  return {
    rows,
    cols,
    n,
    off: Int32Array.from([-cols, cols, -1, 1]),
    wall: new Uint8Array(n).fill(1),
    kind: new Uint8Array(n),
    cornerA: new Int8Array(n).fill(-1),
    cornerB: new Int8Array(n).fill(-1),
    portalTo: new Int32Array(n).fill(-1),
    portalPair: new Int8Array(n).fill(-1),
    req: new Uint8Array(n),
    fragileId: new Int16Array(n).fill(-1),
    lvl: new Uint8Array(n),
    rampUp: new Int8Array(n).fill(-1),
    collapseSlot: new Int16Array(n).fill(-1),
    slideAt: new Int16Array(n).fill(-1),
    slideMouth: new Int8Array(1),
    slideTo: new Int32Array(1),
    slideOut: new Int8Array(1),
    bombId: new Int16Array(n).fill(-1),
    coinId: new Int16Array(n).fill(-1),
    exitIdx: -1,
    exitDir: 0,
    startIdx: -1,
  };
}

const boards = new WeakMap<Level, Board>();

/** Compiles (and caches) a level. */
export function buildBoard(level: Level): Board {
  const cached = boards.get(level);
  if (cached) return cached;
  const b = newBoard(level.rows, level.cols);
  const { cols } = b;
  const idx = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (level.grid[r][c] === '.') {
        b.wall[idx(r, c)] = 0;
        b.req[idx(r, c)] = 1;
      }
    }
  }
  const f = level.features;
  for (const [r, c] of f.stops) b.kind[idx(r, c)] = KIND_STOP;
  for (const k of f.corners) {
    const i = idx(k.r, k.c);
    b.kind[i] = KIND_CORNER;
    b.cornerA[i] = DIR_INDEX[k.a];
    b.cornerB[i] = DIR_INDEX[k.b];
  }
  f.portals.forEach((p, pair) => {
    const a = idx(p.a[0], p.a[1]);
    const o = idx(p.b[0], p.b[1]);
    b.kind[a] = KIND_PORTAL;
    b.kind[o] = KIND_PORTAL;
    b.portalTo[a] = o;
    b.portalTo[o] = a;
    b.portalPair[a] = pair;
    b.portalPair[o] = pair;
  });
  for (const [r, c] of f.doubles) b.req[idx(r, c)] = 2;
  f.fragile.forEach(([r, c], id) => {
    b.fragileId[idx(r, c)] = id;
    b.req[idx(r, c)] = 1; // becomes floor once broken
  });
  f.bombs.forEach(([r, c], id) => (b.bombId[idx(r, c)] = id));
  // The three newest mechanics (levels written before them do not have the lists).
  for (const [r, c] of f.raised ?? []) b.lvl[idx(r, c)] = 1;
  for (const k of f.ramps ?? []) b.rampUp[idx(k.r, k.c)] = DIR_INDEX[k.up];
  const nFragile = f.fragile.length;
  (f.collapse ?? []).forEach(([r, c], k) => (b.collapseSlot[idx(r, c)] = nFragile + k));
  const slides = f.slides ?? [];
  b.slideMouth = new Int8Array(Math.max(1, slides.length));
  b.slideTo = new Int32Array(Math.max(1, slides.length));
  b.slideOut = new Int8Array(Math.max(1, slides.length));
  slides.forEach((s, k) => {
    b.slideAt[idx(s.entry[0], s.entry[1])] = k;
    b.slideMouth[k] = DIR_INDEX[s.mouth];
    b.slideTo[k] = idx(s.exit[0], s.exit[1]);
    b.slideOut[k] = DIR_INDEX[s.exitDir];
  });
  f.coins.forEach(([r, c], id) => (b.coinId[idx(r, c)] = id));
  b.exitIdx = idx(level.exit.r, level.exit.c);
  b.exitDir = DIR_INDEX[level.exit.dir];
  b.startIdx = idx(level.start[0], level.start[1]);
  boards.set(level, b);
  return b;
}

export const cellOf = (b: Board, i: number): [number, number] => {
  const r = Math.floor(i / b.cols);
  return [r, i - r * b.cols];
};

/** True for floor (a tile that has collapsed is a hole, not floor), and for a fragile wall that has been broken. */
export const isOpen = (b: Board, broken: ArrayLike<number>, i: number) =>
  b.collapseSlot[i] >= 0 ? !broken[b.collapseSlot[i]] : !b.wall[i] || (b.fragileId[i] >= 0 && broken[b.fragileId[i]] === 1);

/** The height of a tile as far as a paint bomb is concerned: a ramp counts as low floor. */
const bombLevel = (b: Board, i: number) => (b.rampUp[i] >= 0 ? 0 : b.lvl[i]);

/** The tiles a bomb on tile `center` paints: the open ones of the 3x3 square around it, on the same floor (platform or low). */
export function bombTargets(b: Board, broken: ArrayLike<number>, center: number): number[] {
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const j = center + dr * b.cols + dc;
      if (j < 0 || j >= b.n || !isOpen(b, broken, j) || bombLevel(b, j) !== bombLevel(b, center)) continue;
      out.push(j);
    }
  }
  return out;
}

/** Height of the edge of tile `i` on side `d`: 0 low, 1 platform, -1 when that side is closed (the side of a ramp). */
function heightOut(b: Board, i: number, d: number): number {
  const up = b.rampUp[i];
  if (up < 0) return b.lvl[i];
  return d === up ? 1 : d === OPP[up] ? 0 : -1;
}

/** Height at which a ball travelling in direction `d` arrives on tile `i` (through its side opposite to `d`). */
function heightIn(b: Board, i: number, d: number): number {
  const up = b.rampUp[i];
  if (up < 0) return b.lvl[i];
  return d === OPP[up] ? 1 : d === up ? 0 : -1;
}

/* ------------------------------------------------------------------------------------------
 * Sliding
 * ---------------------------------------------------------------------------------------- */

export type StopReason = 'wall' | 'stop' | 'fragile' | 'portal' | 'slide' | 'corner' | 'exit' | 'loop';

export type RawStep = {
  /** Cell index entered (the exit cell for the last step of a ball leaving the board). */
  i: number;
  /** Travel direction (index) when the ball got there. */
  d: number;
  /** True when the ball arrived here through a portal from the previous step's cell. */
  teleport: boolean;
  /** The slide the ball came down to land here, or -1. */
  slide: number;
};

export type Trace = {
  steps: RawStep[];
  end: number;
  lastDir: number;
  exited: boolean;
  /** Id of the fragile wall that was hit (and breaks), or -1. */
  fragile: number;
  /** Slots (in the `broken` array) of the tiles that collapsed behind the ball during this slide. */
  collapsed: number[];
  reason: StopReason;
  looped: boolean;
};

/** Lets the generator dig new floor while simulating a slide. */
export type Carver = {
  limit: number;
  carved: number[];
  canCarve: (i: number) => boolean;
};

/**
 * Simulates one swipe. This is THE movement rule of the game:
 *  - the ball slides until something stops it;
 *  - walls stop it; a fragile wall also stops it and breaks (`fragile`);
 *  - a stop tile stops it on the tile;
 *  - a corner turns it (90 degrees) if it enters/leaves through the corner's open sides, and
 *    behaves like a wall for the other two sides;
 *  - a portal moves it to the linked portal, same direction; it then keeps sliding, or stops
 *    on that portal if a wall is right ahead;
 *  - the exit is a wall unless `exitOpen` (every tile was painted BEFORE this swipe) and the ball arrives in the exit's direction.
 *    Painting the last tile during a slide does not open the gate for that slide: the ball stops in front of it and one more swipe
 *    goes through.
 * `looped` is set when the ball would circle forever (the generator rejects such levels).
 */
export function traceSlide(
  b: Board,
  broken: ArrayLike<number>,
  from: number,
  dir: number,
  exitOpen: boolean,
  carve?: Carver,
): Trace {
  const steps: RawStep[] = [];
  const cap = 4 * b.n + 8;
  let pos = from;
  let d = dir;
  let reason: StopReason = 'wall';
  let fragile = -1;
  let exited = false;
  let looped = false;
  // Collapsing tiles the ball has left during this slide: they are holes from then on (it may come back over them in the same slide).
  const collapsed: number[] = [];
  const left = (i: number) => {
    const slot = b.collapseSlot[i];
    if (slot >= 0 && !broken[slot] && !collapsed.includes(slot)) collapsed.push(slot);
  };
  const isHole = (i: number) => {
    const slot = b.collapseSlot[i];
    return slot >= 0 && (broken[slot] === 1 || collapsed.includes(slot));
  };
  /** Why a ball that stops now stops: after a portal or a slide it says so (the landing has its own effect). */
  const blockedReason = (): StopReason => {
    const last = steps[steps.length - 1];
    return last ? (last.slide >= 0 ? 'slide' : last.teleport ? 'portal' : 'wall') : 'wall';
  };

  for (;;) {
    // Leaving a corner is only possible through its open sides, leaving a ramp only along its axis.
    if (b.kind[pos] === KIND_CORNER && d !== b.cornerA[pos] && d !== b.cornerB[pos]) {
      reason = 'corner';
      break;
    }
    if (b.rampUp[pos] >= 0 && d !== b.rampUp[pos] && d !== OPP[b.rampUp[pos]]) {
      reason = blockedReason();
      break;
    }

    // The funnel of a slide: the ball that arrives travelling in its direction goes down the chute and lands on the exit tile.
    const sl = b.slideAt[pos];
    if (sl >= 0 && d === b.slideMouth[sl]) {
      left(pos);
      const to = b.slideTo[sl];
      d = b.slideOut[sl];
      steps.push({ i: to, d, teleport: false, slide: sl });
      pos = to;
      if (steps.length > cap) {
        looped = true;
        reason = 'loop';
        break;
      }
      continue;
    }

    const next = pos + b.off[d];

    if (next === b.exitIdx) {
      if (exitOpen && d === b.exitDir) {
        steps.push({ i: next, d, teleport: false, slide: -1 });
        pos = next;
        exited = true;
        reason = 'exit';
      } else {
        reason = blockedReason();
      }
      break;
    }

    if (b.wall[next]) {
      const f = b.fragileId[next];
      if (f >= 0 && !broken[f]) {
        fragile = f;
        reason = 'fragile';
        break;
      }
      if (f < 0) {
        if (carve && carve.carved.length < carve.limit && carve.canCarve(next)) {
          b.wall[next] = 0;
          b.req[next] = b.req[next] || 1;
          carve.carved.push(next);
        } else {
          reason = blockedReason();
          break;
        }
      }
    }

    // A hole (a tile that collapsed) is a wall, and so is the edge of a platform: only a ramp joins the two floors.
    if (isHole(next)) {
      reason = blockedReason();
      break;
    }
    const out = heightOut(b, pos, d);
    const into = heightIn(b, next, d);
    if (out < 0 || into < 0 || out !== into) {
      reason = blockedReason();
      break;
    }

    // A corner cannot be entered through one of its closed sides.
    if (b.kind[next] === KIND_CORNER && OPP[d] !== b.cornerA[next] && OPP[d] !== b.cornerB[next]) {
      reason = 'corner';
      break;
    }

    steps.push({ i: next, d, teleport: false, slide: -1 });
    left(pos);
    pos = next;
    if (steps.length > cap) {
      looped = true;
      reason = 'loop';
      break;
    }

    const k = b.kind[pos];
    if (k === KIND_STOP) {
      reason = 'stop';
      break;
    }
    if (k === KIND_CORNER) {
      d = b.cornerA[pos] === OPP[d] ? b.cornerB[pos] : b.cornerA[pos];
    } else if (k === KIND_PORTAL) {
      const to = b.portalTo[pos];
      steps.push({ i: to, d, teleport: true, slide: -1 });
      left(pos);
      pos = to;
    }
  }

  return { steps, end: pos, lastDir: d, exited, fragile, collapsed, reason, looped };
}

/**
 * True when some swipe from some tile makes the ball circle forever. Checked with every
 * fragile wall broken and the exit open, which covers every other configuration (walls that
 * are still standing only stop slides, they never create loops).
 */
export function hasInfiniteLoop(level: Level): boolean {
  const b = buildBoard(level);
  // Every fragile wall broken, no tile collapsed (a collapse during a slide is part of the slide itself).
  const broken = new Uint8Array(Math.max(1, level.features.fragile.length + (level.features.collapse ?? []).length));
  for (let k = 0; k < level.features.fragile.length; k++) broken[k] = 1;
  for (let i = 0; i < b.n; i++) {
    if (!isOpen(b, broken, i)) continue;
    for (let d = 0; d < 4; d++) {
      if (traceSlide(b, broken, i, d, true).looped) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------------------------
 * Game state
 * ---------------------------------------------------------------------------------------- */

/** Mutable play state. Kept as plain data so the renderer can snapshot it. */
export type GameState = {
  pos: Cell;
  /** Coats applied to each cell (index = row * cols + col). */
  coat: Uint8Array;
  /** Sum of all coats: the exit opens when this reaches `level.layers`. */
  layers: number;
  broken: Uint8Array;
  bombUsed: Uint8Array;
  coins: Uint8Array;
  coinCount: number;
  moves: number;
  finished: boolean;
};

export function createState(level: Level): GameState {
  const b = buildBoard(level);
  const state: GameState = {
    pos: [level.start[0], level.start[1]],
    coat: new Uint8Array(b.n),
    layers: 0,
    // Fragile walls first, then the collapsing tiles (see Board.collapseSlot).
    broken: new Uint8Array(Math.max(1, level.features.fragile.length + (level.features.collapse ?? []).length)),
    bombUsed: new Uint8Array(Math.max(1, level.features.bombs.length)),
    coins: new Uint8Array(Math.max(1, level.features.coins.length)),
    coinCount: 0,
    moves: 0,
    finished: false,
  };
  paintCell(b, state, b.startIdx); // the ball starts on a painted tile
  return state;
}

export const isExitOpen = (level: Level, state: GameState): boolean => state.layers >= level.layers;

/** Adds one coat if the cell still needs one. Returns the new coat count, or 0 if nothing changed. */
function paintCell(b: Board, state: GameState, i: number): number {
  if (state.coat[i] >= b.req[i]) return 0;
  state.coat[i]++;
  state.layers++;
  return state.coat[i];
}

export type Paint = { cell: Cell; coat: number };

export type SlideStep = {
  cell: Cell;
  /** Direction of travel on arrival. */
  dir: Dir;
  /** Arrived through a portal (the previous step is the portal it entered). */
  teleport: boolean;
  /** The slide the ball came down to land here (the previous step is its entry), or -1. */
  slide: number;
  /** Coats applied by entering this cell. */
  painted: Paint[];
  coin: boolean;
  /** Set when a paint bomb exploded here: the tiles it painted. */
  bomb: { center: Cell; painted: Paint[] } | null;
};

export type SlideResult = {
  from: Cell;
  steps: SlideStep[];
  /** Cells entered, in order (a convenience view of `steps`). */
  path: Cell[];
  end: Cell;
  lastDir: Dir;
  exited: boolean;
  reason: StopReason;
  /** The fragile wall that broke at the end of the slide. */
  broke: Cell | null;
  /** The tiles that collapsed behind the ball (they are holes now; they stay painted). */
  collapsed: Cell[];
  coins: Cell[];
  looped: boolean;
};

/** Applies a swipe to the state (mutating it). Returns null when the swipe does nothing. */
export function applyMove(level: Level, state: GameState, dir: Dir): SlideResult | null {
  if (state.finished) return null;
  const b = buildBoard(level);
  const from = state.pos[0] * b.cols + state.pos[1];
  const tr = traceSlide(b, state.broken, from, DIR_INDEX[dir], isExitOpen(level, state));
  if (tr.steps.length === 0 && tr.fragile < 0) return null;

  state.moves++;
  const steps: SlideStep[] = [];
  const coins: Cell[] = [];
  for (const s of tr.steps) {
    const cell = cellOf(b, s.i);
    const step: SlideStep = { cell, dir: DIRS[s.d], teleport: s.teleport, slide: s.slide, painted: [], coin: false, bomb: null };
    steps.push(step);
    if (s.i === b.exitIdx) continue;

    const coat = paintCell(b, state, s.i);
    if (coat) step.painted.push({ cell, coat });

    const coinId = b.coinId[s.i];
    if (coinId >= 0 && !state.coins[coinId]) {
      state.coins[coinId] = 1;
      state.coinCount++;
      step.coin = true;
      coins.push(cell);
    }

    const bombId = b.bombId[s.i];
    if (bombId >= 0 && !state.bombUsed[bombId]) {
      state.bombUsed[bombId] = 1;
      const painted: Paint[] = [];
      for (const j of bombTargets(b, state.broken, s.i)) {
        const c2 = paintCell(b, state, j);
        if (c2) painted.push({ cell: cellOf(b, j), coat: c2 });
      }
      step.bomb = { center: cell, painted };
    }
  }

  let broke: Cell | null = null;
  if (tr.fragile >= 0) {
    state.broken[tr.fragile] = 1;
    const [fr, fc] = level.features.fragile[tr.fragile];
    broke = [fr, fc];
  }

  // The tiles the ball has left collapse (they were painted when it crossed them).
  const collapsed: Cell[] = [];
  for (const slot of tr.collapsed) {
    state.broken[slot] = 1;
    const [cr, cc] = level.features.collapse[slot - level.features.fragile.length];
    collapsed.push([cr, cc]);
  }

  const exited = tr.exited;
  const endIdx = tr.end;
  const reason = tr.reason;

  state.pos = cellOf(b, endIdx);
  if (exited) state.finished = true;
  return {
    from: cellOf(b, from),
    steps,
    path: steps.map((s) => s.cell),
    end: state.pos,
    lastDir: DIRS[tr.lastDir],
    exited,
    reason,
    broke,
    collapsed,
    coins,
    looped: tr.looped,
  };
}

/** Plays a whole sequence of swipes on a fresh state; handy for tests and tools. */
export function replay(level: Level, moves: string): GameState {
  const state = createState(level);
  for (const m of moves) applyMove(level, state, m as Dir);
  return state;
}

/** Floor cells + fragile walls (to paint), and the total coats they need. */
export function measure(grid: string[], features: Features): { floorCount: number; layers: number } {
  let floor = 0;
  for (const row of grid) for (const ch of row) if (ch === '.') floor++;
  const floorCount = floor + features.fragile.length;
  return { floorCount, layers: floorCount + features.doubles.length };
}
