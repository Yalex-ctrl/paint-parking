import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import type { SceneBus } from './bus';
import { BALL_R } from './coords';

const N = 16;
const LIFE = 0.32; // seconds a trail blob lasts
const EMIT_EVERY = 0.018;
const tmp = new THREE.Object3D();

/** A short comet tail in the level colour, left behind the ball while it rolls. */
export function Trail({ bus, color }: { bus: SceneBus; color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const state = useRef({
    x: new Float32Array(N),
    y: new Float32Array(N),
    z: new Float32Array(N),
    life: new Float32Array(N).fill(LIFE),
    age: new Float32Array(N).fill(LIFE),
    cursor: 0,
    sinceEmit: 0,
  });

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    tmp.scale.set(0, 0, 0);
    tmp.updateMatrix();
    for (let i = 0; i < N; i++) m.setMatrixAt(i, tmp.matrix);
    m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 1 / 20);
    const s = state.current;
    s.sinceEmit += dt;
    if (bus.rolling && s.sinceEmit >= EMIT_EVERY) {
      s.sinceEmit = 0;
      s.x[s.cursor] = bus.ballX;
      s.y[s.cursor] = bus.ballY * 0.85;
      s.z[s.cursor] = bus.ballZ;
      s.life[s.cursor] = LIFE;
      s.age[s.cursor] = 0;
      s.cursor = (s.cursor + 1) % N;
    }
    for (let i = 0; i < N; i++) {
      s.age[i] = Math.min(s.life[i], s.age[i] + dt);
      const t = 1 - s.age[i] / s.life[i];
      const r = BALL_R * 0.62 * t;
      tmp.position.set(s.x[i], s.y[i] || BALL_R * 0.85, s.z[i]);
      tmp.scale.set(r, r, r);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.4} />
    </instancedMesh>
  );
}
