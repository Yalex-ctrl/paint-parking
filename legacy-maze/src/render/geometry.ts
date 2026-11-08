import * as THREE from 'three';

import { isPresentCell } from '../game/silhouette';
import type { Level } from '../game/types';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE_Y, PLATEAU_H, WALL_H } from './coords';
import { groundY, tallWalls } from './heights';
import { slideCarvedCells } from './slidePath';

const SUB = 5; // lattice subdivisions per cell for the wall top
const BEVEL = 0.11; // radius of the rounded top edges

/**
 * True where the merged wall block must leave a hole: floor cells, the exit cell (the gate) and
 * the fragile walls (they are separate blocks that break).
 */
const makeIsOpen = (level: Level) => {
  const fragile = new Set(level.features.fragile.map(([r, c]) => r * level.cols + c));
  // The wall cells cut away under the climb and the descent of a chute: pits, the chute passes above.
  const carved = new Set(slideCarvedCells(level).map(([r, c]) => r * level.cols + c));
  return (r: number, c: number) =>
    r >= 0 &&
    c >= 0 &&
    r < level.rows &&
    c < level.cols &&
    (level.grid[r][c] === '.' ||
      carved.has(r * level.cols + c) ||
      (r === level.exit.r && c === level.exit.c) ||
      (!!level.entry && r === level.entry.r && c === level.entry.c) ||
      fragile.has(r * level.cols + c));
};

const distToRect = (u: number, v: number, c: number, r: number) => {
  const dx = Math.max(c - u, 0, u - (c + 1));
  const dz = Math.max(r - v, 0, v - (r + 1));
  return Math.hypot(dx, dz);
};

/**
 * Builds ONE mesh for all the walls. The top is a heightfield sampled on a fine
 * lattice: flat at WALL_H, rounded down to the corridor edges by a quarter-circle
 * profile. Because it is a single continuous surface there are no grid lines on
 * the wall tops, and the bevel is seamless between neighbouring cells.
 * Vertex colours give the light-wood tint with a soft gradient.
 */
export type WoodStyle = { tone: number; sat: number };

/**
 * The colour of the wood of the walls at a point: a soft large-scale gradient, darker toward the base. The structures built on the board
 * (platforms, ramps, chutes) use the same function, so they are the same wood as the walls.
 */
export function woodTintFn(rows: number, wood: WoodStyle, out = new THREE.Color()) {
  return (x: number, z: number, y: number): THREE.Color => {
    const grad = 0.69 + 0.05 * Math.sin(x * 0.45 + z * 0.3) - 0.04 * ((z + rows / 2) / rows);
    const shade = 0.62 + 0.38 * Math.min(1, Math.max(0, (y - BASE_Y) / (WALL_H - BASE_Y)));
    return out.setHSL(0.095, wood.sat, grad * shade * wood.tone);
  };
}

export function buildWallGeometry(level: Level, wood: WoodStyle = { tone: 1, sat: 0.5 }): THREE.BufferGeometry {
  const { rows, cols } = level;
  const isOpen = makeIsOpen(level);
  // A wall cell is built only where it touches a corridor: solid blocks deep inside the rectangle are left out.
  const isSolid = (r: number, c: number) => !isOpen(r, c) && isPresentCell(level, r, c);
  const isHole = (r: number, c: number) => isOpen(r, c) || (r >= 0 && c >= 0 && r < rows && c < cols && !isPresentCell(level, r, c));

  // Distance (in cells) from a lattice point to the corridor region or the board's outer edge.
  const edgeDistance = (u: number, v: number) => {
    let d = Math.min(u, cols - u, v, rows - v);
    const c0 = Math.floor(u);
    const r0 = Math.floor(v);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (isHole(r, c)) d = Math.min(d, distToRect(u, v, c, r));
      }
    }
    return d;
  };
  // The walls that hold up a platform are PLATEAU_H taller; where a tall wall meets a low one the top slopes over a short stretch.
  const tall = tallWalls(level);
  const topOfCell = (r: number, c: number) => (tall.has(r * cols + c) ? WALL_H + PLATEAU_H : WALL_H);
  const STEP_W = 0.2;
  // The top at a point: the mean of the tops of the wall cells within STEP_W of it, weighted by how close they are, so a point on the
  // border between a tall and a low wall is half way, and a point on the border with the corridor takes the wall's own top.
  const topAt = (u: number, v: number) => {
    if (tall.size === 0) return WALL_H;
    const c0 = Math.floor(u);
    const r0 = Math.floor(v);
    let sum = 0;
    let weight = 0;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols || !isSolid(r, c)) continue;
        const d = distToRect(u, v, c, r);
        const w = Math.max(0, 1 - d / STEP_W);
        if (w <= 0) continue;
        sum += w * topOfCell(r, c);
        weight += w;
      }
    }
    return weight > 0 ? sum / weight : WALL_H;
  };
  const heightAt = (u: number, v: number) => {
    const top = topAt(u, v);
    const d = edgeDistance(u, v);
    if (d >= BEVEL) return top;
    const k = BEVEL - d;
    return top - BEVEL + Math.sqrt(Math.max(0, BEVEL * BEVEL - k * k));
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tint = new THREE.Color();

  const woodColor = woodTintFn(rows, wood, tint);

  // --- Top surface: shared lattice vertices, only quads that lie inside a wall cell.
  const nu = cols * SUB + 1;
  const vertexIndex = new Int32Array(nu * (rows * SUB + 1)).fill(-1);
  const topVertex = (i: number, j: number) => {
    const key = j * nu + i;
    let idx = vertexIndex[key];
    if (idx >= 0) return idx;
    const u = i / SUB;
    const v = j / SUB;
    const y = heightAt(u, v);
    const e = tall.size > 0 ? 0.07 : 0.02;
    const nx = heightAt(u - e, v) - heightAt(u + e, v);
    const nz = heightAt(u, v - e) - heightAt(u, v + e);
    const len = Math.hypot(nx, 2 * e, nz);
    const x = u - cols / 2;
    const z = v - rows / 2;
    idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx / len, (2 * e) / len, nz / len);
    const c = woodColor(x, z, y);
    colors.push(c.r, c.g, c.b);
    vertexIndex[key] = idx;
    return idx;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isSolid(r, c)) continue;
      for (let a = 0; a < SUB; a++) {
        for (let b = 0; b < SUB; b++) {
          const i = c * SUB + a;
          const j = r * SUB + b;
          const v00 = topVertex(i, j);
          const v10 = topVertex(i + 1, j);
          const v01 = topVertex(i, j + 1);
          const v11 = topVertex(i + 1, j + 1);
          indices.push(v00, v01, v10, v10, v01, v11); // facing +Y
        }
      }
    }
  }

  // --- Vertical faces wherever a wall cell borders the corridor or the outside.
  const side = (
    r: number,
    c: number,
    nr: number,
    nc: number,
    // lattice start/end of the shared edge
    i0: number,
    j0: number,
    i1: number,
    j1: number,
  ) => {
    const nxs = nc - c;
    const nzs = nr - r;
    for (let s = 0; s < SUB; s++) {
      const ia = i0 + ((i1 - i0) * s) / SUB;
      const ja = j0 + ((j1 - j0) * s) / SUB;
      const ib = i0 + ((i1 - i0) * (s + 1)) / SUB;
      const jb = j0 + ((j1 - j0) * (s + 1)) / SUB;
      const pts: [number, number][] = [
        [ia, ja],
        [ib, jb],
      ];
      const base = positions.length / 3;
      for (const [iu, iv] of pts) {
        const u = iu / SUB;
        const v = iv / SUB;
        const x = u - cols / 2;
        const z = v - rows / 2;
        const top = heightAt(u, v);
        for (const y of [top, BASE_Y]) {
          positions.push(x, y, z);
          normals.push(nxs, 0, nzs);
          const col = woodColor(x, z, y);
          colors.push(col.r, col.g, col.b);
        }
      }
      // base+0 top A, +1 bottom A, +2 top B, +3 bottom B; orient to face (nxs, nzs).
      const ax = positions[base * 3 + 0];
      const az = positions[base * 3 + 2];
      const bx = positions[(base + 2) * 3 + 0];
      const bz = positions[(base + 2) * 3 + 2];
      // normal of (topA, bottomA, topB) = (bottomA - topA) x (topB - topA)
      const ex = bx - ax;
      const ez = bz - az;
      // (0,-1,0) x (ex,0,ez) = (-ez, 0, ex)
      const facing = -ez * nxs + ex * nzs;
      if (facing > 0) indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      else indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isSolid(r, c)) continue;
      const outside = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= rows || cc >= cols || !isPresentCell(level, rr, cc);
      if (isOpen(r - 1, c) || outside(r - 1, c)) side(r, c, r - 1, c, c * SUB, r * SUB, (c + 1) * SUB, r * SUB);
      if (isOpen(r + 1, c) || outside(r + 1, c)) side(r, c, r + 1, c, c * SUB, (r + 1) * SUB, (c + 1) * SUB, (r + 1) * SUB);
      if (isOpen(r, c - 1) || outside(r, c - 1)) side(r, c, r, c - 1, c * SUB, r * SUB, c * SUB, (r + 1) * SUB);
      if (isOpen(r, c + 1) || outside(r, c + 1)) side(r, c, r, c + 1, (c + 1) * SUB, r * SUB, (c + 1) * SUB, (r + 1) * SUB);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Soft contact shadows on the corridor floor, along the foot of every wall:
 * black strips whose alpha fades from the wall outwards (cheap ambient occlusion).
 */
export function buildContactShadowGeometry(level: Level): THREE.BufferGeometry {
  const { rows, cols } = level;
  const WIDTH = 0.34;
  const ALPHA = 0.5;
  const Y = 0.04;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // The exit is an opening in the wall: no wall, so no shadow at its foot.
  const solid = (r: number, c: number) =>
    r < 0 || c < 0 || r >= rows || c >= cols || (level.grid[r][c] === '#' && !(r === level.exit.r && c === level.exit.c) && !(level.entry && r === level.entry.r && c === level.entry.c));

  // A strip lies on the floor under it: the platform, the slope of a ramp (the height is read a hair inside the tile).
  const yAt = (x: number, z: number, inX: number, inZ: number) => groundY(level, x + inX * 0.03, z + inZ * 0.03) + Y;
  const strip = (x0: number, z0: number, x1: number, z1: number, inX: number, inZ: number) => {
    const base = positions.length / 3;
    positions.push(
      x0, yAt(x0, z0, inX, inZ), z0,
      x1, yAt(x1, z1, inX, inZ), z1,
      x1 + inX * WIDTH, yAt(x1 + inX * WIDTH, z1 + inZ * WIDTH, inX, inZ), z1 + inZ * WIDTH,
      x0 + inX * WIDTH, yAt(x0 + inX * WIDTH, z0 + inZ * WIDTH, inX, inZ), z0 + inZ * WIDTH,
    );
    colors.push(0, 0, 0, ALPHA, 0, 0, 0, ALPHA, 0, 0, 0, 0, 0, 0, 0, 0);
    // Winding chosen to face +Y for every orientation.
    const ex = x1 - x0;
    const ez = z1 - z0;
    const facing = ex * inZ - ez * inX; // (e x in).y sign
    if (facing < 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (level.grid[r][c] !== '.') continue;
      const x0 = c - cols / 2;
      const z0 = r - rows / 2;
      if (solid(r - 1, c)) strip(x0, z0, x0 + 1, z0, 0, 1);
      if (solid(r + 1, c)) strip(x0, z0 + 1, x0 + 1, z0 + 1, 0, -1);
      if (solid(r, c - 1)) strip(x0, z0, x0, z0 + 1, 1, 0);
      if (solid(r, c + 1)) strip(x0 + 1, z0, x0 + 1, z0 + 1, -1, 0);
    }
  }

  // The soft shadow of a ramp on the low floor, at its foot (the tile it comes down to).
  for (const k of level.features.ramps ?? []) {
    const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[k.up];
    // The low edge is the one opposite to the platform: the strip goes from there into the low tile.
    const x = k.c - cols / 2 + 0.5;
    const z = k.r - rows / 2 + 0.5;
    const ex = x - dc * 0.5;
    const ez = z - dr * 0.5;
    const lx = Math.abs(dr) * 0.5;
    const lz = Math.abs(dc) * 0.5;
    const nr = k.r - dr;
    const nc = k.c - dc;
    if (level.grid[nr]?.[nc] !== '.') continue;
    strip(ex - lx, ez - lz, ex + lx, ez + lz, -dc, -dr);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

const SIDE_X: Record<string, number> = { L: -1, R: 1, U: 0, D: 0 };
const SIDE_Z: Record<string, number> = { L: 0, R: 0, U: -1, D: 1 };

/**
 * The low curved wooden wall of a corner tile, in the tile's local space (centre at the origin).
 * The ball runs on a quarter circle of radius 0.5 around the corner shared by the two open sides;
 * the wall is a quarter ring just outside it (radius ~1) that closes the bend on the outside.
 */
export function buildCornerWallGeometry(a: string, b: string, height = 0.34): THREE.BufferGeometry {
  // The corner point shared by the open sides.
  const px = (SIDE_X[a] + SIDE_X[b]) * 0.5;
  const pz = (SIDE_Z[a] + SIDE_Z[b]) * 0.5;
  const mid = Math.atan2(-pz, -px); // the quadrant pointing back toward the tile's centre
  const r0 = 0.97;
  const r1 = 1.08;
  const N = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const tint = new THREE.Color();
  const push = (r: number, ang: number, y: number, shade: number) => {
    positions.push(px + Math.cos(ang) * r, y, pz + Math.sin(ang) * r);
    tint.setHSL(0.095, 0.5, 0.52 * shade);
    colors.push(tint.r, tint.g, tint.b);
  };
  // Vertices per step: outer-top, inner-top, outer-bottom, inner-bottom.
  for (let k = 0; k <= N; k++) {
    const ang = mid - Math.PI / 4 + (k / N) * (Math.PI / 2);
    push(r1, ang, height, 1.15);
    push(r0, ang, height, 1.15);
    push(r1, ang, 0, 0.8);
    push(r0, ang, 0, 0.8);
  }
  for (let k = 0; k < N; k++) {
    const i = k * 4;
    const j = i + 4;
    indices.push(i, j, i + 1, i + 1, j, j + 1); // top
    indices.push(i, i + 2, j, j, i + 2, j + 2); // outer face
    indices.push(i + 1, j + 1, i + 3, i + 3, j + 1, j + 3); // inner face
  }
  const cap = (i: number) => indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
  cap(0);
  cap(N * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** The dark slab under the board: one box per built cell, so it has the board's shape and never sticks out. */
export function buildSlabGeometry(level: Level): THREE.BufferGeometry {
  const boxes: THREE.BufferGeometry[] = [];
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      if (!isPresentCell(level, r, c)) continue;
      const b = new THREE.BoxGeometry(1, 0.3, 1);
      b.translate(c - level.cols / 2 + 0.5, BASE_Y - 0.15, r - level.rows / 2 + 0.5);
      boxes.push(b.toNonIndexed());
    }
  }
  const merged = mergeGeometries(boxes)!;
  boxes.forEach((b) => b.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export type BoardGeometries = {
  walls: THREE.BufferGeometry;
  shadows: THREE.BufferGeometry;
  slab: THREE.BufferGeometry;
};

/** The heavy static geometry of a level (also built ahead of time for the next level). */
export function buildBoardGeometries(level: Level, wood?: WoodStyle): BoardGeometries {
  return { walls: buildWallGeometry(level, wood), shadows: buildContactShadowGeometry(level), slab: buildSlabGeometry(level) };
}
