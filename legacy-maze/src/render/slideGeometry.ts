import * as THREE from 'three';

import type { Level, Slide } from '../game/types';
import { DELTA } from '../game/types';
import { BALL_R, BASE_Y, cellWorld } from './coords';
import { woodTintFn, type WoodStyle } from './geometry';
import { wallTop } from './heights';
import {
  SLIDE_ARCH_R,
  SLIDE_HALF_FLOOR,
  SLIDE_HALF_OUT,
  SLIDE_RIM_H,
  floorHeight,
  slideHeightKey,
  slideLine,
  slideShapeKey,
  type V3,
} from './slidePath';

/**
 * The parts of a covered wooden chute ("toboggan à arceaux"), one set per FORM of chute (the shape of the track relative to its
 * entry, the heights under it, the colours), built once while the level is prepared and shared: building is never done during the
 * game. Every vertex is relative to the middle of the entry tile; the meshes are put there.
 *
 *  - `wood`: the rims of the U-shaped trough (a third of the thickness of a wall, half its height), the arches every half tile (one in
 *    three in the colour of the paint), the trestles, the tall gantry over the entry (a band in the paint colour on its front) and the
 *    small gantry of the exit. All in the wood of the walls (the same material and the same colours), vertex colours only.
 *  - `floor`: the flat bottom of the trough, with `uv.x` in tiles along the chute (the lines between tiles) and `along` from 0 to 1.
 *  - `newOverlay()`: the same floor a hair higher, in quads in the order of the ride: the paint of the ball shows by drawing more of it.
 *  - `flap`: the wooden flap that shuts the exit, hinged at its top, in its own space (hinge at the origin, outside is +z).
 *  - chevron placements (matrices) for the entry tile and the trough.
 */
export type ChuteParts = {
  wood: THREE.BufferGeometry;
  floor: THREE.BufferGeometry;
  /** Builds a fresh geometry of the same floor for the paint (one per mounted chute: its draw range is what shows the paint). */
  newOverlay: () => THREE.BufferGeometry;
  /** Number of quads of the floor/overlay (6 indices each). */
  floorQuads: number;
  flap: THREE.BufferGeometry;
  /** Where the hinge of the flap is, relative to the entry tile, and the yaw that turns its +z to the way out. */
  hinge: V3;
  yaw: number;
  /** Chevron placements: on the entry tile (pulsing) and in the trough. */
  entryChevrons: THREE.Matrix4[];
  troughChevrons: THREE.Matrix4[];
  /** Triangles of all the parts (for the budget). */
  triangles: number;
};

const cache = new Map<string, ChuteParts>();

/** Resampling step along the trough (world units). */
const STEP = 0.125;
/** The rounding of the edges of the rims. */
const CHAMFER = 0.025;
/** Arches every half tile, none in the first and the last stretch (the gantries stand there). */
const ARCH_EVERY = 0.5;
/** The arches start this far from each end of the trough: after the climb and before the descent (each takes one tile). */
const ARCH_MARGIN = 1.15;
/** No arch where the track turns with a radius under this (world units), or climbs more steeply than this slope. */
const MIN_ARCH_RADIUS = 0.75;
const MAX_ARCH_SLOPE = 0.45;
const ARCH_SEGMENTS = 8;
const ARCH_HALF = 0.04;
const TRESTLE_BEAM = 0.045;
/** The flap and the small gantry of the exit stand this far before the end of the trough. */
export const FLAP_BACK = 0.28;

/** The profile of the trough in (side, up) from the floor in the middle: the inside of the left rim up, over it, under, and back. */
const PROFILE: [number, number][] = [
  [-SLIDE_HALF_FLOOR, 0],
  [-SLIDE_HALF_FLOOR, SLIDE_RIM_H - CHAMFER],
  [-SLIDE_HALF_FLOOR - CHAMFER, SLIDE_RIM_H],
  [-SLIDE_HALF_OUT + CHAMFER, SLIDE_RIM_H],
  [-SLIDE_HALF_OUT, SLIDE_RIM_H - CHAMFER],
  [-SLIDE_HALF_OUT, -0.07],
  [SLIDE_HALF_OUT, -0.07],
  [SLIDE_HALF_OUT, SLIDE_RIM_H - CHAMFER],
  [SLIDE_HALF_OUT - CHAMFER, SLIDE_RIM_H],
  [SLIDE_HALF_FLOOR + CHAMFER, SLIDE_RIM_H],
  [SLIDE_HALF_FLOOR, SLIDE_RIM_H - CHAMFER],
  [SLIDE_HALF_FLOOR, 0],
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Builds a mesh from quads with a normal and a colour per vertex; the winding is made to agree with the normals. */
class Mesh {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  uvs: number[] = [];
  extra: number[] = [];
  tris = 0;

  quad(p: V3[], n: V3[], c: THREE.Color[] | THREE.Color, uv?: [number, number][], extra?: number[]) {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      this.positions.push(p[i][0], p[i][1], p[i][2]);
      this.normals.push(n[i][0], n[i][1], n[i][2]);
      const col = Array.isArray(c) ? c[i] : c;
      this.colors.push(col.r, col.g, col.b);
      if (uv) this.uvs.push(uv[i][0], uv[i][1]);
      if (extra) this.extra.push(extra[i]);
    }
    const g = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const want: V3 = [n[0][0] + n[2][0], n[0][1] + n[2][1], n[0][2] + n[2][2]];
    if (dot(g, want) >= 0) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    this.tris += 2;
  }

  /** A box between two points with a square section (a beam). */
  beam(a: V3, b: V3, w: number, color: THREE.Color) {
    const d = norm(sub(b, a));
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(d, ref));
    const v = norm(cross(d, u));
    const c = (p: V3, su: number, sv: number): V3 => add(p, add(mul(u, su * w), mul(v, sv * w)));
    const nu = mul(u, -1);
    const nv = mul(v, -1);
    const nd = mul(d, -1);
    const side = (q: V3[], n: V3) => this.quad(q, [n, n, n, n], color);
    side([c(a, -1, -1), c(b, -1, -1), c(b, 1, -1), c(a, 1, -1)], nv);
    side([c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), c(a, 1, 1)], u);
    side([c(a, 1, 1), c(b, 1, 1), c(b, -1, 1), c(a, -1, 1)], v);
    side([c(a, -1, 1), c(b, -1, 1), c(b, -1, -1), c(a, -1, -1)], nu);
    side([c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)], nd);
    side([c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)], d);
  }

  geometry(withUv = false, extraName?: string): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (extraName) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 1));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

type Frame = { p: V3; t: V3; side: V3; up: V3; d: number };

/** The frames of the trough, every STEP along the plan curve from the entry plane to the exit plane (positions are the FLOOR). */
function frames(level: Level, s: Slide): { list: Frame[]; at: (d: number) => Frame; start: number; end: number } {
  const line = slideLine(level, s, 8);
  const pos = (d: number): V3 => {
    const a = line.along;
    let lo = 0;
    let hi = a.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = a[hi] === a[lo] ? 0 : (d - a[lo]) / (a[hi] - a[lo]);
    const p0 = line.points[lo];
    const p1 = line.points[hi];
    const f = lerp3([p0[0], line.floor[lo], p0[2]], [p1[0], line.floor[hi], p1[2]], Math.min(1, Math.max(0, t)));
    return f;
  };
  const start = line.entryPlane;
  const end = line.exitPlane;
  const frameAt = (d: number): Frame => {
    const e = 0.04;
    const a = pos(Math.max(0, d - e));
    const b = pos(Math.min(line.length, d + e));
    const t = norm(sub(b, a));
    const side = norm(cross([0, 1, 0], t));
    const up = norm(cross(t, side));
    return { p: pos(d), t, side, up, d };
  };
  const list: Frame[] = [];
  const n = Math.max(2, Math.round((end - start) / STEP));
  for (let i = 0; i <= n; i++) list.push(frameAt(start + ((end - start) * i) / n));
  return { list, at: frameAt, start, end };
}

const at3 = (f: Frame, side: number, up: number, along = 0): V3 => add(f.p, add(add(mul(f.side, side), mul(f.up, up)), mul(f.t, along)));
const dir3 = (f: Frame, side: number, up: number): V3 => norm(add(mul(f.side, side), mul(f.up, up)));

export function buildChuteParts(level: Level, s: Slide, wood: WoodStyle): ChuteParts {
  const key = `${slideShapeKey(s)}|${slideHeightKey(level, s)}|${level.color}|${wood.tone}|${wood.sat}|${level.rows}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const [ox, oz] = cellWorld(level, s.entry);
  const tint = woodTintFn(level.rows, wood);
  const wc = (x: number, z: number, y: number) => tint(x, z, y).clone();
  const paint = new THREE.Color(level.color);
  const fr = frames(level, s);
  const list = fr.list;
  const rel = (p: V3): V3 => [p[0] - ox, p[1], p[2] - oz];

  const woodMesh = new Mesh();
  // ---- The trough: the rims, the top of them, the underside.
  for (let i = 0; i + 1 < list.length; i++) {
    const fa = list[i];
    const fb = list[i + 1];
    for (let j = 0; j + 1 < PROFILE.length; j++) {
      const [s0, u0] = PROFILE[j];
      const [s1, u1] = PROFILE[j + 1];
      // 2D normal of the segment, pointing out of the wood: (dy, -dx).
      const n2: [number, number] = [u1 - u0, -(s1 - s0)];
      const l2 = Math.hypot(n2[0], n2[1]) || 1;
      const nA = dir3(fa, n2[0] / l2, n2[1] / l2);
      const nB = dir3(fb, n2[0] / l2, n2[1] / l2);
      const pa0 = at3(fa, s0, u0);
      const pa1 = at3(fa, s1, u1);
      const pb0 = at3(fb, s0, u0);
      const pb1 = at3(fb, s1, u1);
      woodMesh.quad(
        [rel(pa0), rel(pa1), rel(pb1), rel(pb0)],
        [nA, nA, nB, nB],
        [wc(pa0[0], pa0[2], pa0[1]), wc(pa1[0], pa1[2], pa1[1]), wc(pb1[0], pb1[2], pb1[1]), wc(pb0[0], pb0[2], pb0[1])],
      );
    }
  }

  // ---- The arches: perpendicular to the track, every half tile exactly, over the flat middle of the chute (the climb and the descent
  // have none), each a whole half circle standing on the top of the two rims. One in three in the colour of the paint. A place where
  // the track turns too sharply, or where it is steep, gets none.
  const headingAt = (d: number): number => {
    const f = fr.at(d);
    return Math.atan2(f.t[0], f.t[2]);
  };
  const archFrom = fr.start + ARCH_MARGIN;
  const archTo = fr.end - ARCH_MARGIN;
  const archCount = Math.max(0, Math.floor((archTo - archFrom) / ARCH_EVERY) + 1);
  const archStart = archFrom + (archTo - archFrom - (archCount - 1) * ARCH_EVERY) / 2;
  for (let q = 0; q < archCount; q++) {
    const d = archStart + q * ARCH_EVERY;
    const f = fr.at(d);
    // The bend: how much the heading changes over 0.6 along the track.
    let turn = headingAt(d + 0.3) - headingAt(d - 0.3);
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) > 0.6 / MIN_ARCH_RADIUS) continue;
    if (Math.abs(f.t[1]) > MAX_ARCH_SLOPE) continue;
    const colour = q % 3 === 1 ? paint : null;
    const ring = (a: number): { c: V3; r: V3 } => {
      const rx = Math.cos(a);
      const ry = Math.sin(a);
      return { c: at3(f, rx * SLIDE_ARCH_R, SLIDE_RIM_H + ry * SLIDE_ARCH_R), r: dir3(f, rx, ry) };
    };
    for (let k = 0; k < ARCH_SEGMENTS; k++) {
      const A = ring((Math.PI * k) / ARCH_SEGMENTS);
      const B = ring((Math.PI * (k + 1)) / ARCH_SEGMENTS);
      const corners = (R: { c: V3; r: V3 }, hr: number, ht: number) => add(R.c, add(mul(R.r, hr), mul(f.t, ht)));
      const col = colour ?? wc(A.c[0], A.c[2], A.c[1]);
      const faces: [number, number, number, number, V3, V3][] = [
        [-1, -1, 1, -1, mul(f.t, -1), mul(f.t, -1)],
        [1, -1, 1, 1, A.r, B.r],
        [1, 1, -1, 1, f.t, f.t],
        [-1, 1, -1, -1, mul(A.r, -1), mul(B.r, -1)],
      ];
      for (const [hr0, ht0, hr1, ht1, nA, nB] of faces) {
        woodMesh.quad(
          [corners(A, hr0 * ARCH_HALF, ht0 * ARCH_HALF), corners(A, hr1 * ARCH_HALF, ht1 * ARCH_HALF), corners(B, hr1 * ARCH_HALF, ht1 * ARCH_HALF), corners(B, hr0 * ARCH_HALF, ht0 * ARCH_HALF)].map(rel),
          [nA, nA, nB, nB],
          col,
        );
      }
    }
  }

  // ---- Trestles: two vertical legs and a cross, from the top of a wall to the underside of the trough, touching both.
  const trestle = (f: Frame, baseY: number) => {
    const topY = f.p[1] - 0.07;
    if (topY - baseY < 0.08) return;
    const col = wc(f.p[0], f.p[2], (topY + baseY) / 2);
    const base = (sd: number): V3 => [f.p[0] + f.side[0] * sd, baseY, f.p[2] + f.side[2] * sd];
    const top = (sd: number): V3 => [f.p[0] + f.side[0] * sd, topY, f.p[2] + f.side[2] * sd];
    for (const sd of [-0.42, 0.42]) woodMesh.beam(rel(base(sd)), rel(top(sd)), TRESTLE_BEAM, col);
    woodMesh.beam(rel(base(-0.42)), rel(top(0.42)), TRESTLE_BEAM * 0.7, col);
    woodMesh.beam(rel(base(0.42)), rel(top(-0.42)), TRESTLE_BEAM * 0.7, col);
    woodMesh.beam(rel(top(-0.46)), rel(top(0.46)), TRESTLE_BEAM * 0.8, col);
  };
  const n = s.path.length;
  const centreFrame = (cell: readonly [number, number]) => {
    const [x, z] = cellWorld(level, [cell[0], cell[1]]);
    let best = list[0];
    for (const f of list) if (Math.hypot(f.p[0] - x, f.p[2] - z) < Math.hypot(best.p[0] - x, best.p[2] - z)) best = f;
    return best;
  };
  if (n >= 3) {
    // 1 to 3 over the walls of the middle, evenly spaced.
    const m = Math.max(1, Math.min(3, Math.round((n - 2) / 2)));
    for (let i = 0; i < m; i++) {
      const k = 1 + Math.floor(((i + 0.5) * (n - 2)) / m);
      const cell = s.path[k];
      trestle(centreFrame(cell), wallTop(level, cell[0], cell[1]));
    }
    // The climb and the descent run over a cut-away tile: a flank of wood closes each side of them from the underside down to the
    // bottom of the board, so nothing is seen underneath and the foot of the ramp is solid.
    const carved = new Set([s.path[0], s.path[n - 1]].map((c) => c[0] * level.cols + c[1]));
    const inCarved = (f: Frame) => carved.has(Math.floor(f.p[2] + level.rows / 2) * level.cols + Math.floor(f.p[0] + level.cols / 2));
    for (let i = 0; i + 1 < list.length; i++) {
      const fa = list[i];
      const fb = list[i + 1];
      if (!inCarved(fa) || !inCarved(fb)) continue;
      for (const sg of [-1, 1]) {
        const lat = sg * (SLIDE_HALF_OUT - 0.004);
        const ta = at3(fa, lat, -0.07);
        const tb = at3(fb, lat, -0.07);
        const ba: V3 = [ta[0], BASE_Y, ta[2]];
        const bb: V3 = [tb[0], BASE_Y, tb[2]];
        const nrm = mul(fa.side, sg);
        woodMesh.quad([rel(ba), rel(bb), rel(tb), rel(ta)], [nrm, nrm, nrm, nrm], [wc(ba[0], ba[2], BASE_Y), wc(bb[0], bb[2], BASE_Y), wc(tb[0], tb[2], tb[1]), wc(ta[0], ta[2], ta[1])]);
      }
    }
  }

  // ---- The gantries.
  const entryC = cellWorld(level, s.entry);
  const [mdr, mdc] = DELTA[s.mouth];
  const h0 = floorHeight(level, s.entry[0], s.entry[1]);
  // Lateral axis of a gantry: perpendicular to the way through it (world x/z).
  const gantry = (planeX: number, planeZ: number, dirX: number, dirZ: number, floorY: number, big: boolean) => {
    const latX = -dirZ;
    const latZ = dirX;
    const along = (a: number, lat: number, y: number): V3 => [planeX + dirX * a + latX * lat, y, planeZ + dirZ * a + latZ * lat];
    const post = big ? 0.45 : 0.46;
    const hPost = big ? 0.8 : 0.95;
    const colour = (x: number, z: number, y: number) => wc(x, z, y);
    // Posts.
    for (const sg of [-1, 1]) {
      const a = along(0, sg * post, floorY);
      const b = along(0, sg * post, floorY + hPost);
      woodMesh.beam(rel(a), rel(b), big ? 0.05 : 0.04, colour(a[0], a[2], floorY + 0.4));
    }
    if (big) {
      // The rounded lintel: a half ring over the posts, with the band of the paint colour on its front.
      const R0 = 0.4;
      const R1 = 0.5;
      const depth = 0.07;
      const SEG = 10;
      for (let k = 0; k < SEG; k++) {
        const a0 = (Math.PI * k) / SEG;
        const a1 = (Math.PI * (k + 1)) / SEG;
        const pt = (a: number, r: number, off: number): V3 => along(off, Math.cos(a) * (r - 0.05), floorY + hPost + Math.sin(a) * (r - 0.05));
        const nOut = (a: number): V3 => norm([latX * Math.cos(a), Math.sin(a), latZ * Math.cos(a)]);
        const col = colour(...([along(0, 0, 0)[0], along(0, 0, 0)[2], floorY + hPost + 0.6] as V3));
        // outer, inner, front, back faces
        woodMesh.quad([pt(a0, R1, -depth), pt(a1, R1, -depth), pt(a1, R1, depth), pt(a0, R1, depth)].map(rel), [nOut(a0), nOut(a1), nOut(a1), nOut(a0)], col);
        woodMesh.quad([pt(a0, R0, -depth), pt(a1, R0, -depth), pt(a1, R0, depth), pt(a0, R0, depth)].map(rel), [mul(nOut(a0), -1), mul(nOut(a1), -1), mul(nOut(a1), -1), mul(nOut(a0), -1)], col);
        const front: V3 = [-dirX, 0, -dirZ];
        const back: V3 = [dirX, 0, dirZ];
        woodMesh.quad([pt(a0, R0, -depth), pt(a1, R0, -depth), pt(a1, R1, -depth), pt(a0, R1, -depth)].map(rel), [front, front, front, front], col);
        woodMesh.quad([pt(a0, R0, depth), pt(a1, R0, depth), pt(a1, R1, depth), pt(a0, R1, depth)].map(rel), [back, back, back, back], col);
        // The band of the paint colour: a strip on the front, a hair in front of it.
        woodMesh.quad([pt(a0, 0.52, -depth - 0.006), pt(a1, 0.52, -depth - 0.006), pt(a1, 0.58, -depth - 0.006), pt(a0, 0.58, -depth - 0.006)].map(rel), [front, front, front, front], paint);
      }
    } else {
      // The small gantry of the exit: a flat lintel, no colour.
      const a = along(0, -post - 0.02, floorY + hPost + 0.04);
      const b = along(0, post + 0.02, floorY + hPost + 0.04);
      woodMesh.beam(rel(a), rel(b), 0.045, colour(a[0], a[2], floorY + hPost));
    }
  };
  // The tall one over the entry tile's edge, the small one a little inside the trough before its end.
  gantry(entryC[0] + mdc * 0.5, entryC[1] + mdr * 0.5, mdc, mdr, h0, true);
  const flapFrame = fr.at(fr.end - FLAP_BACK);
  const th = norm([flapFrame.t[0], 0, flapFrame.t[2]]);
  gantry(flapFrame.p[0], flapFrame.p[2], th[0], th[2], flapFrame.p[1], false);

  // ---- The floor of the trough, and the same floor a hair higher for the paint.
  const floorMesh = new Mesh();
  const overlayMesh = new Mesh();
  const UP_NUDGE = 0.012;
  const fw = SLIDE_HALF_FLOOR + 0.01;
  const total = Math.max(1e-6, fr.end - fr.start);
  const frac = (x: number) => x - Math.floor(x + 1e-9);
  for (let i = 0; i + 1 < list.length; i++) {
    const fa = list[i];
    const fb = list[i + 1];
    const ua = (fa.d - fr.start) / 1;
    const ub = (fb.d - fr.start) / 1;
    // The texture repeats every tile: a quad that crosses a tile boundary ends at 1.
    const ua2 = frac(ua);
    let ub2 = frac(ub);
    if (ub2 <= ua2 + 1e-6) ub2 = 1;
    const na = fa.up;
    const nb = fb.up;
    const pa0 = at3(fa, -fw, 0);
    const pa1 = at3(fa, fw, 0);
    const pb0 = at3(fb, -fw, 0);
    const pb1 = at3(fb, fw, 0);
    const alongA = (fa.d - fr.start) / total;
    const alongB = (fb.d - fr.start) / total;
    const uv: [number, number][] = [
      [ua2, 0],
      [ua2, 1],
      [ub2, 1],
      [ub2, 0],
    ];
    floorMesh.quad([rel(pa0), rel(pa1), rel(pb1), rel(pb0)], [na, na, nb, nb], new THREE.Color(1, 1, 1), uv, [alongA, alongA, alongB, alongB]);
    const lift = (p: V3, f: Frame): V3 => rel(add(p, mul(f.up, UP_NUDGE)));
    overlayMesh.quad([lift(pa0, fa), lift(pa1, fa), lift(pb1, fb), lift(pb0, fb)], [na, na, nb, nb], new THREE.Color(1, 1, 1), uv);
  }

  // ---- The flap: boards and a brace, hinged at the top, with the round "no entry" sign on the outside.
  const flapMesh = new Mesh();
  {
    const W = 0.84;
    const H = 0.92;
    const T = 0.05;
    const base = wc(0, 0, 0.7);
    const boards = 4;
    for (let b = 0; b < boards; b++) {
      const y0 = -(H * b) / boards;
      const y1 = -(H * (b + 1)) / boards + 0.012;
      const col = wc(b * 0.7, 0, 0.6 + 0.05 * b);
      void base;
      const box = (hw: number, y0b: number, y1b: number, z0: number, z1: number, c: THREE.Color) => {
        const P = (x: number, y: number, z: number): V3 => [x, y, z];
        const f: [V3[], V3][] = [
          [[P(-hw, y0b, z1), P(hw, y0b, z1), P(hw, y1b, z1), P(-hw, y1b, z1)], [0, 0, 1]],
          [[P(hw, y0b, z0), P(-hw, y0b, z0), P(-hw, y1b, z0), P(hw, y1b, z0)], [0, 0, -1]],
          [[P(hw, y0b, z1), P(hw, y0b, z0), P(hw, y1b, z0), P(hw, y1b, z1)], [1, 0, 0]],
          [[P(-hw, y0b, z0), P(-hw, y0b, z1), P(-hw, y1b, z1), P(-hw, y1b, z0)], [-1, 0, 0]],
          [[P(-hw, y1b, z1), P(hw, y1b, z1), P(hw, y1b, z0), P(-hw, y1b, z0)], [0, 1, 0]],
          [[P(-hw, y0b, z0), P(hw, y0b, z0), P(hw, y0b, z1), P(-hw, y0b, z1)], [0, -1, 0]],
        ];
        for (const [q, nn] of f) flapMesh.quad(q, [nn, nn, nn, nn], c);
      };
      box(W / 2, y1, y0, -T / 2, T / 2, col);
    }
    // The two upright battens on the inside face.
    const batten = wc(0.3, 0, 0.55);
    for (const x of [-0.3, 0.3]) {
      const q: V3[] = [
        [x - 0.045, -H, -T / 2 - 0.02],
        [x + 0.045, -H, -T / 2 - 0.02],
        [x + 0.045, 0, -T / 2 - 0.02],
        [x - 0.045, 0, -T / 2 - 0.02],
      ];
      flapMesh.quad(q, [[0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]], batten);
    }
    // The round sign on the outside: a soft red disc with a white bar.
    const red = new THREE.Color('#d4524a');
    const white = new THREE.Color('#fbf3e6');
    const cy = -H * 0.5;
    const R = 0.19;
    const SEG = 14;
    const zS = T / 2 + 0.006;
    for (let k = 0; k < SEG; k++) {
      const a0 = (Math.PI * 2 * k) / SEG;
      const a1 = (Math.PI * 2 * (k + 1)) / SEG;
      const c = [0, cy, zS] as V3;
      flapMesh.quad([c, [Math.cos(a0) * R, cy + Math.sin(a0) * R, zS], [Math.cos(a1) * R, cy + Math.sin(a1) * R, zS], c], [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], red);
    }
    flapMesh.quad([[-0.13, cy - 0.035, zS + 0.004], [0.13, cy - 0.035, zS + 0.004], [0.13, cy + 0.035, zS + 0.004], [-0.13, cy + 0.035, zS + 0.004]], [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], white);
  }
  const hinge: V3 = [flapFrame.p[0] - ox, flapFrame.p[1] + 0.95, flapFrame.p[2] - oz];
  // Local +z of the flap is the way out: yaw so that (0,0,1) becomes the horizontal direction of the end of the chute.
  const yaw = Math.atan2(th[0], th[2]);

  // ---- Chevrons.
  const basis = (p: V3, x: V3, y: V3): THREE.Matrix4 => {
    const z = norm(cross(x, y));
    return new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)).setPosition(p[0], p[1], p[2]);
  };
  const entryChevrons: THREE.Matrix4[] = [];
  for (const off of [-0.2, 0.12]) {
    const p: V3 = [entryC[0] + mdc * off - ox, h0 + 0.04, entryC[1] + mdr * off - oz];
    entryChevrons.push(basis(p, [mdc, 0, mdr], [0, 1, 0]));
  }
  const troughChevrons: THREE.Matrix4[] = [];
  for (let d = fr.start + 1.2; d < fr.end - 0.7; d += 1.0) {
    const f = fr.at(d);
    troughChevrons.push(basis(rel(add(f.p, mul(f.up, 0.02))), f.t, f.up));
  }

  const wood_g = woodMesh.geometry();
  const floor_g = floorMesh.geometry(true, 'along');
  const flap_g = flapMesh.geometry();
  const parts: ChuteParts = {
    wood: wood_g,
    floor: floor_g,
    newOverlay: () => overlayMesh.geometry(true),
    floorQuads: list.length - 1,
    flap: flap_g,
    hinge,
    yaw,
    entryChevrons,
    troughChevrons,
    triangles: woodMesh.tris + floorMesh.tris + overlayMesh.tris + flapMesh.tris,
  };
  void BALL_R;
  cache.set(key, parts);
  return parts;
}

export function disposeChuteGeometries() {
  for (const p of cache.values()) {
    p.wood.dispose();
    p.floor.dispose();
    p.flap.dispose();
  }
  cache.clear();
}

/** Triangles of the chute, counted from the real mesh (the budget uses it). */
export const chuteTriangles = (level: Level, s: Slide, wood: WoodStyle = { tone: 1, sat: 0.5 }): number => buildChuteParts(level, s, wood).triangles;
