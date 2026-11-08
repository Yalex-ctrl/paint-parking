import type { Plan } from './rooms';
import type { Rng } from './rng';
import { DELTA, DIRS, OPPOSITE, type Dir, type Slide } from './types';

/**
 * Where the three newest mechanics go on a floor plan (slides, platforms with their ramp, collapsing tiles). Everything here works
 * in the coordinates of the plan (the inner area, without the outer wall ring); the generator adds the ring afterwards.
 */
const at = (cols: number, r: number, c: number) => r * cols + c;

/* --------------------------------------------------------------------------------------- platforms */

export type TierPlacement = {
  /** The tiles of the platform (their indices in the plan). */
  raised: number[];
  /** The ramp tile and the side that faces the platform. */
  ramp: { i: number; up: Dir };
};

/** Tiles reachable from `from` over floor, never crossing `block`. */
function flood(plan: Plan, from: number, block: number): Set<number> {
  const { rows, cols, floor } = plan;
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    for (const d of DIRS) {
      const [dr, dc] = DELTA[d];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = at(cols, nr, nc);
      if (j === block || !floor[j] || seen.has(j)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen;
}

/**
 * A platform: one side of a bridge of the plan. The ramp is a tile of a one-tile-wide corridor (walls on both sides of it, floor
 * at both ends in line with it) whose removal cuts the floor in two; the part that does not hold the start or the exit becomes
 * the platform. So the platform can only be reached by the ramp, it never touches the low floor anywhere else (its edge is
 * wall or cliff all round), and the start and the exit stay on the low floor.
 */
export function placeTier(plan: Plan, taken: ReadonlySet<number>, rng: Rng, size: { min: number; max: number }): TierPlacement | null {
  const { rows, cols, floor } = plan;
  const startI = at(cols, plan.start[0], plan.start[1]);
  const exitI = at(cols, plan.exitTile[0], plan.exitTile[1]);
  let floorCount = 0;
  for (let i = 0; i < floor.length; i++) floorCount += floor[i];
  const isWall = (r: number, c: number) => r < 0 || c < 0 || r >= rows || c >= cols || !floor[at(cols, r, c)];
  const found: TierPlacement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = at(cols, r, c);
      if (!floor[i] || taken.has(i) || i === startI || i === exitI) continue;
      for (const vertical of [true, false]) {
        const a: Dir = vertical ? 'U' : 'L';
        const b = OPPOSITE[a];
        const [ar, ac] = DELTA[a];
        const [br, bc] = DELTA[b];
        const A = at(cols, r + ar, c + ac);
        const B = at(cols, r + br, c + bc);
        if (isWall(r + ar, c + ac) || isWall(r + br, c + bc)) continue;
        // Walls on both sides of the ramp.
        const lateral = vertical ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
        if (!lateral.every(([dr, dc]) => isWall(r + dr, c + dc))) continue;
        const sideA = flood(plan, A, i);
        if (sideA.has(B)) continue; // not a bridge
        const sideB = flood(plan, B, i);
        for (const [side, up] of [[sideA, a], [sideB, b]] as [Set<number>, Dir][]) {
          if (side.size < size.min || side.size > size.max) continue;
          if (side.has(startI) || side.has(exitI)) continue;
          found.push({ raised: [...side], ramp: { i, up } });
        }
      }
    }
  }
  if (!found.length) return null;
  void floorCount;
  return rng.shuffle(found)[0];
}

/* --------------------------------------------------------------------------------------- slides */

type Template = { shape: Slide['shape']; path: [number, number][]; exit: [number, number]; exitDir: Dir; wall?: [number, number][] };

const run = (r0: number, c0: number, dr: number, dc: number, n: number): [number, number][] => Array.from({ length: n }, (_, k) => [r0 + dr * (k + 1), c0 + dc * (k + 1)] as [number, number]);

/** The shapes of chute, drawn with the funnel facing right (`R`) from the entry tile at (0, 0): the walls it passes over, and the landing. */
export function slideTemplates(shapes: readonly Slide['shape'][]): Template[] {
  const out: Template[] = [];
  const want = (s: Slide['shape']) => shapes.includes(s);
  if (want('line')) {
    for (let n = 3; n <= 8; n++) out.push({ shape: 'line', path: run(0, 0, 0, 1, n), exit: [0, n + 1], exitDir: 'R' });
  }
  if (want('L')) {
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const n = a + b;
        if (n < 3 || n > 8) continue;
        out.push({ shape: 'L', path: [...run(0, 0, 0, 1, a), ...run(0, a, 1, 0, b)], exit: [b + 1, a], exitDir: 'D' });
      }
    }
  }
  if (want('S')) {
    for (let a = 1; a <= 4; a++) {
      for (let b = 1; b <= 4; b++) {
        for (let c = 1; c <= 4; c++) {
          const n = a + b + c;
          if (n < 3 || n > 8) continue;
          out.push({ shape: 'S', path: [...run(0, 0, 0, 1, a), ...run(0, a, 1, 0, b), ...run(b, a, 0, 1, c)], exit: [b, a + c + 1], exitDir: 'R' });
        }
      }
    }
  }
  if (want('spiral')) {
    // One turn round a block of walls: along the top, down the right side, back along the bottom, and up onto the tile under the entry.
    out.push({ shape: 'spiral', path: [[0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]], exit: [1, 0], exitDir: 'U', wall: [[1, 1]] });
  }
  return out;
}

/** The eight ways to turn and mirror a drawing: how a cell offset and a direction change. */
type Sym = { cell: (r: number, c: number) => [number, number]; dir: (d: Dir) => Dir };
const ROT: Record<Dir, Dir> = { R: 'D', D: 'L', L: 'U', U: 'R' };
function symmetries(): Sym[] {
  const out: Sym[] = [];
  for (const mirror of [false, true]) {
    for (let q = 0; q < 4; q++) {
      out.push({
        cell: (r, c) => {
          let rr = r;
          let cc = c;
          if (mirror) rr = -rr; // mirror up-down first
          for (let i = 0; i < q; i++) [rr, cc] = [cc, -rr]; // a quarter turn clockwise
          return [rr, cc];
        },
        dir: (d) => {
          let x = d;
          if (mirror) x = x === 'U' ? 'D' : x === 'D' ? 'U' : x;
          for (let i = 0; i < q; i++) x = ROT[x];
          return x;
        },
      });
    }
  }
  return out;
}
const SYMS = symmetries();

export type SlideOptions = {
  /** Plan tiles (indices) that are on a platform. */
  raised: ReadonlySet<number>;
  /** Tiles already used by something else (stops, bends, ramps...). */
  taken: ReadonlySet<number>;
  /** Tiles already under another chute. */
  over: ReadonlySet<number>;
  shapes: readonly Slide['shape'][];
  /** The entry is on a platform and the landing on the low floor. */
  fromPlatform?: boolean;
  /** Walking distance (in tiles) between the entry and the exit that a chute must save at least, so it is worth taking. */
  minShortcut?: number;
};

/** Walking distance between two tiles over the floor (4-neighbours), Infinity when they are not joined. */
function walkDistance(plan: Plan, from: number, to: number): number {
  const { rows, cols, floor } = plan;
  const dist = new Map<number, number>([[from, 0]]);
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (i === to) return dist.get(i)!;
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    for (const d of DIRS) {
      const [dr, dc] = DELTA[d];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = at(cols, nr, nc);
      if (!floor[j] || dist.has(j)) continue;
      dist.set(j, dist.get(i)! + 1);
      queue.push(j);
    }
  }
  return Infinity;
}

/**
 * Every chute that fits on the plan, with the one that saves the most walking first (a slide is worth something when it joins two
 * places that are far apart by foot). A chute only passes over wall tiles inside the plan, its landing is a floor tile, and it
 * never goes up (a platform entry may land on the platform's floor or on the low floor, a low entry only on the low floor).
 */
export function findSlides(plan: Plan, opts: SlideOptions): { slide: Slide; saves: number }[] {
  const { rows, cols, floor } = plan;
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  const startI = at(cols, plan.start[0], plan.start[1]);
  const exitI = at(cols, plan.exitTile[0], plan.exitTile[1]);
  const templates = slideTemplates(opts.shapes);
  const found: { slide: Slide; saves: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = at(cols, r, c);
      if (!floor[e] || opts.taken.has(e) || e === startI || e === exitI) continue;
      if (opts.fromPlatform && !opts.raised.has(e)) continue;
      for (const t of templates) {
        for (const sym of SYMS) {
          const cell = (off: readonly [number, number]): [number, number] => {
            const [dr, dc] = sym.cell(off[0], off[1]);
            return [r + dr, c + dc];
          };
          const path = t.path.map(cell);
          if (!path.every(([pr, pc]) => inside(pr, pc) && !floor[at(cols, pr, pc)] && !opts.over.has(at(cols, pr, pc)))) continue;
          if (t.wall && !t.wall.map(cell).every(([wr, wc]) => inside(wr, wc) && !floor[at(cols, wr, wc)])) continue;
          const [xr, xc] = cell(t.exit);
          if (!inside(xr, xc)) continue;
          const x = at(cols, xr, xc);
          if (!floor[x] || x === e || opts.taken.has(x) || x === startI || x === exitI) continue;
          // Never up: from the low floor only to the low floor.
          if (!opts.raised.has(e) && opts.raised.has(x)) continue;
          if (opts.fromPlatform && opts.raised.has(x)) continue;
          const saves = walkDistance(plan, e, x) - path.length;
          if (saves < (opts.minShortcut ?? 0)) continue;
          found.push({
            slide: { entry: [r, c], mouth: sym.dir('R'), exit: [xr, xc], exitDir: sym.dir(t.exitDir), path, shape: t.shape },
            saves,
          });
        }
      }
    }
  }
  return found.sort((a, b) => b.saves - a.saves);
}

/** One chute, taken among the best fifth of those that fit (a little at random, so the levels differ). */
export function pickSlide(plan: Plan, opts: SlideOptions, rng: Rng): Slide | null {
  const all = findSlides(plan, opts);
  if (!all.length) return null;
  const top = all.slice(0, Math.max(1, Math.ceil(all.length / 5)));
  return rng.shuffle(top)[0].slide;
}

/* --------------------------------------------------------------------------------------- collapsing floor */

/** Tiles that will collapse: floor tiles with something else to do (open on two sides at least), away from the start and the exit. */
export function placeCollapse(plan: Plan, taken: ReadonlySet<number>, rng: Rng, n: number, avoid: ReadonlySet<number> = new Set()): number[] | null {
  const { rows, cols, floor } = plan;
  const startI = at(cols, plan.start[0], plan.start[1]);
  const exitI = at(cols, plan.exitTile[0], plan.exitTile[1]);
  const ok: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = at(cols, r, c);
      if (!floor[i] || taken.has(i) || avoid.has(i) || i === startI || i === exitI) continue;
      let open = 0;
      for (const d of DIRS) {
        const [dr, dc] = DELTA[d];
        if (r + dr >= 0 && c + dc >= 0 && r + dr < rows && c + dc < cols && floor[at(cols, r + dr, c + dc)]) open++;
      }
      if (open >= 2) ok.push(i);
    }
  }
  if (ok.length < n) return null;
  return rng.shuffle(ok).slice(0, n);
}
