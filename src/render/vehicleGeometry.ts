import * as THREE from 'three';

import { box, cylinder, merge, sphere, wheel } from './geo';

/**
 * The vehicles, low poly, made in code (the Kenney Car Kit could not be downloaded here: see docs/REUSE_PLAN.md). Each kind is one
 * geometry shared by every instance; the body is white in the geometry and takes its colour from the instance, the glass, the
 * wheels and the lights keep their own. Length runs along +X, the FRONT is +X: the windscreen is there, the headlights are there,
 * and the cabin sits toward the rear so the bonnet shows which way it goes.
 */
const BODY = '#ffffff';
const ROOF = '#f3f3f3';
const GLASS = '#26324a';
const TYRE = '#1b1b22';
const HEAD = '#fff3a8';
const TAIL = '#a31822';

/** Width of the vehicles and the room left around them in their cells. */
export const WIDTH = 0.7;
const CELL_FILL = 0.9;

export function carGeometry(len: 2 | 3): THREE.BufferGeometry {
  const L = len * CELL_FILL;
  const W = WIDTH;
  const parts: THREE.BufferGeometry[] = [];
  // Chassis and bonnet.
  parts.push(box(L, 0.2, W, 0, 0.22, 0, BODY));
  if (len === 2) {
    // Cabin toward the rear: glass all round, a roof on top, the windscreen faces forward.
    parts.push(box(L * 0.48, 0.2, W * 0.88, -L * 0.08, 0.42, 0, GLASS));
    parts.push(box(L * 0.4, 0.05, W * 0.8, -L * 0.1, 0.54, 0, ROOF));
    // A pillar between the windscreen and the roof leans forward.
    parts.push(box(0.06, 0.18, W * 0.84, L * 0.17, 0.42, 0, BODY));
  } else {
    // Truck: a cab at the front and a box for the load behind it.
    parts.push(box(L * 0.3, 0.3, W * 0.96, L * 0.33, 0.47, 0, BODY));
    parts.push(box(L * 0.04, 0.17, W * 0.88, L * 0.48, 0.5, 0, GLASS));
    parts.push(box(L * 0.62, 0.42, W * 0.98, -L * 0.2, 0.53, 0, ROOF));
  }
  // Wheels.
  const axles = len === 2 ? [L * 0.3, -L * 0.3] : [L * 0.36, -L * 0.18, -L * 0.36];
  for (const x of axles) for (const side of [-1, 1]) parts.push(wheel(0.13, 0.1, x, 0.13, side * W * 0.5, TYRE));
  return merge(parts);
}

/**
 * The lights, apart from the body: they are drawn by a second mesh that follows the vehicles, because the colour of an instance would
 * tint them (pale headlights would turn dark on a blue car). Pale at the front, red at the back.
 */
export function lightsGeometry(len: 2 | 3): THREE.BufferGeometry {
  const L = len * CELL_FILL;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(box(0.06, 0.08, 0.13, L / 2 + 0.005, 0.25, side * WIDTH * 0.3, HEAD));
    parts.push(box(0.06, 0.08, 0.13, -L / 2 - 0.005, 0.25, side * WIDTH * 0.3, TAIL));
  }
  return merge(parts);
}

/** A flat dark patch under a vehicle (its shadow on the ground). */
export function shadowGeometry(len: 2 | 3): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len * CELL_FILL * 1.05, WIDTH * 1.15);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The small crown of the vehicle that wears the equipped skin: a gold ring of points on a band. */
export function crownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(0.24, 0.05, 0.24, 0, 0, 0, '#f7c531')];
  for (const [x, z] of [
    [-0.09, -0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [0.09, 0.09],
  ]) {
    parts.push(cylinder(0, 0.05, 0.1, x, 0.02, z, '#f7c531', 5));
  }
  parts.push(sphere(0.04, 0, 0.1, 0, '#ffffff'));
  return merge(parts);
}
