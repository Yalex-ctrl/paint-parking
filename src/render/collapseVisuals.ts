import * as THREE from 'three';

/**
 * What a collapsing tile looks like, before and after: sharp cracks over the tile (one texture, baked once and shared by every such
 * tile of every level), and the hole it leaves (an irregular rim in the colour of the wood and a dark, deep-looking inside).
 * There is no canvas to draw on in React Native, so the cracks are strokes measured texel by texel, like the "x2".
 */
const SIZE = 128;

type Pt = [number, number];

/** A few jagged cracks starting near the middle of the tile (fixed: the same texture everywhere). */
const CRACKS: Pt[][] = [
  [[0.5, 0.52], [0.42, 0.62], [0.36, 0.7], [0.2, 0.78], [0.08, 0.9]],
  [[0.5, 0.52], [0.6, 0.45], [0.7, 0.4], [0.78, 0.3], [0.92, 0.2]],
  [[0.5, 0.52], [0.46, 0.4], [0.5, 0.28], [0.44, 0.14], [0.46, 0.04]],
  [[0.36, 0.7], [0.4, 0.82], [0.34, 0.95]],
  [[0.7, 0.4], [0.82, 0.5], [0.95, 0.46]],
  [[0.5, 0.52], [0.62, 0.62], [0.7, 0.78], [0.8, 0.9]],
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** Distance from a point of the unit tile to the nearest crack. */
export function distanceToCrack(u: number, v: number): number {
  let best = Infinity;
  for (const c of CRACKS) for (let i = 0; i + 1 < c.length; i++) best = Math.min(best, segDist(u, v, c[i], c[i + 1]));
  return best;
}

/** The colour of a texel: a near-black line with soft edges, transparent elsewhere. */
export function crackTexel(u: number, v: number): [number, number, number, number] {
  const d = distanceToCrack(u, v);
  const core = Math.max(0, Math.min(1, (0.016 - d) / 0.008 + 0.5));
  const halo = Math.max(0, Math.min(1, (0.034 - d) / 0.02)) * 0.28;
  return [34, 24, 20, 255 * Math.max(core * 0.92, halo)];
}

let shared: THREE.DataTexture | null = null;
export function crackTexture(): THREE.DataTexture {
  if (shared) return shared;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = crackTexel((x + 0.5) / SIZE, (y + 0.5) / SIZE);
      const k = (y * SIZE + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  shared = tex;
  return tex;
}

let crackPlane: THREE.PlaneGeometry | null = null;
export function crackGeometry(): THREE.PlaneGeometry {
  if (!crackPlane) {
    crackPlane = new THREE.PlaneGeometry(0.94, 0.94);
    crackPlane.rotateX(-Math.PI / 2);
  }
  return crackPlane;
}

/** A small deterministic noise in [-1, 1] for the irregular rim. */
const noise = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

const SIDES = 14;
let hole: THREE.BufferGeometry | null = null;

/**
 * The hole left by a tile: an irregular rim of wood (flat, at the level of the floor) around a dark inside whose colour goes from
 * brown at the edge to black in the middle, so it reads as deep. Both flat: the depth is in the colours.
 */
export function holeGeometry(): THREE.BufferGeometry {
  if (hole) return hole;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const wood = new THREE.Color('#c79a62');
  const edge = new THREE.Color('#2e2018');
  const deep = new THREE.Color('#000000');
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
    return positions.length / 3 - 1;
  };
  const centre = push(0, -0.1, 0, deep);
  const inner: number[] = [];
  const mid: number[] = [];
  const outer: number[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const rOut = 0.5 + 0.045 * noise(i, 1);
    const rIn = 0.37 + 0.05 * noise(i, 2);
    const rMid = rIn * 0.62;
    outer.push(push(Math.cos(a) * rOut, 0.004, Math.sin(a) * rOut, wood));
    inner.push(push(Math.cos(a) * rIn, -0.1, Math.sin(a) * rIn, edge));
    mid.push(push(Math.cos(a) * rMid, -0.1, Math.sin(a) * rMid, edge.clone().lerp(deep, 0.6)));
  }
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES;
    // rim (wood) from the outer edge down to the inside
    index.push(outer[i], outer[j], inner[i], inner[i], outer[j], inner[j]);
    // inside: edge colour to black
    index.push(inner[i], inner[j], mid[i], mid[i], inner[j], mid[j]);
    index.push(mid[i], mid[j], centre);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  hole = g;
  return g;
}

let crackMat: THREE.MeshBasicMaterial | null = null;
export const crackMaterial = () => (crackMat ??= new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, toneMapped: false }));
let holeMat: THREE.MeshBasicMaterial | null = null;
export const holeMaterial = () => (holeMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
