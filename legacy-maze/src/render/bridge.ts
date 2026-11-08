import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BRIDGE_LENGTH } from './transition';

const PLANK = new THREE.Color('#c99560');
const PLANK_DARK = new THREE.Color('#b0794a');
const RAIL = new THREE.Color('#8a5a34');
const BEAM = new THREE.Color('#5e3d22');

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * A wooden bridge `BRIDGE_LENGTH` cells long: planks across, two low rails with posts, two beams underneath. It starts at the
 * outer face of a ring cell (the entry or the exit of a board) and goes out along `dir` = (dx, dz) in the ground plane; the
 * returned geometry is in the coordinates of that ring cell's centre. Its top is flush with the floor of the board.
 */
export function buildBridgeGeometry(dx: number, dz: number, length = BRIDGE_LENGTH): THREE.BufferGeometry {
  // Built along +x, from the cell face (x = 0.5) outward, then turned to face `dir`.
  const parts: THREE.BufferGeometry[] = [];
  const start = 0.5;
  const perCell = 3;
  const plankLen = 1 / perCell - 0.03;
  for (let k = 0; k < length * perCell; k++) {
    const x = start + (k + 0.5) / perCell;
    parts.push(box(plankLen, 0.1, 1.0, x, -0.07, 0, k % 2 === 0 ? PLANK : PLANK_DARK));
  }
  for (const side of [-1, 1]) {
    parts.push(box(length, 0.07, 0.07, start + length / 2, 0.22, side * 0.5, RAIL));
    parts.push(box(length, 0.1, 0.1, start + length / 2, -0.2, side * 0.33, BEAM));
    for (let k = 0; k <= length; k++) parts.push(box(0.11, 0.38, 0.11, start + k, 0.05, side * 0.5, RAIL));
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  // +x must become (dx, dz): a rotation about y by atan2(-dz, dx).
  merged.rotateY(Math.atan2(-dz, dx));
  merged.computeVertexNormals();
  return merged;
}
