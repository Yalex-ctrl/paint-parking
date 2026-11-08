import * as THREE from 'three';

import type { Level } from '../game/types';
import { DELTA } from '../game/types';
import { GROUND_Y } from './coords';

/** Thickness of the island's edge: a slice of earth, sandstone or ice, darker toward the bottom (its own shadow). */
export const ISLAND_DEPTH = 0.7;
/** Depth of the hole: earth walls going down to a dark bottom. */
export const PIT_DEPTH = 0.9;

/**
 * The grass "island" the board stands on: a finite slab of cells (in level cell coordinates,
 * which may lie outside the board) with a hole beside the exit where the ball drops through.
 */
export type IslandSpec = {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  /** Cells left open (the pit), as `r * 1000 + c` keys offset by 500. */
  pit: Set<number>;
};

export const cellKey = (r: number, c: number) => (r + 500) * 1000 + (c + 500);

/**
 * The hole the ball drops into: one cell (a little bigger than the 0.82-wide ball), right beyond the
 * exit opening, in line with it.
 */
export function pitCells(level: Level): Set<number> {
  const { r, c, dir } = level.exit;
  const [dr, dc] = DELTA[dir];
  return new Set([cellKey(r + dr, c + dc)]);
}

/** The ground colours of a world: the grass near the board, far from it, and the island's rim. */
export type GroundColors = { near: THREE.Color; far: THREE.Color; rimTop: THREE.Color; rimBottom: THREE.Color };

export function groundColors(ground: { near: string; far: string; rimTop?: string; rimBottom?: string }): GroundColors {
  const far = new THREE.Color(ground.far);
  return {
    near: new THREE.Color(ground.near),
    far,
    rimTop: ground.rimTop ? new THREE.Color(ground.rimTop) : far.clone().multiplyScalar(0.88),
    rimBottom: ground.rimBottom ? new THREE.Color(ground.rimBottom) : far.clone().multiplyScalar(0.62),
  };
}

export const FOREST_GROUND = groundColors({ near: '#6f9a58', far: '#4c7a45' });
const tmp = new THREE.Color();

/** Soft grass colour at a world point: lighter near the board, darker far away, with gentle patches. */
export function grassAt(x: number, z: number, out = tmp, colors: GroundColors = FOREST_GROUND): THREE.Color {
  const d = Math.hypot(x, z);
  const patch = Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.19) + 0.5 * Math.sin(x * 0.51 + z * 0.43 + 2);
  out.copy(colors.near).lerp(colors.far, Math.min(1, Math.pow(d / 38, 0.8)));
  return out.offsetHSL(patch * 0.012, 0, patch * 0.022);
}

// The hole's walls are earth, going from brown at the lip to almost black at the bottom.
const PIT_WALL_TOP = new THREE.Color('#8a6a45');
const PIT_WALL_BOTTOM = new THREE.Color('#4a3524');
const PIT_BOTTOM = new THREE.Color('#2e2218');

/**
 * Grass top (vertex colours, no texture), a thin green rim all around the slab, and the hole
 * (earth walls and a dark bottom). One mesh, one material.
 */
export function buildIslandGeometry(level: Level, spec: IslandSpec, ground: GroundColors = FOREST_GROUND): THREE.BufferGeometry {
  const { cols, rows } = level;
  // The rim is irregular: some cells of the two outer rings are left out (the same ones every time).
  const present = (r: number, c: number) => {
    if (r < spec.r0 || r > spec.r1 || c < spec.c0 || c > spec.c1 || spec.pit.has(cellKey(r, c))) return false;
    const ring = Math.min(r - spec.r0, spec.r1 - r, c - spec.c0, spec.c1 - c);
    if (ring >= 2) return true;
    const h = Math.sin(r * 12.9898 + c * 78.233 + level.id * 0.37) * 43758.5453;
    return h - Math.floor(h) >= (ring === 0 ? 0.4 : 0.12);
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();

  const vertex = (x: number, y: number, z: number, color: THREE.Color, nx: number, ny: number, nz: number) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    normals.push(nx, ny, nz);
    return positions.length / 3 - 1;
  };

  // Far from the board the ground is drawn in big square blocks (nobody sees the difference: the colour is a slow gradient),
  // close to it and along the irregular rim cell by cell. Fewer vertices to build, to upload and to draw.
  const NEAR = 5;
  const BLOCK = 4;
  const nearR0 = -NEAR;
  const nearR1 = rows - 1 + NEAR;
  const nearC0 = -NEAR;
  const nearC1 = cols - 1 + NEAR;
  const solid = (r: number, col: number, size: number) => {
    for (let dr = 0; dr < size; dr++) for (let dc = 0; dc < size; dc++) if (!present(r + dr, col + dc)) return false;
    return true;
  };
  const quad = (r: number, col: number, size: number) => {
    const x0 = col - cols / 2;
    const z0 = r - rows / 2;
    const x1 = x0 + size;
    const z1 = z0 + size;
    const v00 = vertex(x0, GROUND_Y, z0, grassAt(x0, z0, c, ground), 0, 1, 0);
    const v01 = vertex(x0, GROUND_Y, z1, grassAt(x0, z1, c, ground), 0, 1, 0);
    const v10 = vertex(x1, GROUND_Y, z0, grassAt(x1, z0, c, ground), 0, 1, 0);
    const v11 = vertex(x1, GROUND_Y, z1, grassAt(x1, z1, c, ground), 0, 1, 0);
    indices.push(v00, v01, v10, v10, v01, v11);
  };
  const covered = new Set<number>();
  for (let r = spec.r0; r <= spec.r1; r++) {
    for (let col = spec.c0; col <= spec.c1; col++) {
      if (covered.has(cellKey(r, col)) || !present(r, col)) continue;
      const far = r < nearR0 || r > nearR1 || col < nearC0 || col > nearC1;
      const rim = Math.min(r - spec.r0, spec.r1 - r, col - spec.c0, spec.c1 - col) < 3;
      // A block only where all of it is far from the board, away from the rim, inside the island and not yet drawn.
      if (far && !rim && (r - spec.r0) % BLOCK === 0 && (col - spec.c0) % BLOCK === 0 && solid(r, col, BLOCK)) {
        let free = true;
        let nearBoard = false;
        for (let dr = 0; dr < BLOCK && free; dr++) {
          for (let dc = 0; dc < BLOCK; dc++) {
            const rr = r + dr;
            const cc = col + dc;
            if (covered.has(cellKey(rr, cc))) free = false;
            if (rr >= nearR0 && rr <= nearR1 && cc >= nearC0 && cc <= nearC1) nearBoard = true;
            const edge = Math.min(rr - spec.r0, spec.r1 - rr, cc - spec.c0, spec.c1 - cc) < 3;
            if (edge) nearBoard = true;
          }
        }
        if (free && !nearBoard) {
          quad(r, col, BLOCK);
          for (let dr = 0; dr < BLOCK; dr++) for (let dc = 0; dc < BLOCK; dc++) covered.add(cellKey(r + dr, col + dc));
          continue;
        }
      }
      const x0 = col - cols / 2;
      const z0 = r - rows / 2;
      const x1 = x0 + 1;
      const z1 = z0 + 1;
      quad(r, col, 1);
      // Earth sides wherever the neighbouring cell is missing (outer edge or pit wall).
      const sides: [number, number, number, number, number, number][] = [
        // [dr, dc, ax, az, bx, bz]: neighbour offset and the edge's two corners
        [-1, 0, x0, z0, x1, z0],
        [1, 0, x0, z1, x1, z1],
        [0, -1, x0, z0, x0, z1],
        [0, 1, x1, z0, x1, z1],
      ];
      for (const [dr, dc, ax, az, bx, bz] of sides) {
        if (present(r + dr, col + dc)) continue;
        const nx = dc;
        const nz = dr;
        const inPit = spec.pit.has(cellKey(r + dr, col + dc));
        const depth = inPit ? PIT_DEPTH : ISLAND_DEPTH;
        const top = inPit ? PIT_WALL_TOP : ground.rimTop;
        const bottom = inPit ? PIT_WALL_BOTTOM : ground.rimBottom;
        const a0 = vertex(ax, GROUND_Y, az, top, nx, 0, nz);
        const b0 = vertex(bx, GROUND_Y, bz, top, nx, 0, nz);
        const a1 = vertex(ax, GROUND_Y - depth, az, bottom, nx, 0, nz);
        const b1 = vertex(bx, GROUND_Y - depth, bz, bottom, nx, 0, nz);
        indices.push(a0, a1, b0, b0, a1, b1); // drawn double-sided
      }
    }
  }

  // The floor of the hole: dark, so it reads as depth rather than as a pale patch of sky.
  for (const key of spec.pit) {
    const r = Math.floor(key / 1000) - 500;
    const col = (key % 1000) - 500;
    const x0 = col - cols / 2;
    const z0 = r - rows / 2;
    const y = GROUND_Y - PIT_DEPTH;
    const v00 = vertex(x0, y, z0, PIT_BOTTOM, 0, 1, 0);
    const v01 = vertex(x0, y, z0 + 1, PIT_BOTTOM, 0, 1, 0);
    const v10 = vertex(x0 + 1, y, z0, PIT_BOTTOM, 0, 1, 0);
    const v11 = vertex(x0 + 1, y, z0 + 1, PIT_BOTTOM, 0, 1, 0);
    indices.push(v00, v01, v10, v10, v01, v11);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
