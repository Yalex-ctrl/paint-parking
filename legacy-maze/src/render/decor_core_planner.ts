import * as THREE from 'three';
import { topHeight } from '../../../render/heights';

import type { Level } from '../../../game/types';
import { GROUND_Y } from '../../../render/coords';
import { convexHull, hullsOverlap, type Point } from './hull';
import { entryKeepOut, exitKeepOut, heightOf, planDecorSteps, radiusOf, type DecorTheme, type Placed } from './placement';

/** Screen band (NDC, top > bottom) in which decor is allowed: the header and the buttons stay clear. */
export type SafeBand = { top: number; bottom: number };

/** Clearance (NDC units) required between a decor piece and the playfield on screen. */
const SCREEN_MARGIN = 0.012;
/** Tallest thing that has to stay visible: the ball sitting in a corridor. */
const PLAY_TOP = 1.0;

const V = new THREE.Vector3();

/**
 * Screen-space convex hull (NDC) of an axis-aligned world box, or null when
 * any corner is behind the camera.
 */
export function projectBox(
  camera: THREE.PerspectiveCamera,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): Point[] | null {
  const pts: Point[] = [];
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) {
        V.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        if (V.z >= -camera.near) return null;
        V.set(x, y, z).project(camera);
        pts.push([V.x, V.y]);
      }
    }
  }
  return convexHull(pts);
}

/** Screen hulls of what must never be hidden: the board (and the ball in it) and the exit lane. */
export function playfieldHulls(camera: THREE.PerspectiveCamera, level: Level): Point[][] {
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  const e = exitKeepOut(level);
  const n = entryKeepOut(level);
  const hulls = [
    // As high as the highest piece of the board (a platform's walls, a chute with its arches): no scenery hides them.
    projectBox(camera, -hw, hw, GROUND_Y, Math.max(PLAY_TOP, topHeight(level) + 0.15), -hd, hd),
    projectBox(camera, e.minX, e.maxX, GROUND_Y, PLAY_TOP + 0.2, e.minZ, e.maxZ),
    ...(n ? [projectBox(camera, n.minX, n.maxX, GROUND_Y, PLAY_TOP + 0.2, n.minZ, n.maxZ)] : []),
  ];
  return hulls.filter((h): h is Point[] => h !== null);
}

export function decorHull(camera: THREE.PerspectiveCamera, p: Placed): Point[] | null {
  const r = radiusOf(p);
  return projectBox(camera, p.x - r, p.x + r, GROUND_Y, GROUND_Y + heightOf(p), p.z - r, p.z + r);
}

/**
 * Decor plan for the current camera: the world rules of `planDecor`, plus the
 * rule that a piece may not overlap the board, the ball or the exit lane on
 * screen, nor reach into the header / button bands (`safe`). Pieces that would are moved (another random spot) or dropped.
 * Camera matrices must be up to date (call after fitCamera).
 */
export function planForCamera(level: Level, camera: THREE.PerspectiveCamera, safe?: SafeBand, theme?: DecorTheme): Placed[] {
  const steps = planForCameraSteps(level, camera, safe, theme);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same, pausing every few milliseconds (see planDecorSteps). */
export function* planForCameraSteps(level: Level, camera: THREE.PerspectiveCamera, safe?: SafeBand, theme?: DecorTheme): Generator<void, Placed[], void> {
  camera.updateMatrixWorld(true);
  const keepOut = playfieldHulls(camera, level);
  return yield* planDecorSteps(level, (p) => {
    const hull = decorHull(camera, p);
    if (!hull || hull.length < 3) return false;
    // Must be at least partly on screen, otherwise it is wasted work.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of hull) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (minX >= 1 || maxX <= -1 || minY >= 1 || maxY <= -1) return false;
    // Nothing may show behind the header or the buttons.
    if (safe && (maxY > safe.top || minY < safe.bottom)) return false;
    return keepOut.every((k) => k.length >= 3 && !hullsOverlap(k, hull, SCREEN_MARGIN));
  }, theme);
}
