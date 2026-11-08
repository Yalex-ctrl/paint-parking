import * as THREE from 'three';

import { SIDEWALK } from './coords';
import type { Level } from '../game/types';

/** Angle between the view direction and the ground (90 would be straight down). */
export const CAMERA_TILT_DEG = 55;
/** Share of the screen width the lot (with its sidewalk) should fill. */
const TARGET_WIDTH = 0.9;
/** How high the things worth framing go above the ground. */
const FRAME_H = 0.7;

export type Margins = { top: number; bottom: number };

const CORNER = new THREE.Vector3();
const DIR = new THREE.Vector3();

/**
 * Tilted perspective camera aimed at the lot. The distance is computed from the grid size so the lot (and its sidewalk) fills ~90 %
 * of the width, or less on short screens where the height is the limit; the point looked at then slides along the ground to centre
 * it in the free band between the header and the buttons. Same angle and same framing as Paint Maze.
 */
export function fitCamera(camera: THREE.PerspectiveCamera, level: Pick<Level, 'rows' | 'cols'>, width: number, height: number, margins: Margins): { dist: number; shiftZ: number } {
  const tilt = THREE.MathUtils.degToRad(CAMERA_TILT_DEG);
  DIR.set(0, Math.sin(tilt), Math.cos(tilt));
  const hw = level.cols / 2 + SIDEWALK;
  const hd = level.rows / 2 + SIDEWALK;
  const corners: [number, number, number][] = [];
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, FRAME_H]) corners.push([x, y, z]);

  camera.fov = 40;
  camera.aspect = width / height;
  camera.near = 0.1;
  camera.far = 300;
  camera.clearViewOffset();

  const measure = (dist: number, shiftZ = 0) => {
    camera.position.set(0, 0, shiftZ).addScaledVector(DIR, dist);
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

  // Centre the lot in the free band by sliding the point looked at along the ground (same tilt, same distance).
  const bandCentrePx = (margins.top + (height - margins.bottom)) / 2;
  const targetNdc = 1 - (2 * bandCentrePx) / height;
  const offCentre = (shiftZ: number) => {
    const m = measure(dist, shiftZ);
    return (m.maxY + m.minY) / 2 - targetNdc; // > 0: the lot sits too high
  };
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

/** Where the lot is on the screen, top and bottom edge in pixels (what is free above and under it is where a text may go). */
export function lotBandPx(level: Pick<Level, 'rows' | 'cols'>, width: number, height: number, margins: Margins): { top: number; bottom: number } {
  const camera = new THREE.PerspectiveCamera();
  fitCamera(camera, level, width, height, margins);
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [-hw, hw]) {
    for (const z of [-hd, hd]) {
      CORNER.set(x, 0, z).project(camera);
      minY = Math.min(minY, CORNER.y);
      maxY = Math.max(maxY, CORNER.y);
    }
  }
  return { top: ((1 - maxY) / 2) * height, bottom: ((1 - minY) / 2) * height };
}
