import * as THREE from 'three';

import { vehicleCells, type Level } from '../game/types';
import type { GameState } from '../game/engine';

/** How far (in places) from a vehicle a touch still selects it. */
export const PICK_TOLERANCE = 0.3;

/**
 * Which vehicle a touch is on. `x`, `z` are the world coordinates of the touch on the plane of the lot (the camera ray cut with the
 * ground, see ParkingCanvas.createPickBridge); a place is 1 x 1 and the lot is centred on the origin. A touch on a vehicle takes it;
 * a touch within `tolerance` of the edge of a vehicle takes it too (the nearest one when several are that close). A vehicle that has
 * left cannot be picked. Returns the vehicle id or -1.
 */
export function pickVehicle(level: Pick<Level, 'rows' | 'cols' | 'vehicles'>, state: Pick<GameState, 'gone'>, x: number, z: number, tolerance = PICK_TOLERANCE): number {
  const px = x + level.cols / 2;
  const pz = z + level.rows / 2;
  let best = -1;
  let bestDistance = tolerance + 1e-9;
  for (const v of level.vehicles) {
    if (state.gone[v.id]) continue;
    const cells = vehicleCells(v);
    const r0 = Math.min(...cells.map(([r]) => r));
    const r1 = Math.max(...cells.map(([r]) => r)) + 1;
    const c0 = Math.min(...cells.map(([, c]) => c));
    const c1 = Math.max(...cells.map(([, c]) => c)) + 1;
    const dx = Math.max(c0 - px, 0, px - c1);
    const dz = Math.max(r0 - pz, 0, pz - r1);
    const d = Math.hypot(dx, dz);
    if (d < bestDistance) {
      best = v.id;
      bestDistance = d;
    }
  }
  return best;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Where a point of the screen (pixels, from the top left of the canvas) falls on the horizontal plane `planeY` above the ground: the
 * camera ray cut with the plane (the touch positions come from react-native-gesture-handler, never from the pointer events of
 * react-three-fiber, which are not reliable in a native canvas). Null when the ray does not meet the plane.
 */
export function screenToGround(camera: THREE.Camera, width: number, height: number, x: number, y: number, planeY = 0.3, out = { x: 0, z: 0 }): { x: number; z: number } | null {
  if (width <= 0 || height <= 0) return null;
  ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -planeY;
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  out.x = hit.x;
  out.z = hit.z;
  return out;
}
