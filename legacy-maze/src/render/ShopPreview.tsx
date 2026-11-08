import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber/native';

import { BALL_R } from './coords';
import { useEnvironment } from './GameCanvas';
import { animatePaint, createPaintMaterial, paintTint } from './paintEffects';
import { BallBand, BallBody } from './skins';
import { colors } from '../core/ui/theme';

const BASE = new THREE.Color('#4f8cff');
const TILES = 7;
/** The ball is bigger in the shop preview: a bigger sphere, never a scaled one. */
const PREVIEW_R = BALL_R * 1.5;
const TILE = 1.12;
const ROLL = 3.4; // seconds of rolling
const HOLD = 1.4; // seconds looking at the result
const o = new THREE.Object3D();
const c = new THREE.Color();

/**
 * What the shop shows in big: the selected ball (or paint) rolling over a strip of tiles with the paint that is on (or
 * the selected one), laying it down behind itself, as in a level; then it starts again.
 */
function Strip({ ball, paint }: { ball: string; paint: string }) {
  const env = useEnvironment();
  const paintMesh = useRef<THREE.InstancedMesh>(null);
  const ballGroup = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const material = useMemo(() => createPaintMaterial(paint, env), [paint, env]);
  useEffect(() => () => material.dispose(), [material]);
  const half = ((TILES - 1) * TILE) / 2;

  useLayoutEffect(() => {
    const m = paintMesh.current;
    if (!m) return;
    for (let i = 0; i < TILES; i++) {
      paintTint(c, paint, BASE, { order: i, noise: 0, coat: 1, double: false, pos: { u: i / (TILES - 1), v: 0.5 } });
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [paint]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime % (ROLL + HOLD);
    const k = Math.min(1, t / ROLL);
    const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    const x = -half - 0.9 + e * (half * 2 + 1.8);
    if (ballGroup.current) {
      ballGroup.current.position.set(x, BALL_R * 1.5 + 0.06, 0);
      ballGroup.current.visible = t < ROLL + HOLD * 0.75;
    }
    if (spin.current) spin.current.rotation.z = -x / (BALL_R * 1.5);
    animatePaint(material, paint, clock.elapsedTime);
    const m = paintMesh.current;
    if (!m) return;
    for (let i = 0; i < TILES; i++) {
      const tx = -half + i * TILE;
      // A tile pops up as the ball goes over it, and stays until the loop starts again.
      const p = t >= ROLL + HOLD * 0.8 ? 0 : Math.min(1, Math.max(0, (x - tx + 0.25) / 0.5));
      const s = p >= 1 ? 1 : p * p * (3 - 2 * p) * 1.1;
      o.position.set(tx, 0.065, 0);
      o.scale.set(s, 1, s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group rotation={[0.1, -0.12, 0]}>
      {/* The floor: unpainted tiles, dark. */}
      {Array.from({ length: TILES }, (_, i) => (
        <mesh key={i} position={[-half + i * TILE, 0, 0]}>
          <boxGeometry args={[TILE * 0.94, 0.12, TILE * 0.94]} />
          <meshStandardMaterial color="#3a3150" roughness={0.9} />
        </mesh>
      ))}
      <instancedMesh ref={paintMesh} args={[undefined, undefined, TILES]} frustumCulled={false}>
        <boxGeometry args={[TILE * 0.9, 0.04, TILE * 0.9]} />
        <primitive object={material} attach="material" />
      </instancedMesh>
      <group ref={ballGroup}>
        <group ref={spin}>
          <mesh>
            <BallBody skin={ball} envMap={env} radius={PREVIEW_R} />
            <BallBand skin={ball} radius={PREVIEW_R} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * The shop's 3D preview: ONE canvas for the whole screen (a GL context per card would be far too heavy). It stops drawing
 * when another screen is on top.
 */
export function ShopPreview({ ball, paint, active = true }: { ball: string; paint: string; active?: boolean }) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      frameloop={active ? 'always' : 'never'}
      camera={{ fov: 38, near: 0.1, far: 50, position: [0, 3.6, 5.6] }}
      gl={{ antialias: true }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(colors.previewBg, 1);
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        camera.lookAt(0, 0.3, 0);
      }}
    >
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#e8eeff', '#8c8a78', 0.5]} />
      <directionalLight position={[-3, 5, 4]} intensity={2.2} color="#fff3df" />
      <Strip ball={ball} paint={paint} />
    </Canvas>
  );
}
