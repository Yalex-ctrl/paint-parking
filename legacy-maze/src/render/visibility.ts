import * as THREE from 'three';

import { isPresentCell } from '../game/silhouette';
import type { Level } from '../game/types';
import { fitCamera, type Margins } from './cameraFit';
import { BASE_Y, PLATEAU_H, WALL_H, cellX, cellZ } from './coords';
import { tallWalls } from './heights';
import { SLIDE_R, slideLine } from './slidePath';

/** The chute is open (its arches only draw the outline) and its floor is under the ball: a sphere a little smaller than its radius. */
const CHUTE_SPHERE = SLIDE_R * 0.9;
/** The arches start this far from each end of the trough (the same as in slideGeometry). */
const ARCH_ZONE = 1.15;

/**
 * Is every floor tile of a level really visible, with the tilted camera of the game? Walls, platforms and chutes can hide the tile
 * behind them: this casts a ray from the middle of every floor tile (the platform tiles at their own height, a ramp at half height)
 * to the camera and looks for anything in between. A level that hides a tile is not a level: the generator rejects it.
 *
 * The occluders are the ones the renderer draws: the walls (WALL_H high), the platforms (PLATEAU_H high, a whole tile), the chute
 * of each slide (a tube along its centre line). The walls next to a platform keep their height, so they never hide the platform.
 */
export const VISIBILITY_VIEWPORT = { width: 390, height: 844 };
export const VISIBILITY_MARGINS: Margins = { top: 130, bottom: 170 };
/** The occluders are made a little fatter than they are: a tile must be visible with room to spare. */
export const VISIBILITY_MARGIN = 0.06;

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; r: number; c: number };

const hitsBox = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): boolean => {
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.x0, b.x1],
    [oy, dy, b.y0, b.y1],
    [oz, dz, b.z0, b.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t0 = (lo - o) / d;
      let t1 = (hi - o) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return false;
    }
  }
  return true;
};

const hitsSphere = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, rad: number): boolean => {
  const mx = ox - cx;
  const my = oy - cy;
  const mz = oz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - rad * rad;
  const disc = b * b - a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / a;
  const t2 = (-b + Math.sqrt(disc)) / a;
  return (t > 0 && t < 1) || (t2 > 0 && t2 < 1 && t < 0);
};

/**
 * The floor tiles (row * cols + col) that a PLATFORM or a CHUTE hides from the camera of the game. A wall already hides a little of
 * the tile behind it at the far end of the board (that has always been so, and the game was designed with it): only what a platform
 * or a chute adds to it counts, so a level is rejected when the new mechanics hide a tile that the walls alone would show.
 */
export function hiddenFloorCells(level: Level, viewport = VISIBILITY_VIEWPORT, margins = VISIBILITY_MARGINS, tiltExtra: number = level.camTilt ?? 0): number[] {
  const camera = new THREE.PerspectiveCamera();
  fitCamera(camera, level, viewport.width, viewport.height, margins, tiltExtra);
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  const m = VISIBILITY_MARGIN;
  const f = level.features;
  if (!(f.raised ?? []).length && !(f.slides ?? []).length) return [];
  const fragile = new Set(f.fragile.map(([r, c]) => r * level.cols + c));
  const raised = new Set((f.raised ?? []).map(([r, c]) => r * level.cols + c));
  const rampAt = new Set((f.ramps ?? []).map((k) => k.r * level.cols + k.c));

  const walls: Box[] = [];
  const boxes: Box[] = [];
  const tall = tallWalls(level);
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const i = r * level.cols + c;
      const wall = (level.grid[r][c] === '#' && isPresentCell(level, r, c)) || fragile.has(i);
      if (wall) {
        walls.push({ x0: cellX(level, c) - 0.5, x1: cellX(level, c) + 0.5, y0: BASE_Y, y1: WALL_H, z0: cellZ(level, r) - 0.5, z1: cellZ(level, r) + 0.5, r, c });
        // The walls that hold up a platform are taller: what that adds is counted like the platform itself.
        if (tall.has(i)) boxes.push({ x0: cellX(level, c) - 0.5 - m, x1: cellX(level, c) + 0.5 + m, y0: BASE_Y, y1: WALL_H + PLATEAU_H, z0: cellZ(level, r) - 0.5 - m, z1: cellZ(level, r) + 0.5 + m, r, c });
      } else if (raised.has(i)) {
        boxes.push({ x0: cellX(level, c) - 0.5 - m, x1: cellX(level, c) + 0.5 + m, y0: BASE_Y, y1: PLATEAU_H, z0: cellZ(level, r) - 0.5 - m, z1: cellZ(level, r) + 0.5 + m, r, c });
      }
    }
  }
  const spheres: [number, number, number, number][] = [];
  for (const s of f.slides ?? []) {
    // The chute starts at the edge of its entry tile and ends at the edge of its exit tile: the ball is on those tiles, not the tube.
    const inside = (p: [number, number, number], cell: readonly [number, number]) => Math.abs(p[0] - cellX(level, cell[1])) <= 0.5 && Math.abs(p[2] - cellZ(level, cell[0])) <= 0.5;
    const line = slideLine(level, s, 6);
    line.points.forEach((p, i) => {
      if (inside(p, s.entry) || inside(p, s.exit)) return;
      const d = line.along[i];
      if (d >= line.entryPlane + ARCH_ZONE && d <= line.exitPlane - ARCH_ZONE) {
        // Under the arches: the ball and the rims and the outline of the arches over it.
        spheres.push([p[0], p[1] - 0.04, p[2], CHUTE_SPHERE]);
      } else {
        // At the ends there are no arches: only the rims (low) and the floor.
        spheres.push([p[0], line.floor[i] + 0.2, p[2], 0.4]);
      }
    });
  }

  const hidden: number[] = [];
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const i = r * level.cols + c;
      if (level.grid[r][c] !== '.' && !fragile.has(i)) continue;
      const y = (raised.has(i) ? PLATEAU_H : rampAt.has(i) ? PLATEAU_H / 2 : 0) + 0.02;
      const ox = cellX(level, c);
      const oz = cellZ(level, r);
      const dx = cx - ox;
      const dy = cy - y;
      const dz = cz - oz;
      // Already hidden by the walls alone (as if the tile were on the low floor): the game has always been like that, nothing to add.
      if (walls.some((b) => hitsBox(ox, 0.02, oz, dx, cy - 0.02, dz, b))) continue;
      let seen = true;
      for (const b of boxes) {
        if (b.r === r && b.c === c) continue; // the tile's own platform
        if (hitsBox(ox, y, oz, dx, dy, dz, b)) {
          seen = false;
          break;
        }
      }
      if (seen) {
        for (const [sx, sy, sz, sr] of spheres) {
          if (hitsSphere(ox, y, oz, dx, dy, dz, sx, sy, sz, sr + m)) {
            seen = false;
            break;
          }
        }
      }
      if (!seen) hidden.push(i);
    }
  }
  return hidden;
}

export const allFloorVisible = (level: Level): boolean => hiddenFloorCells(level).length === 0;

/** The most the camera may look lower than usual (degrees) to show the sides of platforms, ramps and chutes. */
export const MAX_EXTRA_TILT = 5;

/**
 * How much lower than the usual angle the camera may look for this level (0 to MAX_EXTRA_TILT): the lowest angle at which every floor
 * tile is still in view. 0 for a level with nothing raised. Worked out at generation (scripts/set-camera.ts) and stored as `camTilt`.
 */
export function bestCameraTilt(level: Level): number {
  const f = level.features;
  if (!(f.raised ?? []).length && !(f.slides ?? []).length) return 0;
  for (let t = MAX_EXTRA_TILT; t >= 1; t--) {
    if (hiddenFloorCells(level, VISIBILITY_VIEWPORT, VISIBILITY_MARGINS, t).length === 0) return t;
  }
  return 0;
}
