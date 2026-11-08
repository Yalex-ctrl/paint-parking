import * as THREE from 'three';

import { DELTA, DIRS, type Level } from '../game/types';
import { BASE_Y, PLATEAU_H, cellX, cellZ } from './coords';
import { woodTintFn, type WoodStyle } from './geometry';

/**
 * The fixed wooden parts of the levels with platforms ("étages"), built once per level while it is mounted:
 *  - `trim`: the side of the platform wherever it faces the low floor: dark vertical planks, up to the height of the platform, with a
 *    light line along the top edge (a textured quad laid a hair in front of the wall, v = 1 at the top);
 *  - `fittings` (vertex colours, the wood of the walls): the small posts at the corners of those sides, and the low walls along both
 *    sides of every ramp, whose side face is a trapezoid that follows the slope.
 * The floors of the platform, the ramps and the paint on them are the board's own instanced tiles, at their height.
 */
export type TierParts = { trim: THREE.BufferGeometry | null; fittings: THREE.BufferGeometry | null; triangles: number };

const OFFSET = 0.004;
const POST = 0.13;
/** Height of the side walls of a ramp above its surface, and their thickness. */
const CURB = 0.1;
const CURB_W = 0.12;

type V3 = [number, number, number];

export function buildTierParts(level: Level, wood: WoodStyle): TierParts {
  const raised = new Set((level.features.raised ?? []).map(([r, c]) => r * level.cols + c));
  const ramps = level.features.ramps ?? [];
  if (raised.size === 0 && ramps.length === 0) return { trim: null, fittings: null, triangles: 0 };
  const rampAt = new Set(ramps.map((k) => k.r * level.cols + k.c));
  const tint = woodTintFn(level.rows, wood);
  const isFloor = (r: number, c: number) => r >= 0 && c >= 0 && r < level.rows && c < level.cols && level.grid[r][c] === '.';
  const isRaised = (r: number, c: number) => raised.has(r * level.cols + c);
  const isRamp = (r: number, c: number) => rampAt.has(r * level.cols + c);
  const lowFloor = (r: number, c: number) => isFloor(r, c) && !isRaised(r, c) && !isRamp(r, c);
  /** A wall cell that holds up a platform: a platform tile on one side of it. */
  const touchesPlatform = (r: number, c: number, skipR: number, skipC: number) =>
    DIRS.some((d) => {
      const rr = r + DELTA[d][0];
      const cc = c + DELTA[d][1];
      return !(rr === skipR && cc === skipC) && isRaised(rr, cc);
    });

  // ---- The sides facing the low floor: [x0, z0, x1, z1, outward x, outward z, length].
  const sides: [number, number, number, number, number, number][] = [];
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      for (const d of DIRS) {
        const [dr, dc] = DELTA[d];
        const nr = r + dr;
        const nc = c + dc;
        if (!lowFloor(nr, nc)) continue;
        // The face of the cell (r, c) that looks at the low tile (nr, nc): a platform tile itself, or a wall that holds up a platform.
        const holds = isRaised(r, c) || (level.grid[r][c] === '#' && touchesPlatform(r, c, nr, nc));
        if (!holds) continue;
        const x = cellX(level, c);
        const z = cellZ(level, r);
        // The edge shared with the neighbour runs perpendicular to the direction (dr, dc).
        const ex = x + dc * 0.5;
        const ez = z + dr * 0.5;
        const lx = Math.abs(dr) * 0.5;
        const lz = Math.abs(dc) * 0.5;
        sides.push([ex - lx, ez - lz, ex + lx, ez + lz, dc, dr]);
      }
    }
  }

  // ---- Trim quads (textured).
  const tp: number[] = [];
  const tn: number[] = [];
  const tu: number[] = [];
  const ti: number[] = [];
  for (const [x0, z0, x1, z1, nx, nz] of sides) {
    const b = tp.length / 3;
    const ox = nx * OFFSET;
    const oz = nz * OFFSET;
    tp.push(x0 + ox, BASE_Y, z0 + oz, x1 + ox, BASE_Y, z1 + oz, x1 + ox, PLATEAU_H, z1 + oz, x0 + ox, PLATEAU_H, z0 + oz);
    for (let i = 0; i < 4; i++) tn.push(nx, 0, nz);
    // One repeat of the planks per 0.5 tile along the side; the sides of one run join where they share a corner.
    const u0 = (x0 + z0) * 2;
    tu.push(u0, 0, u0 + 2, 0, u0 + 2, 1, u0, 1);
    // Wind the quad so that it faces its outward direction.
    const e: V3 = [x1 - x0, 0, z1 - z0];
    const up: V3 = [0, 1, 0];
    const cr: V3 = [e[1] * up[2] - e[2] * up[1], e[2] * up[0] - e[0] * up[2], e[0] * up[1] - e[1] * up[0]];
    // (0,0)->(1,0)->(1,1): the geometric normal is e x up.
    if (cr[0] * nx + cr[2] * nz > 0) ti.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else ti.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  let trim: THREE.BufferGeometry | null = null;
  if (sides.length > 0) {
    trim = new THREE.BufferGeometry();
    trim.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    trim.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
    trim.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
    trim.setIndex(ti);
    trim.computeBoundingSphere();
  }

  // ---- Fittings (wood colours): posts at the ends of the sides, and the low walls of the ramps.
  const fp: number[] = [];
  const fn: number[] = [];
  const fc: number[] = [];
  const fi: number[] = [];
  const quad = (p: V3[], n: V3) => {
    const b = fp.length / 3;
    for (const q of p) {
      fp.push(q[0], q[1], q[2]);
      fn.push(n[0], n[1], n[2]);
      const col = tint(q[0], q[2], q[1]);
      fc.push(col.r, col.g, col.b);
    }
    const g: V3 = [
      (p[1][1] - p[0][1]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][1] - p[0][1]),
      (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]),
      (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]),
    ];
    if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0) fi.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else fi.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  const box = (cx: number, cz: number, hw: number, y0: number, y1: number) => {
    const P = (x: number, y: number, z: number): V3 => [cx + x, y, cz + z];
    quad([P(-hw, y0, hw), P(hw, y0, hw), P(hw, y1, hw), P(-hw, y1, hw)], [0, 0, 1]);
    quad([P(hw, y0, -hw), P(-hw, y0, -hw), P(-hw, y1, -hw), P(hw, y1, -hw)], [0, 0, -1]);
    quad([P(hw, y0, hw), P(hw, y0, -hw), P(hw, y1, -hw), P(hw, y1, hw)], [1, 0, 0]);
    quad([P(-hw, y0, -hw), P(-hw, y0, hw), P(-hw, y1, hw), P(-hw, y1, -hw)], [-1, 0, 0]);
    quad([P(-hw, y1, hw), P(hw, y1, hw), P(hw, y1, -hw), P(-hw, y1, -hw)], [0, 1, 0]);
  };
  const posts = new Set<string>();
  for (const [x0, z0, x1, z1, nx, nz] of sides) {
    for (const [x, z] of [
      [x0, z0],
      [x1, z1],
    ]) {
      const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      if (posts.has(key)) continue;
      posts.add(key);
      box(x + nx * (POST / 2 + OFFSET), z + nz * (POST / 2 + OFFSET), POST / 2, BASE_Y, PLATEAU_H + 0.05);
    }
  }

  for (const k of ramps) {
    const [dr, dc] = DELTA[k.up];
    const cx = cellX(level, k.c);
    const cz = cellZ(level, k.r);
    // Along the ramp (toward the platform) and across it.
    const ax = dc;
    const az = dr;
    const lx = Math.abs(dr);
    const lz = Math.abs(dc);
    const surface = (a: number) => PLATEAU_H * (a + 0.5);
    const at = (a: number, l: number, y: number): V3 => [cx + ax * a + lx * l, y, cz + az * a + lz * l];
    for (const side of [-1, 1]) {
      const inner = side * (0.5 - CURB_W);
      const outer = side * 0.5;
      const lat: V3 = [lx * side, 0, lz * side];
      const A = -0.5;
      const B = 0.5;
      const top = (a: number) => surface(a) + CURB;
      // The outer face (a trapezoid that follows the slope) and the inner face.
      quad([at(A, outer, BASE_Y), at(B, outer, BASE_Y), at(B, outer, top(B)), at(A, outer, top(A))], lat);
      quad([at(A, inner, BASE_Y), at(B, inner, BASE_Y), at(B, inner, top(B)), at(A, inner, top(A))], [-lat[0], 0, -lat[2]]);
      // The top, following the slope, and the end at the foot of the ramp.
      const nTop = (() => {
        const sx = -PLATEAU_H * ax;
        const sz = -PLATEAU_H * az;
        const l = Math.hypot(sx, 1, sz);
        return [sx / l, 1 / l, sz / l] as V3;
      })();
      quad([at(A, inner, top(A)), at(A, outer, top(A)), at(B, outer, top(B)), at(B, inner, top(B))], nTop);
      quad([at(A, inner, BASE_Y), at(A, outer, BASE_Y), at(A, outer, top(A)), at(A, inner, top(A))], [-ax, 0, -az]);
    }
  }

  let fittings: THREE.BufferGeometry | null = null;
  if (fp.length > 0) {
    fittings = new THREE.BufferGeometry();
    fittings.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fittings.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
    fittings.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fittings.setIndex(fi);
    fittings.computeBoundingSphere();
  }
  return { trim, fittings, triangles: (ti.length + fi.length) / 3 };
}
