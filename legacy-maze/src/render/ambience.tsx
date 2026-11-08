import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame } from '@react-three/fiber/native';

export type AmbienceKind = 'butterflies' | 'leaves' | 'snow' | 'tumbleweed' | 'fireflies';

/** Which living touch each world gets: butterflies in the green worlds, falling leaves in autumn, snowflakes, rolling tumbleweeds. */
export function ambienceFor(worldId: string): AmbienceKind {
  switch (worldId) {
    case 'autumn':
      return 'leaves';
    case 'snow':
      return 'snow';
    case 'desert':
      return 'tumbleweed';
    case 'daily':
      return 'fireflies';
    default:
      return 'butterflies';
  }
}

const COLORS: Record<AmbienceKind, string[]> = {
  butterflies: ['#ff8fc7', '#ffd23f', '#8fd3ff', '#ffffff', '#c79bff'],
  leaves: ['#e0762f', '#c8462a', '#e8a33a', '#a8431f'],
  snow: ['#ffffff', '#eef6ff'],
  tumbleweed: ['#b9965a', '#a68350'],
  fireflies: ['#fff3a0', '#b7ffd8'],
};
const COUNTS: Record<AmbienceKind, number> = { butterflies: 9, leaves: 34, snow: 70, tumbleweed: 5, fireflies: 16 };

/** Two mirrored wings (and a thin body) lying in the ground plane, wing span along x and body along z: a butterfly seen from above. */
export function butterflyGeometry(): THREE.BufferGeometry {
  const wing = new THREE.Shape();
  wing.moveTo(0, 0.05);
  wing.bezierCurveTo(0.15, 0.55, 0.85, 0.65, 0.8, 0.12);
  wing.bezierCurveTo(0.78, -0.2, 0.55, -0.42, 0.3, -0.38);
  wing.bezierCurveTo(0.12, -0.34, 0.02, -0.2, 0, 0.05);
  const right = new THREE.ShapeGeometry(wing, 8).toNonIndexed();
  const left = right.clone();
  left.scale(-1, 1, 1);
  const body = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.04, -0.4), new THREE.Vector2(0.04, -0.4), new THREE.Vector2(0.04, 0.45), new THREE.Vector2(-0.04, 0.45)])).toNonIndexed();
  const parts = [right, left, body];
  for (const g of parts) {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  merged.rotateX(-Math.PI / 2);
  merged.computeVertexNormals();
  return merged;
}

/** A pointed leaf lying in the ground plane (length along z). */
export function leafGeometry(): THREE.BufferGeometry {
  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0.5);
  leaf.bezierCurveTo(0.32, 0.2, 0.3, -0.25, 0, -0.5);
  leaf.bezierCurveTo(-0.3, -0.25, -0.32, 0.2, 0, 0.5);
  const g = new THREE.ShapeGeometry(leaf, 8);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

const o = new THREE.Object3D();
const c = new THREE.Color();
const rnd = (n: number) => {
  const x = Math.sin(n * 91.3458 + 17.17) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Small living things drifting over a stretch of the scene, in one InstancedMesh (a draw call): butterflies, leaves,
 * snow or tumbleweeds. `area` is the box they stay in, centred on `center` (it follows when the map scrolls).
 */
export function WorldAmbience({
  kind,
  center,
  area = [14, 7, 14],
  scale = 1,
}: {
  kind: AmbienceKind;
  center: THREE.Vector3 | (() => THREE.Vector3);
  area?: [number, number, number];
  scale?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = COUNTS[kind];
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ a: rnd(i), b: rnd(i + 50), c: rnd(i + 100), d: rnd(i + 150) })), [count]);
  const geometry = useMemo(() => (kind === 'butterflies' ? butterflyGeometry() : kind === 'leaves' ? leafGeometry() : new THREE.IcosahedronGeometry(1, 0)), [kind]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const flat = kind === 'butterflies' || kind === 'leaves';

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const palette = COLORS[kind];
    for (let i = 0; i < count; i++) m.setColorAt(i, c.set(palette[i % palette.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [kind, count]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const ctr = typeof center === 'function' ? center() : center;
    const [ax, ay, az] = area;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      let x = 0;
      let y = 0;
      let z = 0;
      let sx = 1;
      let sy = 1;
      let sz = 1;
      let rx = 0;
      let ry = 0;
      let rz = 0;
      if (kind === 'butterflies') {
        const k = t * (0.25 + s.a * 0.2) + s.b * 20;
        x = Math.sin(k) * ax * 0.45 * (0.5 + s.c);
        z = Math.cos(k * 0.8 + s.d * 5) * az * 0.45 * (0.5 + s.a);
        y = 1.2 + s.b * 2.2 + Math.sin(k * 3) * 0.3;
        // The wings beat: seen from above their span opens and closes.
        sx = 0.34 * scale * (0.3 + 0.7 * Math.abs(Math.sin(t * 11 + i)));
        sy = 1;
        sz = 0.34 * scale;
        rz = Math.sin(k * 3) * 0.15;
        ry = -k + Math.PI / 2;
      } else if (kind === 'leaves') {
        const fall = (t * (0.35 + s.a * 0.3) + s.b * 10) % 1;
        x = (s.c - 0.5) * ax + Math.sin(t * 0.9 + i) * 0.8;
        z = (s.d - 0.5) * az + Math.cos(t * 0.7 + i) * 0.8;
        y = (1 - fall) * ay;
        sx = 0.3 * scale;
        sy = 1;
        sz = 0.3 * scale;
        rx = t * 2 + i;
        ry = t * 1.3 + i * 2;
      } else if (kind === 'snow') {
        const fall = (t * (0.12 + s.a * 0.12) + s.b * 7) % 1;
        x = (s.c - 0.5) * ax + Math.sin(t * 0.5 + i) * 0.5;
        z = (s.d - 0.5) * az;
        y = (1 - fall) * ay;
        sx = sy = sz = 0.07 * scale * (0.7 + s.a);
      } else if (kind === 'tumbleweed') {
        const run = (t * (0.35 + s.a * 0.25) + s.b * 5) % 1;
        x = (run - 0.5) * ax * 1.2;
        z = (s.c - 0.5) * az;
        y = 0.28 * scale + Math.abs(Math.sin(t * 3 + i)) * 0.12;
        sx = sy = sz = 0.3 * scale;
        rz = -x * 3;
      } else {
        const k = t * 0.3 + s.b * 30;
        x = (s.c - 0.5) * ax + Math.sin(k * 1.3) * 0.7;
        z = (s.d - 0.5) * az + Math.cos(k) * 0.7;
        y = 0.6 + s.a * ay * 0.5 + Math.sin(k * 2) * 0.3;
        sx = sy = sz = 0.06 * scale * (0.6 + 0.4 * Math.sin(t * 3 + i * 2) ** 2 + 0.4);
      }
      o.position.set(ctr.x + x, ctr.y + y, ctr.z + z);
      o.rotation.set(rx, ry, rz);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      {kind === 'fireflies' ? (
        <meshBasicMaterial toneMapped={false} />
      ) : (
        <meshStandardMaterial roughness={0.8} side={flat ? THREE.DoubleSide : THREE.FrontSide} emissive={kind === 'snow' ? '#ffffff' : flat ? '#555555' : '#000000'} emissiveIntensity={0.4} />
      )}
    </instancedMesh>
  );
}
