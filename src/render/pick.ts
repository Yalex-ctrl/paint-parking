import * as THREE from 'three';

/**
 * Which vehicle a touch is on. The touch is a point of the canvas (points, from its top left, as the gesture handler gives it): it is
 * turned into a ray from the camera that is used to draw the scene, and the ray is cast against an invisible box round each vehicle,
 * from the ground up to the top of its roof (the finger is on the roof or the body, never on the ground: projecting the touch on the
 * ground would put it a place or so too high on the screen). The vehicle hit nearest the camera is the one. Nothing hit: the vehicle
 * whose centre, on the screen, is the nearest to the finger, if it is within `NEAR_POINTS`.
 */

/** The selection box is this much bigger than the vehicle (each way). */
export const PICK_GROW = 1.1;
/** A vehicle is 90 % of its places long and 78 % of a place wide. */
const LENGTH_PER_PLACE = 0.9;
const BODY_WIDTH = 0.78;
/** From the ground to the top of the roof of a car, of a truck. */
const HEIGHT_CAR = 0.62;
const HEIGHT_TRUCK = 0.8;
/** The nearest vehicle within this many points of the finger is taken when the ray hits nothing. */
export const NEAR_POINTS = 40;

/** What the picking needs to know of a vehicle. */
/** A vehicle that is on its way out (`leaving`) no longer takes a touch: the vehicle behind it does. */
export type Pickable = { id: number; x: number; z: number; yaw: number; len: 2 | 3; hidden: boolean; leaving?: boolean };

export type Picked = { vehicle: number; via: 'ray' | 'near' | 'none'; distance: number };

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const centre = new THREE.Vector3();

/**
 * The distance along the ray (origin, dir) at which it enters the box of a vehicle, or Infinity. The box is built in the frame of
 * the vehicle: the ray is carried into it (a rotation about the vertical axis and a shift), where the box is aligned with the axes.
 */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, v: Pickable, grow = PICK_GROW): number {
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  // The vehicle faces yaw: its front is (cos yaw, 0, -sin yaw). World -> local: shift, then rotate by -yaw about Y.
  const px = ox - v.x;
  const pz = oz - v.z;
  const lx = px * c - pz * s;
  const lz = px * s + pz * c;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const halfL = (v.len * LENGTH_PER_PLACE * grow) / 2;
  const halfW = (BODY_WIDTH * grow) / 2;
  const height = (v.len === 3 ? HEIGHT_TRUCK : HEIGHT_CAR) * grow;
  let tMin = 0;
  let tMax = Infinity;
  const slab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };
  if (!slab(lx, ldx, -halfL, halfL)) return Infinity;
  if (!slab(oy, dy, 0, height)) return Infinity;
  if (!slab(lz, ldz, -halfW, halfW)) return Infinity;
  return tMin;
}

/**
 * The vehicle under a touch. `camera` is the camera the scene is drawn with (same position, same projection), `width` and `height` the
 * size of the canvas in points, `x` and `y` the touch in points from the top left of the canvas.
 */
export function pickAt(camera: THREE.Camera, width: number, height: number, x: number, y: number, vehicles: readonly Pickable[]): Picked {
  if (width <= 0 || height <= 0) return { vehicle: -1, via: 'none', distance: Infinity };
  ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  origin.copy(raycaster.ray.origin);
  dir.copy(raycaster.ray.direction);
  // First the vehicles the finger is really on (the exact boxes: what one sees is what one gets, a vehicle in front hides the one behind
  // it), then, for a finger that is a little off, the boxes 10 % bigger.
  for (const grow of [1, PICK_GROW]) {
    let best = -1;
    let bestT = Infinity;
    for (const v of vehicles) {
      if (v.hidden || v.leaving) continue;
      const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, v, grow);
      if (t < bestT) {
        bestT = t;
        best = v.id;
      }
    }
    if (best >= 0) return { vehicle: best, via: 'ray', distance: 0 };
  }
  // Nothing hit: the vehicle whose middle, on the screen, is nearest to the finger.
  let nearest = -1;
  let nearestD = NEAR_POINTS;
  for (const v of vehicles) {
    if (v.hidden || v.leaving) continue;
    centre.set(v.x, (v.len === 3 ? HEIGHT_TRUCK : HEIGHT_CAR) * 0.5, v.z).project(camera);
    const d = Math.hypot(((centre.x + 1) / 2) * width - x, ((1 - centre.y) / 2) * height - y);
    if (d < nearestD) {
      nearestD = d;
      nearest = v.id;
    }
  }
  return nearest >= 0 ? { vehicle: nearest, via: 'near', distance: nearestD } : { vehicle: -1, via: 'none', distance: Infinity };
}

/** Where a point of the world falls on the canvas (points from its top left); used to put the help on a vehicle. */
export function toCanvas(camera: THREE.Camera, width: number, height: number, x: number, y: number, z: number): { x: number; y: number } {
  centre.set(x, y, z).project(camera);
  return { x: ((centre.x + 1) / 2) * width, y: ((1 - centre.y) / 2) * height };
}
