import type { Cell, Level, Slide } from '../game/types';
import { BALL_R, PLATEAU_H, WALL_H, cellWorld } from './coords';
import { wallTop } from './heights';

/**
 * The centre line of a slide (toboggan) in world coordinates, from the middle of the entry tile to the middle of the exit tile. It is
 * the one description used by the drawing of the chute, by the ball while it rides it, by the visibility check and by the containment
 * check of the generator, so they can never disagree. The points are the centre of the BALL: the floor of the trough is BALL_R lower.
 *
 * The plan view is a smooth curve through the tiles of the track; the height follows a profile along it. The floor of the trough
 * leaves the entry tile flush with the floor, climbs steeply over the first tile of the track (that wall cell is cut away under the
 * climb, see `slideCarvedCells`), runs SLIDE_CLEARANCE above the wall tops, and comes down over the last tile onto the exit tile.
 */
export type V3 = [number, number, number];

/** How far the floor of the trough runs above the top of the walls it crosses. */
export const SLIDE_CLEARANCE = 0.3;
/** Height of the centre of the ball over the wall tops, on the part that runs over the walls. */
export const SLIDE_RAIL_ABOVE = SLIDE_CLEARANCE + BALL_R;
/** Dimensions of the trough, measured from the middle: half of the flat floor, half of the outside, height of the rims. */
export const SLIDE_HALF_FLOOR = 0.4;
/** The whole trough is exactly one tile wide: it never overhangs the tiles beside its track. */
export const SLIDE_HALF_OUT = 0.5;
export const SLIDE_RIM_H = 0.46;
/** The arches rise from the middle of the top of the rims in a half circle of this radius: their top is SLIDE_RIM_H + this over the floor. */
export const SLIDE_ARCH_R = 0.45;
/** Top of the arches above the centre of the ball. */
export const SLIDE_ARCH_TOP = SLIDE_RIM_H + SLIDE_ARCH_R - BALL_R;
/** Radius of the volume the trough takes in the visibility check (it is open: the arches only draw its outline). */
export const SLIDE_R = 0.5;
/** A chute must keep at least this much clearance over the walls it crosses (the climb and the descent excepted). */
export const SLIDE_MIN_CLEARANCE = 0.12;

export const isRaised = (level: Level, r: number, c: number) => (level.features.raised ?? []).some(([rr, cc]) => rr === r && cc === c);

/** Height of the floor under a tile (0 low, PLATEAU_H on a platform). */
export const floorHeight = (level: Level, r: number, c: number) => (isRaised(level, r, c) ? PLATEAU_H : 0);

/** The wall cells that are cut away under the climb and under the descent of a chute (drawn as pits, the chute passes above). */
export function slideCarvedCells(level: Level): Cell[] {
  const out: Cell[] = [];
  for (const s of level.features.slides ?? []) {
    if (s.path.length >= 3) {
      out.push([s.path[0][0], s.path[0][1]], [s.path[s.path.length - 1][0], s.path[s.path.length - 1][1]]);
    }
  }
  return out;
}

const catmull2 = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] => {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
};

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * The centre line as a smooth list of points (a few per tile): `perSegment` between two tiles of the track. Also gives, for each
 * point, the height of the floor of the trough and its distance along the plan curve.
 */
export type Line = { points: V3[]; floor: number[]; along: number[]; length: number; entryPlane: number; exitPlane: number };

const lineCache = new WeakMap<Slide, Map<number, Line>>();

export function slideLine(level: Level, s: Slide, perSegment = 6): Line {
  let byRes = lineCache.get(s);
  if (!byRes) lineCache.set(s, (byRes = new Map()));
  const hit = byRes.get(perSegment);
  if (hit) return hit;

  const cells: Cell[] = [s.entry, ...s.path.map((p) => [p[0], p[1]] as Cell), s.exit];
  const ctl = cells.map((cell) => cellWorld(level, cell) as [number, number]);
  const plan: [number, number][] = [];
  for (let i = 0; i < ctl.length - 1; i++) {
    const p0 = ctl[Math.max(0, i - 1)];
    const p1 = ctl[i];
    const p2 = ctl[i + 1];
    const p3 = ctl[Math.min(ctl.length - 1, i + 2)];
    for (let k = 0; k < perSegment; k++) plan.push(catmull2(p0, p1, p2, p3, k / perSegment));
  }
  plan.push(ctl[ctl.length - 1]);

  const along: number[] = [0];
  for (let i = 1; i < plan.length; i++) along.push(along[i - 1] + Math.hypot(plan[i][0] - plan[i - 1][0], plan[i][1] - plan[i - 1][1]));
  const length = along[along.length - 1];

  const h0 = floorHeight(level, s.entry[0], s.entry[1]);
  const h1 = floorHeight(level, s.exit[0], s.exit[1]);
  const n = s.path.length;
  const rail = (k: number) => wallTop(level, s.path[k][0], s.path[k][1]) + SLIDE_CLEARANCE;
  // Distance along the curve at each tile of the track (the sample of the plan nearest to its middle).
  const centre: number[] = s.path.map((cell) => {
    const [x, z] = cellWorld(level, [cell[0], cell[1]]);
    let best = 0;
    let bd = Infinity;
    plan.forEach((p, i) => {
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return along[best];
  });
  const entryPlane = 0.5;
  const exitPlane = length - 0.5;

  const floorAt = (d: number): number => {
    if (d <= entryPlane) return h0;
    if (d >= exitPlane) return h1;
    const rise = 1.0;
    const climbTo = n > 2 ? rail(1) : rail(0);
    const dropFrom = n > 2 ? rail(n - 2) : rail(n - 1);
    if (d < entryPlane + rise) return h0 + (climbTo - h0) * smooth((d - entryPlane) / rise);
    if (d > exitPlane - rise) return h1 + (dropFrom - h1) * smooth((exitPlane - d) / rise);
    // Over the walls: the rail of the tile under the point. Where the next tile is taller, the floor has risen to its rail by the
    // boundary (it never dips into the taller wall); where it is lower, the floor stays up until the boundary and comes down after it.
    const w = 0.5;
    let value = rail(1);
    for (let k = 1; k < n - 2; k++) {
      const m = (centre[k] + centre[k + 1]) / 2;
      const from = rail(k);
      const to = rail(k + 1);
      const [s0, s1] = to > from ? [m - w, m] : [m, m + w];
      if (d <= s0) {
        value = from;
        break;
      }
      value = d >= s1 ? to : from + (to - from) * smooth((d - s0) / (s1 - s0));
      if (d < s1) break;
    }
    return value;
  };

  const floor = plan.map((_, i) => floorAt(along[i]));
  const points: V3[] = plan.map((p, i) => [p[0], floor[i] + BALL_R, p[1]]);
  const line: Line = { points, floor, along, length, entryPlane, exitPlane };
  byRes.set(perSegment, line);
  return line;
}

/** The centre of the ball along the chute, a few points per tile. */
export function slideCenterline(level: Level, s: Slide, perSegment = 6): V3[] {
  return slideLine(level, s, perSegment).points;
}

/** Length of the centre line (world units). */
export function slideLength(points: V3[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  return len;
}

/** The shape of a chute independent of where it is on the board: used to share one geometry between all chutes of that form. */
export const slideShapeKey = (s: Slide): string => {
  const rel = (cell: readonly [number, number]) => `${cell[0] - s.entry[0]},${cell[1] - s.entry[1]}`;
  return `${s.mouth}|${s.exitDir}|${s.path.map(rel).join(';')}|${rel(s.exit)}`;
};

/**
 * The heights a chute depends on, as a key: two chutes of the same shape are the same mesh only if the wall tops under them agree
 * (a wall that touches a platform is taller) and their ends are at the same heights.
 */
export const slideHeightKey = (level: Level, s: Slide): string =>
  `${floorHeight(level, s.entry[0], s.entry[1]) > 0 ? 1 : 0}${floorHeight(level, s.exit[0], s.exit[1]) > 0 ? 1 : 0}|${s.path.map((c) => (wallTop(level, c[0], c[1]) > 0.9 ? 1 : 0)).join('')}`;

/**
 * Does the chute stay over the board? Every point of its centre line is over a tile of its track (or its entry or exit), the sides of
 * the trough only overhang tiles that are really built (never the edge of the board, never the grass or a carved-out void), and it
 * keeps its clearance over the walls it crosses. A chute that fails is rejected by the generator.
 */
export function slideProblem(level: Level, s: Slide): string | null {
  // A chute is always up in the air: a track of at least three tiles, so there is a part that runs over the walls.
  if (s.path.length < 3) return 'the track is too short to rise above the walls';
  const own = new Set<number>([s.entry, s.exit, ...s.path.map((p) => [p[0], p[1]] as Cell)].map((c) => c[0] * level.cols + c[1]));
  for (const [r, c] of s.path) {
    // The outer ring of the board is its edge: the sides of the trough would hang over the grass.
    if (r < 1 || c < 1 || r > level.rows - 2 || c > level.cols - 2) return 'a tile of the track is on the edge of the board';
    if (level.grid[r][c] !== '#') return 'a tile of the track is not a wall';
  }
  const line = slideLine(level, s, 8);
  const cellOf = (x: number, z: number): [number, number] => [Math.floor(z + level.rows / 2), Math.floor(x + level.cols / 2)];
  for (let i = 0; i < line.points.length; i++) {
    const [x, , z] = line.points[i];
    const [r, c] = cellOf(x, z);
    if (!own.has(r * level.cols + c)) return 'the curve leaves the tiles of its track';
    // The sides of the trough (perpendicular to the plan direction).
    const a = line.points[Math.max(0, i - 1)];
    const b = line.points[Math.min(line.points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    for (const sign of [-1, 1]) {
      const sx = x + (-dz / len) * SLIDE_HALF_OUT * sign;
      const sz = z + (dx / len) * SLIDE_HALF_OUT * sign;
      const [rr, cc] = cellOf(sx, sz);
      if (rr < 0 || cc < 0 || rr >= level.rows || cc >= level.cols) return 'the side of the trough hangs over the edge';
      // Over the next tile the rim only overhangs by a hair (0.11): that is accepted, even over a tile that is not built.
    }
  }
  // Clearance over the walls under the trough (the ends, over the cut-away tiles and the entry and exit tiles, are exempt).
  const carved = new Set<number>([s.path[0], s.path[s.path.length - 1]].map((c) => c[0] * level.cols + c[1]));
  for (let i = 0; i < line.points.length; i++) {
    const [x, , z] = line.points[i];
    const [r, c] = cellOf(x, z);
    const key = r * level.cols + c;
    if (key === s.entry[0] * level.cols + s.entry[1] || key === s.exit[0] * level.cols + s.exit[1] || carved.has(key)) continue;
    if (level.grid[r]?.[c] !== '#') continue;
    if (line.floor[i] - wallTop(level, r, c) < SLIDE_MIN_CLEARANCE - 1e-6) return 'the trough sinks into a wall';
  }
  // The part in the middle is always at least 1.2 times the height of the walls: never near the ground.
  const n = s.path.length;
  for (let i = 0; i < line.points.length; i++) {
    const d = line.along[i];
    if (d > line.entryPlane + 1.3 && d < line.exitPlane - 1.3 && line.floor[i] < 1.2 * WALL_H - 1e-6) return 'the middle of the chute is too low';
  }
  // The volume of the trough against the walls: the underside of the floor and of the rims, on its axis and on both edges, clears the
  // wall under it (the cut-away tiles at the ends excepted: nothing is built there).
  for (let i = 0; i < line.points.length; i++) {
    const [x, , z] = line.points[i];
    const a = line.points[Math.max(0, i - 1)];
    const b = line.points[Math.min(line.points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    // In a bend the outer rim swings out over the corner of the tile beside the track by a few centimetres: only where the track
    // runs straight must the sides stay over the walls.
    const before = line.points[Math.max(0, i - 2)];
    const after = line.points[Math.min(line.points.length - 1, i + 2)];
    const h0 = Math.atan2(b[0] - before[0], b[2] - before[2]);
    const h1 = Math.atan2(after[0] - a[0], after[2] - a[2]);
    let turn = Math.abs(h1 - h0);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const straight = turn < 0.25;
    for (const lateral of straight ? [-SLIDE_HALF_OUT + 0.02, 0, SLIDE_HALF_OUT - 0.02] : [0]) {
      const px = x + (-dz / len) * lateral;
      const pz = z + (dx / len) * lateral;
      const [rr, cc] = cellOf(px, pz);
      const key = rr * level.cols + cc;
      if (carved.has(key) || key === s.entry[0] * level.cols + s.entry[1] || key === s.exit[0] * level.cols + s.exit[1]) continue;
      if (level.grid[rr]?.[cc] !== '#') return 'the trough runs over a floor tile';
      if (line.floor[i] - 0.07 < wallTop(level, rr, cc) + 0.02) return 'the trough goes through a wall';
    }
  }
  void n;
  return null;
}

/** The first problem of the chutes of a level, or null. */
export function slidesProblem(level: Level): string | null {
  for (const s of level.features.slides ?? []) {
    const p = slideProblem(level, s);
    if (p) return p;
  }
  return null;
}
