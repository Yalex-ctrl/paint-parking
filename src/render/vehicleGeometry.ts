import * as THREE from 'three';
import type { SkinSpec } from './skinSpecs';

import { box, cylinder, flatShape, merge, sphere, wheel } from './geo';

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
/** A vehicle is 78 % of a place wide and 90 % of its length long: the asphalt and the lines show all round it. */
export const WIDTH = 0.78;
const CELL_FILL = 0.9;

export function carGeometry(len: 2 | 3): THREE.BufferGeometry {
  const L = len * CELL_FILL;
  const W = WIDTH;
  const parts: THREE.BufferGeometry[] = [];
  // Chassis and bonnet.
  parts.push(box(L, 0.2, W, 0, 0.22, 0, BODY));
  if (len === 2) {
    // Cabin toward the rear: glass all round, a roof on top, the windscreen faces forward.
    parts.push(box(L * 0.58, 0.2, W * 0.9, -L * 0.06, 0.42, 0, GLASS));
    parts.push(box(L * 0.52, 0.05, W * 0.82, -L * 0.07, 0.54, 0, ROOF));
    // A pillar between the windscreen and the roof leans forward.
    parts.push(box(0.06, 0.18, W * 0.86, L * 0.24, 0.42, 0, BODY));
  } else {
    // Truck: a cab at the front and a box for the load behind it.
    parts.push(box(L * 0.3, 0.3, W * 0.96, L * 0.33, 0.47, 0, BODY));
    parts.push(box(L * 0.04, 0.17, W * 0.88, L * 0.48, 0.5, 0, GLASS));
    parts.push(box(L * 0.62, 0.42, W * 0.98, -L * 0.2, 0.53, 0, ROOF));
  }
  // The wheels are not part of the body: they turn and the front ones steer (see `wheelGeometry`).
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

/* ------------------------------------------------------------------------------------------ skins */

/**
 * A vehicle of the shop: the same shape as `carGeometry`, but every colour is in the geometry (nothing is tinted by an instance),
 * with the marks of its skin on top (a light bar, a sign, stripes, spots...). Used for the one vehicle that wears the equipped skin.
 */
export function skinGeometry(spec: SkinSpec, len: 2 | 3): THREE.BufferGeometry {
  const L = len * CELL_FILL;
  const W = WIDTH;
  const parts: THREE.BufferGeometry[] = [];
  const topY = 0.325;
  const roofTop = len === 2 ? 0.565 : 0.74;
  const x = (frac: number) => L * frac;
  parts.push(box(L, 0.2, W, 0, 0.22, 0, spec.body));
  if (len === 2) {
    const tall = spec.extras.includes('tallroof');
    const cabH = tall ? 0.4 : 0.2;
    parts.push(box(L * 0.58, cabH, W * 0.9, x(-0.06), 0.32 + cabH / 2, 0, GLASS));
    if (spec.extras.includes('roundroof')) parts.push(sphere(0.3, x(-0.1), 0.5, 0, spec.roof));
    else parts.push(box(L * 0.52, 0.05, W * 0.82, x(-0.07), 0.32 + cabH + 0.025, 0, spec.roof));
    parts.push(box(0.06, cabH - 0.02, W * 0.86, x(0.24), 0.32 + cabH / 2, 0, spec.body));
  } else {
    parts.push(box(x(0.3), 0.3, W * 0.96, x(0.33), 0.47, 0, spec.body));
    parts.push(box(x(0.04), 0.17, W * 0.88, x(0.48), 0.5, 0, GLASS));
    parts.push(box(x(0.62), 0.42, W * 0.98, x(-0.2), 0.53, 0, spec.roof));
  }
  for (const side of [-1, 1]) {
    parts.push(box(0.06, 0.08, 0.13, L / 2 + 0.005, 0.25, side * W * 0.3, HEAD));
    parts.push(box(0.06, 0.08, 0.13, -L / 2 - 0.005, 0.25, side * W * 0.3, TAIL));
  }
  const top = spec.extras.includes('tallroof') ? 0.76 : roofTop;
  for (const e of spec.extras) {
    switch (e) {
      case 'lightbar':
        parts.push(box(0.1, 0.06, 0.16, x(-0.3), top + 0.04, -0.13, '#e03a3a'));
        parts.push(box(0.1, 0.06, 0.16, x(-0.3), top + 0.04, 0.13, '#3a6ae0'));
        break;
      case 'sign':
        parts.push(box(0.14, 0.08, 0.2, x(-0.3), top + 0.05, 0, '#fff7c2'));
        break;
      case 'cross':
        for (const side of [-1, 1]) {
          parts.push(box(0.26, 0.07, 0.02, x(-0.12), 0.34, side * (W / 2 + 0.005), spec.accent));
          parts.push(box(0.07, 0.26, 0.02, x(-0.12), 0.34, side * (W / 2 + 0.005), spec.accent));
        }
        break;
      case 'ladder':
        for (const z of [-0.33, 0.33]) parts.push(box(L * 0.55, 0.05, 0.04, x(-0.2), top + 0.03, z, '#c8ccd4'));
        break;
      case 'cone':
        parts.push(cylinder(0.09, 0, 0.16, x(-0.3), top - 0.02, 0, '#e8c07a', 8));
        parts.push(sphere(0.1, x(-0.3), top + 0.2, 0, '#ff8fb8'));
        break;
      case 'spoiler':
        parts.push(box(0.1, 0.03, W * 0.9, -L / 2 + 0.06, 0.5, 0, spec.accent));
        for (const side of [-1, 1]) parts.push(box(0.03, 0.12, 0.03, -L / 2 + 0.06, 0.42, side * W * 0.3, spec.body));
        break;
      case 'stripes':
        for (const z of [-0.09, 0.09]) parts.push(box(L * 0.98, 0.012, 0.07, 0, topY + 0.004, z, spec.accent));
        break;
      case 'bands':
        for (const side of [-1, 1]) parts.push(box(L * 0.9, 0.06, 0.012, 0, 0.27, side * (W / 2 + 0.003), spec.accent));
        break;
      case 'camo':
        [
          [-0.3, 0.12, 0.18, 0.12],
          [0.1, -0.15, 0.2, 0.14],
          [0.32, 0.1, 0.14, 0.1],
          [-0.05, 0.05, 0.12, 0.1],
        ].forEach(([fx, z, w, d]) => parts.push(box(w, 0.012, d, x(fx), topY + 0.004, z, spec.accent)));
        break;
      case 'zebra':
        for (let i = -3; i <= 3; i++) parts.push(box(0.07, 0.012, W * 0.98, i * L * 0.13, topY + 0.004, 0, spec.accent));
        break;
      case 'spots':
        [
          [-0.3, 0.12],
          [0.0, -0.15],
          [0.3, 0.1],
          [-0.15, -0.05],
          [0.15, 0.2],
        ].forEach(([fx, z]) => parts.push(cylinder(0.05, 0.05, 0.012, x(fx), topY, z, spec.accent, 6)));
        break;
      case 'flames':
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) parts.push(box(0.16 - i * 0.03, 0.05 + i * 0.03, 0.012, x(0.3 - i * 0.14), 0.27 + i * 0.01, side * (W / 2 + 0.003), spec.accent));
        }
        break;
      case 'stars':
        [
          [-0.3, 0.1],
          [-0.1, -0.2],
          [0.15, 0.15],
          [0.3, -0.1],
          [0.0, 0.0],
        ].forEach(([fx, z]) => parts.push(box(0.04, 0.012, 0.04, x(fx), topY + 0.004, z, spec.accent)));
        break;
      case 'dots':
        [
          [-0.3, 0.15],
          [-0.3, -0.15],
          [0.05, 0.12],
          [0.05, -0.12],
          [0.3, 0.0],
        ].forEach(([fx, z]) => parts.push(cylinder(0.06, 0.06, 0.012, x(fx), topY, z, spec.accent, 8)));
        break;
      case 'checker':
        for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) parts.push(box(0.09, 0.05, 0.012, i * 0.1, 0.27, side * (W / 2 + 0.003), i % 2 === 0 ? '#1a1a1a' : '#ffffff'));
        break;
      case 'rollbar':
        for (const side of [-1, 1]) parts.push(box(0.03, 0.26, 0.03, x(-0.3), 0.45, side * W * 0.4, '#2b2f1c'));
        parts.push(box(0.03, 0.03, W * 0.8, x(-0.3), 0.58, 0, '#2b2f1c'));
        break;
      case 'bed':
        parts.push(box(L * 0.34, 0.04, W * 0.8, x(-0.28), 0.33, 0, spec.accent));
        break;
      case 'eyes':
        for (const side of [-1, 1]) parts.push(box(0.05, 0.05, 0.05, x(0.2), 0.58, side * 0.12, '#ffffff'));
        break;
      default:
        break;
    }
  }
  return merge(parts);
}

/* ------------------------------------------------------------------------------------------ the arrow on the roof */

/** The big arrow painted on the roof of a vehicle, pointing along +X (its front): white with a dark outline, readable from afar. */
export function arrowGeometry(): THREE.BufferGeometry {
  const shape = (k: number, grow: number): [number, number][] => [
    [-0.42 * k - grow, -0.1 * k - grow],
    [0.06 * k, -0.1 * k - grow],
    [0.06 * k, -0.25 * k - grow],
    [0.46 * k + grow * 1.6, 0],
    [0.06 * k, 0.25 * k + grow],
    [0.06 * k, 0.1 * k + grow],
    [-0.42 * k - grow, 0.1 * k + grow],
  ];
  return merge([flatShape(shape(1, 0.05), 0, 0, 0, 0, '#241d3d'), flatShape(shape(1, 0), 0, 0.006, 0, 0, '#ffffff')]);
}

/** How high the top of the roof of a vehicle is (where its arrow is laid). */
export function roofTop(spec: SkinSpec | null, len: 2 | 3): number {
  if (len === 3) return 0.745;
  if (spec?.extras.includes("tallroof")) return 0.775;
  if (spec?.extras.includes("roundroof")) return 0.62;
  return 0.575;
}

/* ------------------------------------------------------------------------------------------ the wheels */

/** Where the wheels of a vehicle are, in its own frame (front along +X), and which ones steer. */
export function wheelLayout(len: 2 | 3): { x: number; z: number; front: boolean }[] {
  const L = len * CELL_FILL;
  const xs = len === 2 ? [L * 0.3, -L * 0.3] : [L * 0.36, -L * 0.18, -L * 0.36];
  const out: { x: number; z: number; front: boolean }[] = [];
  xs.forEach((x, i) => {
    for (const side of [-1, 1]) out.push({ x, z: side * WIDTH * 0.5, front: i === 0 });
  });
  return out;
}

/** One wheel, with its axle along Z; every wheel of every vehicle is an instance of it. */
export function wheelGeometry(): THREE.BufferGeometry {
  return merge([wheel(WHEEL_R, 0.1, 0, 0, 0, TYRE), wheel(WHEEL_R * 0.55, 0.108, 0, 0, 0, '#b9bdc9')]);
}

/** Radius of a wheel, and the height of its axle above the ground. */
export const WHEEL_R = 0.13;
export const WHEEL_Y = 0.13;
