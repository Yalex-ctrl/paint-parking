import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { DecorPart } from './models';

/**
 * Greenery built in code (bushes, flower patches, tall grass). The kit's own plants are flat leaf
 * shapes that read as stars lying on the grass, so these are small solid low-poly volumes instead.
 * Each model is ONE merged geometry with vertex colours and ONE shared material, so a whole grove
 * of them is a handful of draw calls.
 */

export const FLOWER_HEADS = {
  flowers_white: '#f6f3ee',
  flowers_pink: '#ee6fae',
  flowers_violet: '#9a6cf0',
} as const;

const GREEN_BOTTOM = new THREE.Color('#3e7d37');
const GREEN_TOP = new THREE.Color('#6fb653');

/** Deterministic pseudo-random in [0, 1) (the plants must look the same every time). */
const rnd = (n: number) => {
  const x = Math.sin(n * 91.3458 + 17.17) * 43758.5453;
  return x - Math.floor(x);
};

function colored(geo: THREE.BufferGeometry, color: (y: number) => THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getY(i));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const solid = (c: THREE.Color) => () => c;

function blob(x: number, y: number, z: number, r: number, squash = 0.85): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return colored(g, (py) => GREEN_BOTTOM.clone().lerp(GREEN_TOP, THREE.MathUtils.clamp(py / 0.7, 0, 1)));
}

/** A bush: a few overlapping rounded blobs. */
function bush(layout: [number, number, number, number][]): THREE.BufferGeometry {
  return mergeGeometries(layout.map(([x, y, z, r]) => blob(x, y, z, r)))!;
}

/** A patch of flowers: thin stems, a round head each, and a few leaves at the base. */
function flowers(headColor: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.Color('#4a9a3a');
  const head = new THREE.Color(headColor);
  const heart = new THREE.Color('#f7eec7');
  for (let k = 0; k < 6; k++) {
    const a = rnd(k) * Math.PI * 2;
    const d = 0.05 + rnd(k + 10) * 0.27;
    const h = 0.26 + rnd(k + 20) * 0.16;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const s = new THREE.CylinderGeometry(0.014, 0.018, h, 5);
    s.translate(x, h / 2, z);
    parts.push(colored(s, solid(stem)));
    const hd = new THREE.IcosahedronGeometry(0.075, 0);
    hd.scale(1, 0.7, 1);
    hd.translate(x, h + 0.01, z);
    parts.push(colored(hd, solid(head)));
    const ht = new THREE.IcosahedronGeometry(0.03, 0);
    ht.translate(x, h + 0.045, z);
    parts.push(colored(ht, solid(heart)));
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const leaf = new THREE.ConeGeometry(0.05, 0.2, 4);
    leaf.translate(0, 0.1, 0);
    leaf.rotateZ(0.7);
    leaf.rotateY(a);
    leaf.translate(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
    parts.push(colored(leaf, (y) => stem.clone().lerp(GREEN_TOP, THREE.MathUtils.clamp(y / 0.2, 0, 1))));
  }
  return mergeGeometries(parts)!;
}

/** A tuft of tall grass: a fan of slim leaning blades. */
function tallGrass(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = rnd(k + 40) * Math.PI * 2;
    const d = rnd(k + 50) * 0.17;
    const h = 0.5 + rnd(k + 60) * 0.35;
    const blade = new THREE.ConeGeometry(0.04, h, 4);
    blade.translate(0, h / 2, 0);
    blade.rotateZ((rnd(k + 70) - 0.5) * 0.7);
    blade.rotateY(a);
    blade.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(colored(blade, (y) => GREEN_BOTTOM.clone().lerp(GREEN_TOP, THREE.MathUtils.clamp(y / 0.7, 0, 1))));
  }
  return mergeGeometries(parts)!;
}

/** A low sand dune: a squashed, slightly lumpy mound, lighter on top (tinted by the world's ground colour). */
function dune(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = Math.max(pos.getY(i), -0.1);
    const z = pos.getZ(i);
    const lump = 1 + 0.08 * Math.sin(x * 5 + z * 3) * Math.cos(z * 4);
    pos.setXYZ(i, x * w * lump, y * h, z * w * 0.8 * lump);
  }
  return colored(g, (py) => new THREE.Color('#d9c47e').lerp(new THREE.Color('#fff1b8'), THREE.MathUtils.clamp(py / h, 0, 1)));
}

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
const IDENTITY = new THREE.Matrix4();

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  bush_round: () =>
    bush([
      [0, 0.3, 0, 0.36],
      [-0.3, 0.24, 0.1, 0.27],
      [0.3, 0.22, -0.05, 0.29],
      [0.05, 0.22, 0.3, 0.25],
      [-0.05, 0.32, -0.26, 0.23],
    ]),
  bush_wide: () =>
    bush([
      [-0.38, 0.22, 0, 0.26],
      [-0.1, 0.28, 0.05, 0.32],
      [0.2, 0.24, -0.04, 0.3],
      [0.48, 0.2, 0.02, 0.24],
      [0.05, 0.4, 0.0, 0.2],
    ]),
  flowers_white: () => flowers(FLOWER_HEADS.flowers_white),
  flowers_pink: () => flowers(FLOWER_HEADS.flowers_pink),
  flowers_violet: () => flowers(FLOWER_HEADS.flowers_violet),
  grass_tall: tallGrass,
  dune_a: () => dune(1.0, 0.4),
  dune_b: () => dune(0.8, 0.3),
};

/** Names of the models built here (as opposed to loaded from a .glb). */
export const PROCEDURAL_NAMES = Object.keys(BUILDERS);

const cache = new Map<string, DecorPart[]>();

/** The parts of one procedural model (geometry and material are shared by every instance). */
export function proceduralParts(name: string): DecorPart[] {
  let parts = cache.get(name);
  if (!parts) {
    parts = [{ geometry: BUILDERS[name](), material, matrix: IDENTITY }];
    cache.set(name, parts);
  }
  return parts;
}
