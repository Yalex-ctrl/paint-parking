import { analyzeSolution } from './analysis';
import { cropLevel } from './crop';
import type { Theme } from './dailyThemes';
import { hasInfiniteLoop, measure } from './engine';
import { countBranches, countDeadEnds, LEVEL_COLORS, verifyLevel } from './generator';
import { MAX_KINDS, MAX_SLIDES, kindsOf, starsForIndex } from './dailyMechanics';
import { findSlides, placeCollapse } from '../core/newFeatures';
import { createRng, type Rng } from '../core/rng';
import type { Plan } from './rooms';
import { slidesProblem } from '../render/slidePath';
import { hiddenFloorCells } from '../render/visibility';
import { withinBudget } from '../render/budget';
import { difficultyScore } from './scoring';
import { solve } from './solver';
import { DELTA, DIRS, emptyFeatures, mechanicsOf, type Dir, type Features, type Level, type Mechanic, type Ramp, type Slide } from './types';

/** How many chutes are tried on one corridor before it is given up. */
const MAX_SLIDE_TRIES = 10;

/**
 * The daily challenges: levels of their own, nothing like the campaign. Each one is a long winding corridor in a recognisable shape
 * (a spiral, a zigzag, a heart, a star, a symmetrical figure, a circuit, a field of portals and bombs), with a bend (a "corner" tile)
 * at every turn, so that one swipe can carry the ball around the whole figure. Side pockets off the corridor, closed by stop tiles,
 * and tiles to cross twice ("x2") make it a puzzle. Every level is checked by the solver (solvable, long enough, the solution really
 * goes round the bends), by the same difficulty score as the campaign, and no two of them have the same shape.
 *
 * The theme follows the day of the week: Monday spiral, Tuesday symmetry, Wednesday zigzag, Thursday star, Friday heart,
 * Saturday circuit, Sunday portals and bombs.
 */
export { THEMES, THEME_NAMES, type Theme } from './dailyThemes';

type Pt = [number, number];
type Path = Pt[];

/* ------------------------------------------------------------------------------------------------ the corridors */

/** The cells of the straight line from a to b (both included; they share a row or a column). */
function line(a: Pt, b: Pt): Path {
  const out: Path = [];
  const dr = Math.sign(b[0] - a[0]);
  const dc = Math.sign(b[1] - a[1]);
  let [r, c] = a;
  out.push([r, c]);
  while (r !== b[0] || c !== b[1]) {
    r += dr;
    c += dc;
    out.push([r, c]);
  }
  return out;
}

/** The corridor through these corners, in order (the shared cells are not repeated). */
function chain(corners: Pt[]): Path {
  const out: Path = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const seg = line(corners[i], corners[i + 1]);
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

/** A rectangular spiral from the outside in, the turns `gap` cells apart (3 makes the corridors easier to read). */
function spiralCorners(R: number, C: number, gap: number): Pt[] {
  const pts: Pt[] = [[0, 0]];
  let top = 0;
  let left = 0;
  let bottom = R - 1;
  let right = C - 1;
  for (let guard = 0; guard < 20; guard++) {
    pts.push([top, right]);
    if (bottom - top < gap) break;
    pts.push([bottom, right]);
    if (right - left < gap) break;
    pts.push([bottom, left]);
    if (bottom - (top + gap) < 2) break;
    pts.push([top + gap, left]);
    top += gap;
    left += gap;
    right -= gap;
    bottom -= gap;
    if (right - left < 2) break;
  }
  return pts;
}

/**
 * A serpentine clipped by a shape: rows every second line, each as wide as the shape is there, joined at alternating ends. The
 * silhouette of the floor is the shape. `extent(row)` gives the [left, right] columns of the shape on that row (or null).
 */
function serpentine(R: number, extent: (r: number) => [number, number] | null, rng: Rng, wobble = 0, spacing = 3): Path | null {
  const rows: { r: number; l: number; rt: number }[] = [];
  for (let r = 0; r < R; r += spacing) {
    const e = extent(r);
    if (e && e[1] - e[0] >= 2) rows.push({ r, l: e[0], rt: e[1] });
  }
  if (rows.length < 4) return null;
  // The two ends of a row joined to the next one must exist on both rows.
  const corners: Pt[] = [];
  let x = rows[0].l;
  corners.push([rows[0].r, x]);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const jitter = wobble ? rng.int(0, wobble) : 0;
    const turn = i % 2 === 0 ? Math.min(a.rt, b.rt) - jitter : Math.max(a.l, b.l) + jitter;
    corners.push([a.r, turn]);
    corners.push([b.r, turn]);
    x = turn;
  }
  const last = rows[rows.length - 1];
  corners.push([last.r, (rows.length - 1) % 2 === 0 ? last.rt : last.l]);
  // Drop repeated corners (a straight run split in two).
  const clean: Pt[] = [];
  for (const p of corners) if (clean.length === 0 || clean[clean.length - 1][0] !== p[0] || clean[clean.length - 1][1] !== p[1]) clean.push(p);
  return chain(clean);
}

/** A plain rectangle serpentine whose turns wander a little (so no two zigzags are alike). */
function zigzagPath(R: number, C: number, rng: Rng): Path | null {
  return serpentine(R, () => [0, C - 1], rng, 2);
}

/** The corridor goes on in the direction of its last move up to the edge of the board (so the exit can be there). */
function extendToEdge(path: Path, R: number, C: number): Path {
  const n = path.length;
  if (n < 2) return path;
  const d = dirOf(path[n - 2], path[n - 1]);
  const out = [...path];
  let [r, c] = path[n - 1];
  for (;;) {
    r += DELTA[d][0];
    c += DELTA[d][1];
    if (r < 0 || c < 0 || r >= R || c >= C) break;
    out.push([r, c]);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ the shapes */

type Mask = (r: number, c: number) => boolean;

/** Heart: the classic implicit curve, scaled to the board. */
function heartMask(R: number, C: number): Mask {
  return (r, c) => {
    const y = 1.25 - ((r + 0.5) / R) * 2.45;
    const x = ((c + 0.5) / C) * 2.6 - 1.3;
    // The notch between the two lobes is made wider than the curve says, so that its two sides do not touch on a small board.
    if (Math.abs(c - (C - 1) / 2) <= 1.01 && r <= R * 0.24) return false;
    return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
  };
}

/** A star with `points` tips: the radius goes from 1 at a tip down to `inner` in the valley between two tips. */
function starMask(R: number, C: number, points: number, inner: number): Mask {
  return (r, c) => {
    const dx = (c - (C - 1) / 2) / (C / 2);
    const dy = (r - (R - 1) / 2) / (R / 2);
    const a = Math.atan2(dx, -dy);
    const sector = (2 * Math.PI) / points;
    const t = Math.abs((((a % sector) + sector) % sector) - sector / 2) / (sector / 2); // 0 at a tip, 1 in the valley
    return Math.hypot(dx, dy) <= 1 - (1 - inner) * (1 - t) * 1.0 + 0.0;
  };
}

/** A diamond, and a plus sign. */
function diamondMask(R: number, C: number): Mask {
  return (r, c) => Math.abs(r - (R - 1) / 2) / (R / 2) + Math.abs(c - (C - 1) / 2) / (C / 2) <= 1.02;
}
function plusMask(R: number, C: number): Mask {
  return (r, c) => {
    const dr = Math.abs(r - (R - 1) / 2);
    const dc = Math.abs(c - (C - 1) / 2);
    return dr <= R * 0.17 || dc <= C * 0.17;
  };
}

const NEIGHBOURS8: Pt[] = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]]; // clockwise from north

/**
 * The outline of a shape as a corridor: the cells of the shape that touch the outside, in order round it (Moore tracing), made
 * 4-connected by filling the diagonal steps. A closed loop (the first cell follows the last).
 */
export function outlineCycle(mask: Mask, R: number, C: number): Path | null {
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < R && c < C && mask(r, c);
  let start: Pt | null = null;
  for (let r = 0; r < R && !start; r++) for (let c = 0; c < C; c++) if (inside(r, c)) {
    start = [r, c];
    break;
  }
  if (!start) return null;
  const trace: Pt[] = [start];
  // Walk round the border: look for the next border cell clockwise, starting just after the cell we came from.
  let cur: Pt = start;
  let back = 6; // we "came from" the west of the first cell (it is the first in reading order)
  for (let guard = 0; guard < R * C * 4; guard++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const [nr, nc] = [cur[0] + NEIGHBOURS8[d][0], cur[1] + NEIGHBOURS8[d][1]];
      if (inside(nr, nc)) {
        found = d;
        break;
      }
    }
    if (found < 0) return null; // a single cell
    const next: Pt = [cur[0] + NEIGHBOURS8[found][0], cur[1] + NEIGHBOURS8[found][1]];
    back = (found + 4) % 8;
    // The border cell we step to is "behind" us in the direction we came from.
    if (next[0] === start[0] && next[1] === start[1]) break;
    trace.push(next);
    cur = next;
  }
  // 4-connected: a diagonal step gets the cell beside it that is inside the shape.
  const cycle: Path = [];
  for (let i = 0; i < trace.length; i++) {
    const a = trace[i];
    const b = trace[(i + 1) % trace.length];
    cycle.push(a);
    if (Math.abs(a[0] - b[0]) === 1 && Math.abs(a[1] - b[1]) === 1) {
      const f1: Pt = [a[0], b[1]];
      const f2: Pt = [b[0], a[1]];
      if (inside(f1[0], f1[1])) cycle.push(f1);
      else if (inside(f2[0], f2[1])) cycle.push(f2);
      else return null;
    }
  }
  return cycle;
}

/** Cuts a closed outline into a corridor: it ends on the edge of the board heading out, with a one-cell gap before its start. */
function openOutline(cycle: Path, R: number, C: number, rng: Rng): Path | null {
  const n = cycle.length;
  const candidates: number[] = [];
  for (let i = 1; i < n; i++) {
    const [r, c] = cycle[i];
    const d = dirOf(cycle[i - 1], cycle[i]);
    if ((d === 'U' && r === 0) || (d === 'D' && r === R - 1) || (d === 'L' && c === 0) || (d === 'R' && c === C - 1)) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const i = candidates[rng.int(0, candidates.length - 1)];
  const path: Path = [];
  for (let k = 2; k < n; k++) path.push(cycle[(i + k) % n]);
  path.push(cycle[i]);
  return path;
}

/* ------------------------------------------------------------------------------------------------ skeletons */

export type Skeleton = { rows: number; cols: number; path: Path; label: string };

/** Rotates / flips a skeleton (the 8 symmetries of the square) so that one shape makes eight levels. */
function transform(s: Skeleton, k: number): Skeleton {
  let { rows: R, cols: C } = s;
  let path = s.path.map(([r, c]) => [r, c] as Pt);
  const flip = k >= 4;
  for (let t = 0; t < k % 4; t++) {
    path = path.map(([r, c]) => [c, R - 1 - r] as Pt);
    [R, C] = [C, R];
  }
  if (flip) path = path.map(([r, c]) => [r, C - 1 - c] as Pt);
  return { rows: R, cols: C, path, label: `${s.label}/${k}` };
}

/** The corridor of a theme, before it is placed (random size and variation from `rng`). */
export function skeletonFor(theme: Theme, rng: Rng): Skeleton | null {
  const size = (lo: number, hi: number) => rng.int(lo, hi);
  switch (theme) {
    case 'spiral': {
      const gap = 3;
      const R = size(10, 14);
      const C = size(10, 13);
      const path = chain(spiralCorners(R, C, gap));
      return { rows: R, cols: C, path, label: `spiral ${R}x${C} g${gap}` };
    }
    case 'zigzag': {
      const R = size(11, 14);
      const C = size(9, 13);
      const path = zigzagPath(R, C, rng);
      return path ? { rows: R, cols: C, path, label: `zigzag ${R}x${C}` } : null;
    }
    case 'symmetry': {
      // The left half is a serpentine that ends at the middle; the right half is its mirror image, walked back. A wall runs down
      // the middle, except for the one cell where the two halves meet.
      const R = rng.next() < 0.5 ? 13 : 14;
      const half = size(6, 8);
      const C = half * 2;
      const rowsUsed = [] as number[];
      for (let r = 0; r < R; r += 3) rowsUsed.push(r);
      if (rowsUsed.length % 2 === 0) return null; // the last row must go towards the middle
      const left = serpentine(R, () => [0, half - 2], rng, 1);
      if (!left) return null;
      const end = left[left.length - 1];
      if (end[1] !== half - 2) return null;
      const joined: Path = [...left, [end[0], half - 1]];
      const mirror = joined.map(([r, c]) => [r, C - 1 - c] as Pt).reverse();
      return { rows: R, cols: C, path: [...joined, ...mirror], label: `symmetry ${R}x${C} h${half}` };
    }
    case 'heart': {
      const R = size(13, 16);
      const C = size(13, 16);
      const loop = outlineCycle(heartMask(R, C), R, C);
      const path = loop && openOutline(loop, R, C, rng);
      return path ? { rows: R, cols: C, path, label: `heart ${R}x${C}` } : null;
    }
    case 'star': {
      const variant = rng.int(0, 4);
      const R = size(16, 19);
      const C = size(16, 19);
      const mask =
        variant === 0 ? starMask(R, C, 5, 0.52) : variant === 1 ? starMask(R, C, 6, 0.6) : variant === 2 ? starMask(R, C, 4, 0.45) : variant === 3 ? diamondMask(R, C) : plusMask(R, C);
      const loop = outlineCycle(mask, R, C);
      const path = loop && openOutline(loop, R, C, rng);
      return path ? { rows: R, cols: C, path, label: `star${variant} ${R}x${C}` } : null;
    }
    case 'circuit': {
      // A spiral of rings with chicanes: bumps carved into the long straight runs.
      const R = size(11, 14);
      const C = size(11, 14);
      const path = bump(chain(spiralCorners(R, C, 3)), R, C, rng, rng.int(3, 6));
      return path ? { rows: R, cols: C, path, label: `circuit ${R}x${C}` } : null;
    }
    case 'teleport': {
      const base = rng.next() < 0.5;
      const R = size(11, 14);
      const C = size(10, 13);
      const path = base ? zigzagPath(R, C, rng) : chain(spiralCorners(R, C, 3));
      return path ? { rows: R, cols: C, path, label: `teleport ${base ? 'zigzag' : 'spiral'} ${R}x${C}` } : null;
    }
  }
}

/** Turns some long straight runs of a corridor into a chicane: one cell is skipped and the corridor makes a little detour beside it. */
function bump(path: Path, R: number, C: number, rng: Rng, count: number): Path | null {
  let out = path;
  for (let n = 0; n < count; n++) {
    const runs: number[] = [];
    for (let i = 1; i + 4 < out.length; i++) {
      const [a, e] = [out[i], out[i + 4]];
      const horizontal = a[0] === e[0] && Math.abs(e[1] - a[1]) === 4;
      const vertical = a[1] === e[1] && Math.abs(e[0] - a[0]) === 4;
      if (horizontal || vertical) runs.push(i);
    }
    if (runs.length === 0) break;
    const i = runs[rng.int(0, runs.length - 1)];
    const horizontal = out[i][0] === out[i + 4][0];
    const side = rng.next() < 0.5 ? -1 : 1;
    const off = (p: Pt): Pt => (horizontal ? [p[0] + side, p[1]] : [p[0], p[1] + side]);
    const candidate = [...out.slice(0, i + 2), off(out[i + 1]), off(out[i + 2]), off(out[i + 3]), ...out.slice(i + 3)];
    // Only a bump that keeps the corridor clean and on the board is kept.
    if (isCleanPath(candidate, R, C)) out = candidate;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ the level */

const key = (r: number, c: number) => r * 1000 + c;
const dirOf = (a: Pt, b: Pt): Dir => (b[0] < a[0] ? 'U' : b[0] > a[0] ? 'D' : b[1] < a[1] ? 'L' : 'R');
const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' };

/**
 * Is it a clean corridor: inside the board, no cell twice, and no two cells that are not neighbours along the path touching each
 * other (a corridor that brushes itself is a room, not a corridor).
 */
export function isCleanPath(path: Path, R: number, C: number): boolean {
  const index = new Map<number, number>();
  for (let i = 0; i < path.length; i++) {
    const [r, c] = path[i];
    if (r < 0 || c < 0 || r >= R || c >= C) return false;
    if (index.has(key(r, c))) return false;
    index.set(key(r, c), i);
    if (i > 0 && Math.abs(r - path[i - 1][0]) + Math.abs(c - path[i - 1][1]) !== 1) return false;
  }
  for (let i = 0; i < path.length; i++) {
    for (const d of DIRS) {
      const j = index.get(key(path[i][0] + DELTA[d][0], path[i][1] + DELTA[d][1]));
      if (j !== undefined && Math.abs(j - i) !== 1) return false;
    }
  }
  return true;
}

/** The ends of the corridor: the last cell must be on the edge of the board with the last move heading out through it. */
function exitSide(path: Path, R: number, C: number): Dir | null {
  const n = path.length;
  const [r, c] = path[n - 1];
  const last = dirOf(path[n - 2], path[n - 1]);
  if (last === 'U' && r === 0) return 'U';
  if (last === 'D' && r === R - 1) return 'D';
  if (last === 'L' && c === 0) return 'L';
  if (last === 'R' && c === C - 1) return 'R';
  return null;
}

export type FunParams = {
  theme: Theme;
  seed: number;
  index: number;
  /** The mechanics the challenge is built around (the day of the week decides; see dailyMechanics.ts). */
  stars?: readonly Mechanic[];
};

/** What it takes for a corridor to be a good challenge. */
export const FUN = {
  minSwipes: 14,
  /** The portals are shortcuts: the field of portals may be a little shorter (it must still reach the same difficulty). */
  minSwipesTeleport: 12,
  maxSwipes: 44,
  minCornersUsed: 4,
  /** The campaign's levels 150 to 200 score 137 to 205 (median 175) with the same formula. */
  minDifficulty: 150,
  maxDifficulty: 235,
  maxStates: 400_000,
};

/**
 * Builds one challenge from a theme and a seed, or null when this seed does not give a good one (the caller tries the next).
 * `index` is the number of the challenge (0..365).
 */
/** Why the last attempt was refused (a number: the place in buildFunLevel), for the scripts that tune the generator. */
export let lastFailure = 0;
const fail = (n: number): null => {
  lastFailure = n;
  return null;
};

export function buildFunLevel(p: FunParams): Level | null {
  const rng = createRng(p.seed);
  const base = skeletonFor(p.theme, rng);
  if (!base || base.path.length < 20) return fail(1);
  // One of the eight placements (and the corridor walked either way) that ends on the edge, heading out. A corridor that stops
  // inside the board is led on to the edge (a heart ends in its tip, a star in a point).
  const placements = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  let skeleton: Skeleton | null = null;
  let side: Dir | null = null;
  outer: for (const reversed of rng.shuffle([false, true])) {
    for (const k of placements) {
      const t = transform(reversed ? { ...base, path: [...base.path].reverse() } : base, k);
      if (!exitSide(t.path, t.rows, t.cols)) t.path = extendToEdge(t.path, t.rows, t.cols);
      if (!isCleanPath(t.path, t.rows, t.cols)) continue;
      const s = exitSide(t.path, t.rows, t.cols);
      if (s) {
        skeleton = t;
        side = s;
        break outer;
      }
    }
  }
  if (!skeleton || !side) return fail(2);
  const { path } = skeleton;
  const R = skeleton.rows;
  const C = skeleton.cols;

  // ---- The grid: the corridor, a wall ring around it, and the pieces on it.
  const rows = R + 2;
  const cols = C + 2;
  const wall = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
  for (const [r, c] of path) wall[r + 1][c + 1] = false;
  const features: Features = emptyFeatures();
  const used = new Set(path.map(([r, c]) => key(r, c)));

  // Bends: a corner tile wherever the corridor turns.
  const isCorner = new Set<number>();
  for (let i = 1; i + 1 < path.length; i++) {
    const a = dirOf(path[i], path[i - 1]);
    const b = dirOf(path[i], path[i + 1]);
    if (OPPOSITE[a] !== b) {
      features.corners.push({ r: path[i][0] + 1, c: path[i][1] + 1, a, b });
      isCorner.add(i);
    }
  }
  if (features.corners.length < FUN.minCornersUsed) return fail(3);

  // Side pockets off straight cells, each closed by a stop tile at its mouth: the ball has to stop there to turn into it.
  const stars = p.stars ?? starsForIndex(p.index);
  const wantsTier = stars.includes('tier');
  const pockets = p.theme === 'teleport' ? rng.int(4, 6) : rng.int(4, 7);
  const pocketList: { mouth: Pt; dir: Dir; cells: Pt[] }[] = [];
  const straight = rng.shuffle(path.map((_, i) => i).filter((i) => i > 1 && i < path.length - 2 && !isCorner.has(i)));
  const stops: Pt[] = [];
  const pocketCells: Pt[] = [];
  const occupied = (r: number, c: number) => used.has(key(r, c));
  for (const i of straight) {
    if (stops.length >= pockets) break;
    const here = path[i];
    const along = dirOf(path[i - 1], path[i]);
    const perpendicular: Dir[] = along === 'U' || along === 'D' ? ['L', 'R'] : ['U', 'D'];
    for (const d of rng.shuffle(perpendicular)) {
      // On the days of the platforms the first two pockets are long enough for a ramp and a platform behind it.
      const length = wantsTier && pocketList.length < 2 ? rng.int(3, 4) : rng.int(1, 3);
      const cells: Pt[] = [];
      let ok = true;
      for (let k = 1; k <= length; k++) {
        const r = here[0] + DELTA[d][0] * k;
        const c = here[1] + DELTA[d][1] * k;
        if (r < 0 || c < 0 || r >= R || c >= C || occupied(r, c)) {
          ok = false;
          break;
        }
        // A pocket touches nothing but its own mouth.
        for (const nd of DIRS) {
          const nr = r + DELTA[nd][0];
          const nc = c + DELTA[nd][1];
          const own = (nr === here[0] && nc === here[1]) || cells.some((q) => q[0] === nr && q[1] === nc);
          if (!own && occupied(nr, nc)) ok = false;
        }
        cells.push([r, c]);
      }
      if (!ok || cells.length === 0) continue;
      // The mouth must not touch another pocket's cells either (checked through `used`).
      for (const [r, c] of cells) {
        used.add(key(r, c));
        wall[r + 1][c + 1] = false;
        pocketCells.push([r, c]);
      }
      stops.push([here[0] + 1, here[1] + 1]);
      pocketList.push({ mouth: here, dir: d, cells });
      break;
    }
  }
  features.stops = stops;
  if (stops.length < Math.min(3, pockets)) return fail(4);

  // Platforms: the first cell of a long pocket becomes a ramp up from the corridor, the cells behind it a platform.
  const raisedCells = new Set<number>();
  if (wantsTier) {
    const long = pocketList.filter((q) => q.cells.length >= 3).slice(0, 2);
    if (long.length === 0) return fail(20);
    for (const q of long) {
      const [ramp, ...platform] = q.cells;
      features.ramps.push({ r: ramp[0] + 1, c: ramp[1] + 1, up: q.dir } as Ramp);
      for (const [r, c] of platform) {
        features.raised.push([r + 1, c + 1]);
        raisedCells.add(key(r, c));
      }
    }
  }

  // Tiles to cross twice: a few straight cells of the corridor.
  const free = (i: number) => !isCorner.has(i) && !stops.some(([r, c]) => r === path[i][0] + 1 && c === path[i][1] + 1) && i > 0 && i < path.length - 1;
  const doubleWanted = p.theme === 'teleport' ? 0 : rng.int(1, 3);
  for (const i of rng.shuffle(path.map((_, j) => j).filter(free))) {
    if (features.doubles.length >= doubleWanted) break;
    features.doubles.push([path[i][0] + 1, path[i][1] + 1]);
  }

  // Portals and bombs for the field of the weekend: two portals on parallel straight runs, and a bomb or two.
  if (p.theme === 'teleport') {
    const axisOf = (i: number) => {
      const d = dirOf(path[i - 1], path[i]);
      return d === 'U' || d === 'D';
    };
    const candidates = rng.shuffle(path.map((_, i) => i).filter((i) => i > 2 && i < path.length - 3 && !isCorner.has(i) && !isCorner.has(i - 1) && !isCorner.has(i + 1) && free(i)));
    const taken = new Set<number>();
    // A portal is entered along its corridor and left along the other one: the two must run the same way, and far apart.
    const first = candidates[0];
    const second = candidates.find((i) => i !== first && axisOf(i) === axisOf(first) && Math.abs(i - first) > 8);
    if (first === undefined || second === undefined) return fail(6);
    taken.add(first);
    taken.add(second);
    const a: Pt = [path[first][0] + 1, path[first][1] + 1];
    const b: Pt = [path[second][0] + 1, path[second][1] + 1];
    features.portals.push({ a, b });
    const bombWanted = rng.int(1, 2);
    for (const i of rng.shuffle(path.map((_, j) => j).filter((j) => free(j) && !taken.has(j)))) {
      if (features.bombs.length >= bombWanted) break;
      features.bombs.push([path[i][0] + 1, path[i][1] + 1]);
    }
  }

  // Slides and the collapsing floor, placed on the plan of the finished corridor (the same placers as the campaign used).
  const wantsSlide = stars.includes('slide');
  const slideCandidates: Slide[] = [];
  const wantsCollapse = stars.includes('collapse');
  if (wantsSlide || wantsCollapse) {
    const floor = new Uint8Array(R * C);
    for (const k of used) floor[Math.floor(k / 1000) * C + (k % 1000)] = 1;
    const plan: Plan = { rows: R, cols: C, floor, start: path[0], exitTile: path[path.length - 1], entrySide: 'D', exitSide: side };
    const idx = (r: number, c: number) => r * C + c;
    const taken = new Set<number>();
    for (const [r, c] of stops) taken.add(idx(r - 1, c - 1));
    for (const q of features.corners) taken.add(idx(q.r - 1, q.c - 1));
    for (const [r, c] of features.doubles) taken.add(idx(r - 1, c - 1));
    for (const [r, c] of features.bombs) taken.add(idx(r - 1, c - 1));
    for (const q of features.portals) for (const [r, c] of [q.a, q.b]) taken.add(idx(r - 1, c - 1));
    for (const k of features.ramps) taken.add(idx(k.r - 1, k.c - 1));
    const raised = new Set<number>([...raisedCells].map((k) => idx(Math.floor(k / 1000), k % 1000)));
    for (const i of raised) taken.add(i);
    const over = new Set<number>();
    if (wantsSlide) {
      // The chutes that save the most walking come first; the solver decides below which one is really worth taking.
      const all = findSlides(plan, { raised, taken, over, shapes: ['line', 'L', 'S', 'spiral'], minShortcut: 3 });
      const seenEntry = new Set<number>();
      for (const { slide } of all) {
        if (slideCandidates.length >= MAX_SLIDE_TRIES) break;
        const e = idx(slide.entry[0], slide.entry[1]);
        if (seenEntry.has(e)) continue;
        seenEntry.add(e);
        slideCandidates.push({
          ...slide,
          entry: [slide.entry[0] + 1, slide.entry[1] + 1],
          exit: [slide.exit[0] + 1, slide.exit[1] + 1],
          path: slide.path.map(([r, c]) => [r + 1, c + 1] as [number, number]),
        });
      }
      if (slideCandidates.length === 0) return fail(21);
    }
    if (wantsCollapse) {
      const picks = placeCollapse(plan, taken, rng, rng.int(2, 3));
      if (!picks) return fail(22);
      for (const i of picks) {
        features.collapse.push([Math.floor(i / C) + 1, (i % C) + 1]);
        taken.add(i);
      }
    }
  }

  // Coins (optional) on plain cells of the corridor.
  const plain = path.map((_, i) => i).filter((i) => free(i) && !features.collapse.some(([r, c]) => r === path[i][0] + 1 && c === path[i][1] + 1) && !features.doubles.some(([r, c]) => r === path[i][0] + 1 && c === path[i][1] + 1) && !features.bombs.some(([r, c]) => r === path[i][0] + 1 && c === path[i][1] + 1) && !features.portals.some((q) => [q.a, q.b].some(([r, c]) => r === path[i][0] + 1 && c === path[i][1] + 1)));
  for (const i of rng.shuffle(plain).slice(0, rng.int(1, 2))) features.coins.push([path[i][0] + 1, path[i][1] + 1]);

  const finish = (): Level | null => {
    const grid = wall.map((row) => row.map((w) => (w ? '#' : '.')).join(''));
    const end = path[path.length - 1];
    const exit = { r: end[0] + 1 + DELTA[side][0], c: end[1] + 1 + DELTA[side][1], dir: side };
    const start: [number, number] = [path[0][0] + 1, path[0][1] + 1];
    const { floorCount, layers } = measure(grid, features);
    const mechanics: Mechanic[] = mechanicsOf(features);
    const uncropped: Level = {
      id: 100000 + p.index + 1,
      seed: p.seed,
      rows,
      cols,
      grid,
      start,
      exit,
      color: LEVEL_COLORS[(p.index * 5 + p.seed) % LEVEL_COLORS.length],
      solution: '',
      difficulty: 0,
      floorCount,
      layers,
      deadEnds: 0,
      branches: 0,
      features,
      mechanics,
      star: stars[0],
    };
    // The empty wall around the figure is cut away (the exit stays on the border).
    const level = cropLevel(uncropped);
    level.deadEnds = countDeadEnds(level.grid);
    level.branches = countBranches(level.grid);

    // ---- Is it a good one?
    const res = solve(level, { maxStates: FUN.maxStates, maxMoves: FUN.maxSwipes });
    if (!res || res.moves.length < (p.theme === 'teleport' ? FUN.minSwipesTeleport : FUN.minSwipes)) return fail(8);
    level.solution = res.moves;
    level.difficulty = difficultyScore({ optimalMoves: res.moves.length, deadEnds: level.deadEnds, floorCount: level.layers, states: res.states });
    if (level.difficulty < FUN.minDifficulty || level.difficulty > FUN.maxDifficulty) return fail(9);
    if (!verifyLevel(level)) return fail(10);
    const usage = analyzeSolution(level, level.solution);
    if (usage.corner < FUN.minCornersUsed) return fail(11);
    if (p.theme === 'teleport' && usage.portal === 0) return fail(12);
    // The mechanics of the day must really be used by the best solution (a slide nobody takes is no star).
    for (const m of stars) if ((m === 'slide' || m === 'tier' || m === 'collapse') && usage[m] === 0) return fail(13);
    if (kindsOf(level) > MAX_KINDS || level.features.slides.length > MAX_SLIDES) return fail(14);
    // What the new pieces ask of the scene: no endless slide, a chute that stays over the board, every tile in view, the budget.
    if (hasInfiniteLoop(level)) return fail(15);
    if (slidesProblem(level)) return fail(16);
    if (hiddenFloorCells(level).length > 0) return fail(17);
    if (!withinBudget(level)) return fail(18);

    return level;
  };
  if (slideCandidates.length > 0) {
    // The slide of the day must be one the best solution really takes: the candidates are tried one after the other.
    for (const slide of slideCandidates) {
      features.slides = [slide];
      const done = finish();
      if (done) return done;
    }
    return fail(13);
  }
  return finish();
}

/* ------------------------------------------------------------------------------------------------ uniqueness */

/** The grid under each of the 8 symmetries, as strings: the smallest is the shape's name, the same whatever its orientation. */
export function canonicalShape(level: Level): string {
  let cur = level.grid.map((row) => row.split(''));
  const variants: string[] = [];
  for (let flipped = 0; flipped < 2; flipped++) {
    for (let k = 0; k < 4; k++) {
      variants.push(cur.map((row) => row.join('')).join('/'));
      cur = rotate(cur);
    }
    cur = cur.map((row) => [...row].reverse());
  }
  return variants.sort()[0];
}

function rotate(g: string[][]): string[][] {
  const R = g.length;
  const C = g[0].length;
  const out = Array.from({ length: C }, () => Array<string>(R).fill('#'));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out[c][R - 1 - r] = g[r][c];
  return out;
}

/** How much of the floor two same-sized levels share (0..1). */
export function overlap(a: Level, b: Level): number {
  if (a.rows !== b.rows || a.cols !== b.cols) return 0;
  let same = 0;
  let total = 0;
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      const fa = a.grid[r][c] === '.';
      const fb = b.grid[r][c] === '.';
      if (fa || fb) total++;
      if (fa && fb) same++;
    }
  }
  return total === 0 ? 0 : same / total;
}
