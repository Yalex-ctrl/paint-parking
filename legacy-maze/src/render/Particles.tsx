import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import type { SceneBus } from './bus';
import type { DecalPool, ParticlePool } from '../core/render/ParticlePool';

const tmp = new THREE.Object3D();
const tint = new THREE.Color();
const FACE_Z = new THREE.Vector3(0, 0, 1);
const NORMAL = new THREE.Vector3();
const SPIN = new THREE.Quaternion();
const SPIN_AXIS = new THREE.Vector3(0, 0, 1);

type Props = { pool: ParticlePool; bus: SceneBus };

/** Splash droplets and wood splinters: one InstancedMesh of tiny spheres, simulated on the CPU. */
export function Particles({ pool, bus }: Props) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  // Every instance starts collapsed; colours are assigned on spawn.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    tmp.scale.set(0, 0, 0);
    tmp.updateMatrix();
    for (let i = 0; i < pool.size; i++) {
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, tint.setHex(0xffffff));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [pool]);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    // Collisions use the board the ball is playing on.
    if (bus.surface && bus.decals) pool.update(Math.min(rawDt, 1 / 20), bus.surface, bus.decals);

    if (pool.freshColor.length > 0) {
      for (const i of pool.freshColor) {
        tint.setHex(pool.hex[i]).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.3) * 0.18);
        m.setColorAt(i, tint);
      }
      pool.freshColor.length = 0;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < pool.size; i++) {
      const life = pool.life[i];
      if (life <= 0) {
        tmp.scale.set(0, 0, 0);
      } else {
        // Shrink over the last third of the lifetime; landed drops flatten.
        const f = Math.min(1, (life / pool.maxLife[i]) * 3);
        const r = pool.radius[i] * f;
        tmp.scale.set(r, pool.landed[i] ? r * 0.35 : r, r);
        tmp.position.set(pool.x[i], pool.y[i], pool.z[i]);
      }
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, pool.size]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.3} metalness={0.05} />
    </instancedMesh>
  );
}

/** Permanent paint stains left on wall tops and on the grass around the board. */
export function Decals({ decals }: { decals: DecalPool }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    tmp.scale.set(0, 0, 0);
    tmp.updateMatrix();
    for (let i = 0; i < decals.size; i++) {
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, tint.setHex(0xffffff));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [decals]);

  useFrame(() => {
    const m = mesh.current;
    if (!m || decals.fresh.length === 0) return;
    for (const i of decals.fresh) {
      NORMAL.set(decals.nx[i], decals.ny[i], decals.nz[i]);
      tmp.position.set(decals.x[i], decals.y[i], decals.z[i]);
      tmp.quaternion.setFromUnitVectors(FACE_Z, NORMAL);
      SPIN.setFromAxisAngle(SPIN_AXIS, decals.spin[i]);
      tmp.quaternion.multiply(SPIN);
      const r = decals.radius[i];
      tmp.scale.set(r * decals.stretch[i], r / decals.stretch[i], 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      tint.setHex(decals.hex[i]).offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.4) * 0.12);
      m.setColorAt(i, tint);
    }
    decals.fresh.length = 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, decals.size]} frustumCulled={false} renderOrder={1}>
      <circleGeometry args={[1, 10]} />
      <meshStandardMaterial roughness={0.4} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
