import { useContext, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { DELTA, type Dir, type Level } from '../game/types';
import type { SceneBus } from './bus';
import { cellX, cellZ } from './coords';
import { WorldKeyContext } from './worldContext';

/** Rotation about y that turns "toward the top of the screen" (-z) into the world direction of `dir`. */
const SPIN: Record<Dir, number> = { U: 0, R: -Math.PI / 2, D: Math.PI, L: Math.PI / 2 };

export const FLASH_SECONDS = 0.55;
const now = () => performance.now() / 1000;

/** A small white padlock for the shut gate: a body and a shackle, on both faces of the panel (it is seen from either side). */
export function GatePadlock() {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0.42, side * 0.045]}>
          <mesh position={[0, -0.04, 0]}>
            <boxGeometry args={[0.2, 0.15, 0.03]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} emissive="#ffffff" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <torusGeometry args={[0.065, 0.021, 6, 14, Math.PI]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} emissive="#ffffff" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function arrowShape() {
  // Pointing +Y: a head and a short tail.
  const s = new THREE.Shape();
  s.moveTo(0, 0.42);
  s.lineTo(0.34, 0.02);
  s.lineTo(0.14, 0.02);
  s.lineTo(0.14, -0.36);
  s.lineTo(-0.14, -0.36);
  s.lineTo(-0.14, 0.02);
  s.lineTo(-0.34, 0.02);
  s.closePath();
  return s;
}

/**
 * What shows the way once the last tile is painted: a flash of light at the opening as the gate sinks, then an arrow on the
 * exit tile, pointing out of the board and pulsing, until the ball rolls out.
 */
export function ExitMarks({ level, bus }: { level: Level; bus: SceneBus }) {
  const worldKey = useContext(WorldKeyContext);
  const arrow = useRef<THREE.Group>(null);
  const arrowMat = useRef<THREE.MeshBasicMaterial>(null);
  const flash = useRef<THREE.Group>(null);
  const flashMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const shape = useMemo(() => new THREE.ShapeGeometry(arrowShape()), []);
  const [dr, dc] = DELTA[level.exit.dir];
  const x = cellX(level, level.exit.c);
  const z = cellZ(level, level.exit.r);

  useFrame(() => {
    const open = bus.exitOpenKey === worldKey;
    const t = open ? now() - bus.exitOpenAt : -1;
    const a = arrow.current;
    if (a) {
      const show = open && t > 0.25 && !bus.exiting && !bus.transitioning;
      a.visible = show;
      if (show) {
        const pulse = 0.5 + 0.5 * Math.sin((t - 0.25) * 6);
        a.scale.setScalar(0.85 + 0.2 * pulse);
        a.position.set(x + dc * (0.05 + 0.12 * pulse), 0.09, z + dr * (0.05 + 0.12 * pulse));
        if (arrowMat.current) arrowMat.current.opacity = 0.6 + 0.4 * pulse;
      }
    }
    const f = flash.current;
    if (f) {
      const k = t / FLASH_SECONDS;
      f.visible = open && k >= 0 && k < 1;
      if (f.visible) {
        f.scale.setScalar(0.4 + 2.2 * k);
        if (flashMat.current) flashMat.current.opacity = 0.9 * (1 - k);
        if (haloMat.current) haloMat.current.opacity = 0.7 * (1 - k) * (1 - k);
      }
    }
  });

  return (
    <>
      <group ref={arrow} visible={false} rotation={[0, SPIN[level.exit.dir], 0]} position={[x, 0.09, z]}>
        <mesh geometry={shape} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <meshBasicMaterial ref={arrowMat} color="#ffffff" transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={flash} visible={false} position={[x + dc * 0.3, 0.12, z + dr * 0.3]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <ringGeometry args={[0.45, 0.6, 28]} />
          <meshBasicMaterial ref={flashMat} color="#fff6c2" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial ref={haloMat} color="#ffe066" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </>
  );
}
