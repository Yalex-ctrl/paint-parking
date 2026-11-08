import * as THREE from 'three';

import type { Level } from '../game/types';
import { BASE_Y } from './coords';
import { topHeight } from './heights';

/** Angle between the view direction and the ground (90 would be straight down). */
export const CAMERA_TILT_DEG = 65;
/** Share of the screen width the board should fill (the labyrinth is as big as the screen allows). */
const TARGET_WIDTH = 0.9;

export type Margins = { top: number; bottom: number };

const CORNER = new THREE.Vector3();

/**
 * Tilted perspective camera aimed at the board centre. The distance is computed
 * from the grid size so the board fills ~88 % of the width (or less on short
 * screens, where the height is the limit); a view offset then centres it
 * vertically in the free band between the header and the buttons.
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  level: Level,
  width: number,
  height: number,
  margins: Margins,
  /** Degrees lower than the usual angle (the level's own `camTilt` by default): more of the sides of the platforms and chutes. */
  tiltExtra: number = level.camTilt ?? 0,
): { dist: number; shiftZ: number } {
  const tilt = THREE.MathUtils.degToRad(CAMERA_TILT_DEG - tiltExtra);
  const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  const corners: [number, number, number][] = [];
  // The frame includes the chutes and the platforms (the height is the walls' when there are none: the old framing is unchanged).
  const top = topHeight(level);
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [BASE_Y, top]) corners.push([x, y, z]);

  camera.fov = 40;
  camera.aspect = width / height;
  camera.near = 0.1;
  camera.far = 300;
  camera.clearViewOffset();

  /** Places the camera at `dist` looking at (0, 0, shiftZ) and returns the board's NDC bounds. */
  const measure = (dist: number, shiftZ = 0) => {
    camera.position.set(0, 0, shiftZ).addScaledVector(dir, dist);
    camera.lookAt(0, 0, shiftZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let maxX = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y, z] of corners) {
      CORNER.set(x, y, z).project(camera);
      maxX = Math.max(maxX, Math.abs(CORNER.x));
      minY = Math.min(minY, CORNER.y);
      maxY = Math.max(maxY, CORNER.y);
    }
    return { maxX, minY, maxY };
  };

  const availablePx = Math.max(1, height - margins.top - margins.bottom);
  let dist = 4;
  for (; dist < 200; dist += 0.1) {
    const m = measure(dist);
    const boardPx = ((m.maxY - m.minY) / 2) * height;
    if (m.maxX <= TARGET_WIDTH && boardPx <= availablePx * 0.97) break;
  }

  // Centre the board in the free band between header and buttons by sliding the point the
  // camera looks at along the ground (same tilt, same distance). Pure camera pose: no
  // projection tricks that something else could reset.
  const bandCentrePx = (margins.top + (height - margins.bottom)) / 2;
  const targetNdc = 1 - (2 * bandCentrePx) / height;
  const offCentre = (shiftZ: number) => {
    const m = measure(dist, shiftZ);
    return (m.maxY + m.minY) / 2 - targetNdc; // > 0: board sits too high
  };
  // Looking further toward the viewer (+z) moves the board up the screen, so a board that is
  // too high needs a smaller shift.
  let lo = -dist;
  let hi = dist;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (offCentre(mid) > 0) hi = mid;
    else lo = mid;
  }
  const shiftZ = (lo + hi) / 2;
  measure(dist, shiftZ);
  return { dist, shiftZ };
}

/**
 * Where the board is on the screen, top and bottom edge in pixels (the same camera as the one that frames it): what is free above
 * and under it is where a text may go without covering a wall.
 */
export function boardBandPx(level: Level, width: number, height: number, margins: Margins): { top: number; bottom: number } {
  const camera = new THREE.PerspectiveCamera();
  fitCamera(camera, level, width, height, margins);
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [-hw, hw]) {
    for (const z of [-hd, hd]) {
      for (const y of [BASE_Y, topHeight(level)]) {
        CORNER.set(x, y, z).project(camera);
        minY = Math.min(minY, CORNER.y);
        maxY = Math.max(maxY, CORNER.y);
      }
    }
  }
  return { top: ((1 - maxY) / 2) * height, bottom: ((1 - minY) / 2) * height };
}
