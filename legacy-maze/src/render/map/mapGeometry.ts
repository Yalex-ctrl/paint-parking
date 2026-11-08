import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { levelPaintColor, levelPoint, STEP } from '../../game/mapLayout';

/* ---- numbers made of little cubes ---- */

/** A 3x5 pixel font for the digits: '1' is a lit cube. */
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

const CELL = 0.11;
const cache = new Map<string, THREE.BufferGeometry>();

/**
 * A number as a block of cubes, centred on the origin and lying flat (readable from the camera that looks at the map
 * from the front): the top of each digit points toward -z. Cached per text.
 */
export function numberGeometry(text: string, cell = CELL, depth = 0.1): THREE.BufferGeometry {
  const key = `${text}|${cell}|${depth}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const boxes: THREE.BufferGeometry[] = [];
  const width = text.length * 4 - 1; // 3 columns per digit and one blank between
  text.split('').forEach((ch, d) => {
    const rows = FONT[ch];
    if (!rows) return;
    rows.forEach((line, r) => {
      line.split('').forEach((bit, c) => {
        if (bit !== '1') return;
        const b = new THREE.BoxGeometry(cell * 0.94, cell * 0.94, depth);
        // XY plane (y up) first, laid flat afterwards.
        b.translate((d * 4 + c - (width - 1) / 2) * cell, (2 - r) * cell, 0);
        boxes.push(b);
      });
    });
  });
  const merged = boxes.length ? mergeGeometries(boxes)! : new THREE.BufferGeometry();
  boxes.forEach((b) => b.dispose());
  merged.rotateX(-Math.PI / 2);
  if (cache.size > 160) {
    cache.forEach((g) => g.dispose());
    cache.clear();
  }
  cache.set(key, merged);
  return merged;
}

/* ---- a 5-point star ---- */

export function starGeometry(outer = 0.26, inner = 0.12, depth = 0.07): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ---- a padlock badge ---- */

const BADGE = new THREE.Color('#3b3950');
const ICON = new THREE.Color('#ffffff');

function tinted(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const n = out.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  out.deleteAttribute('uv');
  return out;
}

/**
 * A small round dark-grey badge with a white padlock on it, lying flat (its top faces +Y; the shackle points toward -Z, the
 * top of the screen once the badge is tilted toward the camera). Vertex colours.
 */
export function lockGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24);
  disc.translate(0, 0.04, 0);
  const body = new THREE.BoxGeometry(0.24, 0.07, 0.17);
  body.translate(0, 0.115, 0.07);
  const shackle = new THREE.TorusGeometry(0.075, 0.025, 6, 14, Math.PI);
  shackle.rotateX(-Math.PI / 2); // the arc now lies in the ground plane, bulging toward -Z
  shackle.translate(0, 0.115, -0.015);
  const parts = [tinted(disc, BADGE), tinted(body, ICON), tinted(shackle, ICON)];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/* ---- ribbon along the path ---- */

/**
 * A flat ribbon following the winding path from level `from` to level `to`, with alternating bands (planks, paving
 * stones). Vertex colours carry the two tones; positions are in map world coordinates.
 */
export function pathRibbon(from: number, to: number, width: number, a: THREE.Color, b: THREE.Color, y = 0.04): THREE.BufferGeometry {
  const per = RIBBON_SLICES; // slices per level
  const n = (to - from) * per;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const t = from + i / per;
    const p = levelPoint(t);
    const q = levelPoint(t + 0.02);
    // The side direction is the normal of the path's direction in the ground plane.
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    c.copy(i % 2 === 0 ? a : b);
    for (const side of [-1, 1]) {
      pos.push(p.x + nx * side * width * 0.5, y, p.z + nz * side * width * 0.5);
      col.push(c.r, c.g, c.b);
    }
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---- the ground of one world ---- */

export const GROUND_WIDTH = 46;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The grass (or snow, or sand) of one world as a long strip. Its colours blend from the previous world's over the
 * first levels, so the ground changes gradually along the map.
 */
export function worldGround(
  fromLevel: number,
  toLevel: number,
  near: THREE.Color,
  far: THREE.Color,
  prevNear: THREE.Color,
  prevFar: THREE.Color,
): THREE.BufferGeometry {
  const zMax = -(fromLevel - 1 - 1) * STEP; // half a level beyond the first pad, toward the camera
  const zMin = -(toLevel - 1 + 1) * STEP;
  const colsN = 14;
  const rowsN = Math.max(2, (toLevel - fromLevel + 2) * 2);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const d = new THREE.Color();
  for (let r = 0; r <= rowsN; r++) {
    const z = zMax + ((zMin - zMax) * r) / rowsN;
    const level = 1 - z / STEP;
    const blend = smooth(fromLevel - 1.5, fromLevel + 3.5, level); // 0 = previous world, 1 = this one
    const p = levelPoint(level);
    for (let k = 0; k <= colsN; k++) {
      const x = -GROUND_WIDTH / 2 + (GROUND_WIDTH * k) / colsN;
      const away = Math.min(1, Math.abs(x - p.x * 0.5) / 20);
      c.copy(near).lerp(far, away);
      d.copy(prevNear).lerp(prevFar, away);
      c.lerp(d, 1 - blend);
      const patch = Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.23 + 1.3) + 0.5 * Math.sin(x * 0.53 + z * 0.41);
      c.offsetHSL(patch * 0.01, 0, patch * 0.02);
      pos.push(x, 0, z);
      col.push(c.r, c.g, c.b);
    }
    if (r < rowsN) {
      for (let k = 0; k < colsN; k++) {
        const a = r * (colsN + 1) + k;
        const b = a + 1;
        const e = a + colsN + 1;
        idx.push(a, b, e, b, e + 1, e);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Slices of ribbon per level (see pathRibbon). */
export const RIBBON_SLICES = 8;

const GREY_A = new THREE.Color('#8d89a3');
const GREY_B = new THREE.Color('#827e99');

/**
 * Colours the path: the stretch from a level to the next takes the colour that level was painted in once it is finished,
 * and stays grey until then. `painted(id)` says whether the stretch that starts at level `id` is painted.
 */
export function recolorRibbon(geometry: THREE.BufferGeometry, from: number, painted: (id: number) => boolean) {
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  const c = new THREE.Color();
  const pairs = color.count / 2;
  for (let i = 0; i < pairs; i++) {
    const level = Math.floor(from + i / RIBBON_SLICES);
    const done = painted(level);
    if (done) c.set(levelPaintColor(level, undefined)).offsetHSL(0, 0, i % 2 === 0 ? 0 : -0.045);
    else c.copy(i % 2 === 0 ? GREY_A : GREY_B);
    color.setXYZ(i * 2, c.r, c.g, c.b);
    color.setXYZ(i * 2 + 1, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}
