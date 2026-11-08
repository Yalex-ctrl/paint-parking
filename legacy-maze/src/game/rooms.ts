import { createRng, type Rng } from '../core/rng';
import { DELTA, OPPOSITE, type Dir } from './types';

/**
 * Open maps, like AMAZE: rooms of 2x2 up to 4x5, corridors one to three tiles wide, L and U shaped areas, a few
 * single-tile pillars inside the rooms. This module only draws the floor plan (which tiles are floor); the mechanics
 * are placed on it by levelgen.ts, and the solver then decides whether it is a level.
 */
export type Plan = {
  rows: number;
  cols: number;
  /** 1 = floor. */
  floor: Uint8Array;
  /** The floor tile the ball starts on (on the inner border of the entry side). */
  start: [number, number];
  /** The floor tile next to the exit opening (on the inner border of the exit side), and the exit direction. */
  exitTile: [number, number];
  entrySide: Dir;
  exitSide: Dir;
};

export type PlanSpec = {
  rows: number;
  cols: number;
  entrySide: Dir;
  exitSide: Dir;
  /** How many rooms to try to place. */
  rooms: number;
  /** Pillars to put inside the big rooms. */
  pillars: number;
  /** Chance that a corridor is wider than one tile. */
  wide: number;
  /** Share of floor tiles that must belong to a 2x2 block of floor. */
  openMin: number;
  /** Floor share of the inner area: [min, max]. */
  fill: [number, number];
  /** Walls kept between two rooms, in tiles (1 by default): thick walls leave room for the chutes of the slides. */
  gap?: number;
};

const at = (cols: number, r: number, c: number) => r * cols + c;

/** Share of floor tiles that belong to at least one 2x2 block entirely made of floor. */
export function openShare(floor: ArrayLike<number>, rows: number, cols: number): number {
  let total = 0;
  let open = 0;
  const f = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && floor[at(cols, r, c)] === 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!f(r, c)) continue;
      total++;
      const inBlock = [
        [0, 0],
        [0, -1],
        [-1, 0],
        [-1, -1],
      ].some(([dr, dc]) => f(r + dr, c + dc) && f(r + dr, c + dc + 1) && f(r + dr + 1, c + dc) && f(r + dr + 1, c + dc + 1));
      if (inBlock) open++;
    }
  }
  return total === 0 ? 0 : open / total;
}

const connected = (floor: Uint8Array, rows: number, cols: number): boolean => {
  let first = -1;
  let count = 0;
  for (let i = 0; i < floor.length; i++) {
    if (floor[i]) {
      count++;
      if (first < 0) first = i;
    }
  }
  if (first < 0) return false;
  const seen = new Uint8Array(floor.length);
  const stack = [first];
  seen[first] = 1;
  let reached = 0;
  while (stack.length) {
    const i = stack.pop()!;
    reached++;
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = at(cols, nr, nc);
      if (floor[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return reached === count;
};

type Room = { r: number; c: number; h: number; w: number };

function dig(floor: Uint8Array, cols: number, rows: number, r0: number, c0: number, h: number, w: number) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < rows && c < cols) floor[at(cols, r, c)] = 1;
}

/** A corridor of the given width from one tile to another: along the rows first or the columns first. */
function corridor(floor: Uint8Array, rows: number, cols: number, a: [number, number], b: [number, number], width: number, rowsFirst: boolean) {
  const [r0, c0] = a;
  const [r1, c1] = b;
  const thick = (r: number, c: number, vertical: boolean) => {
    // The line is `width` wide, centred (a little to one side for even widths).
    for (let k = 0; k < width; k++) {
      const o = k - Math.floor((width - 1) / 2);
      const rr = vertical ? r : r + o;
      const cc = vertical ? c + o : c;
      if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) floor[at(cols, rr, cc)] = 1;
    }
  };
  if (rowsFirst) {
    // vertical leg first, at column c0; then horizontal leg at row r1
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) thick(r, c0, true);
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) thick(r1, c, false);
  } else {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) thick(r0, c, false);
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) thick(r, c1, true);
  }
}

/** Places a floor tile on the inner border line of `side` and joins it to the rest by a short straight run. */
function reachBorder(floor: Uint8Array, rows: number, cols: number, side: Dir, rng: Rng, avoid?: [number, number]): [number, number] | null {
  const vertical = side === 'U' || side === 'D';
  const len = vertical ? cols : rows;
  const candidates: [number, number][] = [];
  for (let k = 0; k < len; k++) {
    const cell: [number, number] = side === 'U' ? [0, k] : side === 'D' ? [rows - 1, k] : side === 'L' ? [k, 0] : [k, cols - 1];
    if (avoid && Math.abs(cell[0] - avoid[0]) + Math.abs(cell[1] - avoid[1]) < 3) continue;
    candidates.push(cell);
  }
  // Prefer a tile that is already floor; otherwise dig toward the nearest floor straight inward.
  const existing = candidates.filter(([r, c]) => floor[at(cols, r, c)] === 1);
  if (existing.length > 0) return rng.shuffle(existing)[0];
  const [dr, dc] = DELTA[OPPOSITE[side]];
  for (const [r, c] of rng.shuffle(candidates)) {
    let rr = r;
    let cc = c;
    const trail: number[] = [];
    while (rr >= 0 && cc >= 0 && rr < rows && cc < cols && !floor[at(cols, rr, cc)]) {
      trail.push(at(cols, rr, cc));
      rr += dr;
      cc += dc;
    }
    if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && trail.length <= Math.max(rows, cols) * 0.7) {
      for (const i of trail) floor[i] = 1;
      return [r, c];
    }
  }
  return null;
}

/** Fills in tiles that would complete a 2x2 block of floor, until enough of the floor is "open". */
function widen(floor: Uint8Array, rows: number, cols: number, target: number, maxFill: number, rng: Rng, keep: number[]) {
  const total = rows * cols;
  for (let guard = 0; guard < 400; guard++) {
    if (openShare(floor, rows, cols) >= target) return;
    let count = 0;
    for (let i = 0; i < total; i++) count += floor[i];
    if (count >= total * maxFill) return;
    // Candidate: a wall tile that has floor on two perpendicular sides AND the diagonal between them (so it completes a block).
    const cands: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = at(cols, r, c);
        if (floor[i] || keep.includes(i)) continue;
        const f = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < rows && cc < cols && floor[at(cols, rr, cc)] === 1;
        for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (f(r + dr, c) && f(r, c + dc) && f(r + dr, c + dc)) {
            cands.push(i);
            break;
          }
        }
      }
    }
    if (cands.length === 0) return;
    floor[rng.shuffle(cands)[0]] = 1;
  }
}

/**
 * Which tiles the ball can ever paint, ignoring the order: from the start, slide in each direction, note every tile crossed
 * and where the ball stops, and go on from the new stopping places. In an open room the ball only stops against a wall, so
 * tiles in the middle of a big room are often never crossed. `stops` gets the places the ball can stop.
 */
export function coverage(floor: Uint8Array, rows: number, cols: number, start: [number, number]): { covered: Uint8Array; stops: Set<number> } {
  const covered = new Uint8Array(floor.length);
  const stops = new Set<number>();
  const first = at(cols, start[0], start[1]);
  covered[first] = 1;
  stops.add(first);
  const queue = [first];
  while (queue.length) {
    const p = queue.pop()!;
    const pr = Math.floor(p / cols);
    const pc = p - pr * cols;
    for (const d of ['U', 'D', 'L', 'R'] as Dir[]) {
      const [dr, dc] = DELTA[d];
      let r = pr;
      let c = pc;
      for (;;) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || !floor[at(cols, nr, nc)]) break;
        r = nr;
        c = nc;
        covered[at(cols, r, c)] = 1;
      }
      const q = at(cols, r, c);
      if (q !== p && !stops.has(q)) {
        stops.add(q);
        queue.push(q);
      }
    }
  }
  return { covered, stops };
}

/** Turns into wall every floor tile the ball could never paint (they become the pillars of the rooms). */
function prune(floor: Uint8Array, rows: number, cols: number, start: [number, number], exitTile: [number, number]): boolean {
  for (let pass = 0; pass < 12; pass++) {
    const { covered } = coverage(floor, rows, cols, start);
    let changed = false;
    for (let i = 0; i < floor.length; i++) {
      if (floor[i] && !covered[i]) {
        floor[i] = 0;
        changed = true;
      }
    }
    if (!changed) return floor[at(cols, exitTile[0], exitTile[1])] === 1;
  }
  return false;
}

/** A floor plan, or null when this draw did not work out (the caller just tries another seed). */
export function makePlan(spec: PlanSpec, rng: Rng): Plan | null {
  const { rows, cols } = spec;
  const floor = new Uint8Array(rows * cols);
  const rooms: Room[] = [];
  // 1. Rooms (some overlapping an earlier one: that is how L and U shapes appear).
  for (let tries = 0; tries < spec.rooms * 14 && rooms.length < spec.rooms; tries++) {
    let h = rng.int(2, 5);
    let w = rng.int(2, 4);
    if (rng.next() < 0.5) [h, w] = [w, h];
    h = Math.min(h, rows - 1);
    w = Math.min(w, cols - 1);
    const r = rng.int(0, rows - h);
    const c = rng.int(0, cols - w);
    const allowOverlap = rooms.length > 0 && rng.next() < 0.3;
    const gap = spec.gap ?? 1;
    const clash = rooms.some((o) => r < o.r + o.h + gap && r + h + gap > o.r && c < o.c + o.w + gap && c + w + gap > o.c);
    const overlaps = rooms.some((o) => r < o.r + o.h && r + h > o.r && c < o.c + o.w && c + w > o.c);
    if (clash && !(allowOverlap && overlaps)) continue;
    rooms.push({ r, c, h, w });
    dig(floor, cols, rows, r, c, h, w);
  }
  if (rooms.length < 2) return null;

  // 2. Corridors join the rooms (each new one to the nearest already joined).
  const centre = (o: Room): [number, number] => [o.r + Math.floor(o.h / 2), o.c + Math.floor(o.w / 2)];
  const joined = [rooms[0]];
  const rest = rooms.slice(1);
  while (rest.length) {
    let best = { d: Infinity, i: 0, j: 0 };
    rest.forEach((o, i) =>
      joined.forEach((j, jj) => {
        const [a, b] = [centre(o), centre(j)];
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d < best.d) best = { d, i, j: jj };
      }),
    );
    const from = rest.splice(best.i, 1)[0];
    const to = joined[best.j];
    const width = rng.next() < spec.wide ? rng.int(2, 3) : 1;
    corridor(floor, rows, cols, centre(from), centre(to), width, rng.next() < 0.5);
    joined.push(from);
  }

  // 3. Pillars: single walls inside the big rooms.
  const bigRooms = rooms.filter((o) => o.h >= 3 && o.w >= 3);
  for (let k = 0; k < spec.pillars && bigRooms.length > 0; k++) {
    const o = rng.shuffle(bigRooms)[0];
    const r = o.r + rng.int(1, o.h - 2);
    const c = o.c + rng.int(1, o.w - 2);
    // Only inside a block of floor: all eight neighbours are floor, so it never cuts anything.
    let ok = true;
    for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1; dc++) if (!(dr === 0 && dc === 0) && !floor[at(cols, r + dr, c + dc)]) ok = false;
    if (ok) floor[at(cols, r, c)] = 0;
  }

  // 4. The way in and the way out, on the sides the level asks for.
  const start = reachBorder(floor, rows, cols, spec.entrySide, rng);
  if (!start) return null;
  const exitTile = reachBorder(floor, rows, cols, spec.exitSide, rng, spec.entrySide === spec.exitSide ? start : undefined);
  if (!exitTile) return null;
  // The way in and the way out never share a tile (it would be a corner tile of the board).
  if (exitTile[0] === start[0] && exitTile[1] === start[1]) return null;

  // 5. Open it up until enough of the floor is made of 2x2 blocks.
  widen(floor, rows, cols, spec.openMin, spec.fill[1], rng, [at(cols, start[0], start[1])]);

  // 6. Whatever the ball could never paint is turned into wall; the plan must still be a good one after that.
  if (!prune(floor, rows, cols, start, exitTile)) return null;
  if (floor[at(cols, start[0], start[1])] !== 1) return null;

  // 7. Checks.
  if (!connected(floor, rows, cols)) return null;
  let count = 0;
  for (let i = 0; i < floor.length; i++) count += floor[i];
  if (count < rows * cols * spec.fill[0]) return null;
  if (openShare(floor, rows, cols) < spec.openMin) return null;
  // Both ends really are on their border lines.
  const onSide = (cell: [number, number], side: Dir) =>
    side === 'U' ? cell[0] === 0 : side === 'D' ? cell[0] === rows - 1 : side === 'L' ? cell[1] === 0 : cell[1] === cols - 1;
  if (!onSide(start, spec.entrySide) || !onSide(exitTile, spec.exitSide)) return null;
  return { rows, cols, floor, start, exitTile, entrySide: spec.entrySide, exitSide: spec.exitSide };
}

export { createRng };
