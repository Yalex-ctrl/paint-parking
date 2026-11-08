import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small helpers to build one vertex-coloured geometry out of many boxes and cylinders: a whole lot (or a whole vehicle) is then a
 * single mesh, a single draw call, and its geometry is shared by every instance.
 */
const tint = new THREE.Color();

function colored<T extends THREE.BufferGeometry>(g: T, color: string | number | THREE.Color): T {
  tint.set(color as THREE.ColorRepresentation);
  const n = g.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    data[i * 3] = tint.r;
    data[i * 3 + 1] = tint.g;
    data[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

/** A box of size (w, h, d) whose centre is (x, y, z). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string | number | THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colored(g, color);
}

/** A cylinder standing on the ground at (x, z) (`bottom` is its lowest point). */
export function cylinder(rTop: number, rBottom: number, h: number, x: number, bottom: number, z: number, color: string | number | THREE.Color, segments = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  g.translate(x, bottom + h / 2, z);
  return colored(g, color);
}

/** A cylinder lying across the vehicle (a wheel): axis along Z. */
export function wheel(r: number, width: number, x: number, y: number, z: number, color: string | number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, width, 10);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return colored(g, color);
}

export function sphere(r: number, x: number, y: number, z: number, color: string | number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 8, 6);
  g.translate(x, y, z);
  return colored(g, color);
}

/** A flat shape lying on the ground (a painted arrow), `rotation` around Y. */
export function flatShape(points: [number, number][], x: number, y: number, z: number, rotation: number, color: string | number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rotation);
  g.translate(x, y, z);
  return colored(g, color);
}

/** All the parts in one geometry. Every part must carry the same attributes (they all come from the helpers above). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Could not merge the geometries');
  return merged;
}
