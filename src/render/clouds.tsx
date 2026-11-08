import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

const o = new THREE.Object3D();
const PUFFS: [number, number, number, number][] = [
  [0, 0, 0, 1.0],
  [1.0, -0.15, 0.1, 0.75],
  [-1.0, -0.2, -0.05, 0.7],
  [0.45, 0.45, 0, 0.7],
  [-0.4, 0.35, 0.1, 0.62],
];

/**
 * Low-poly clouds drifting slowly across the sky, all in one InstancedMesh. `center` is where the sky is
 * (a function, so it can follow the camera), `span` how far they travel before coming back around.
 */
export function Clouds({
  center,
  count = 6,
  span = 40,
  height = 7,
  depth = 12,
  tint = '#ffffff',
}: {
  center: () => THREE.Vector3;
  count?: number;
  span?: number;
  height?: number;
  depth?: number;
  tint?: string;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const clouds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i / count) * span,
        y: height + (((i * 37) % 10) / 10 - 0.5) * 3,
        z: -depth - ((i * 53) % 10) * 0.8,
        size: 1.6 + ((i * 29) % 10) / 6,
        speed: 0.25 + ((i * 13) % 10) / 40,
      })),
    [count, span, height, depth],
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const ctr = center();
    let n = 0;
    for (const cl of clouds) {
      const x = ((cl.x + clock.elapsedTime * cl.speed) % span) - span / 2;
      for (const [px, py, pz, ps] of PUFFS) {
        o.position.set(ctr.x + x + px * cl.size, ctr.y + cl.y + py * cl.size, ctr.z + cl.z + pz * cl.size);
        o.scale.set(ps * cl.size, ps * cl.size * 0.7, ps * cl.size * 0.8);
        o.updateMatrix();
        m.setMatrixAt(n++, o.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count * PUFFS.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={tint} flatShading roughness={1} emissive="#ffffff" emissiveIntensity={0.35} />
    </instancedMesh>
  );
}
