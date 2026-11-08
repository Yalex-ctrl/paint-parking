import { useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import type { Level } from '../game/types';
import type { SceneBus } from './bus';
import { BALL_R } from './coords';
import { groundY } from './heights';
import { ballShadowGeometry, ballShadowMaterial } from './slideVisuals';

/**
 * The soft shadow under the ball, projected straight down on whatever is under it (floor, platform, ramp, floor of a chute): the
 * higher the ball is above that surface, the smaller and lighter it is. It follows the ball's group every frame and is its own mesh,
 * so the ball itself is never touched.
 */
export function BallShadow({ level, bus, group }: { level: Level; bus: SceneBus; group: RefObject<THREE.Group | null> }) {
  const shadow = useRef<THREE.Mesh>(null);
  const material = ballShadowMaterial();
  useFrame(() => {
    const g = group.current;
    const sh = shadow.current;
    if (!g || !sh) return;
    if (!g.visible || bus.exiting || bus.transitioning) {
      sh.visible = false;
      return;
    }
    const x = g.position.x;
    const z = g.position.z;
    const surface = bus.inChute ? g.position.y - BALL_R : groundY(level, x, z);
    const gap = Math.max(0, g.position.y - BALL_R - surface);
    const k = Math.min(1, gap / 0.7);
    sh.visible = true;
    sh.position.set(x, surface + 0.016, z);
    const size = BALL_R * 2.5 * (1 - 0.35 * k);
    sh.scale.set(size, 1, size);
    material.opacity = 0.55 * (1 - 0.65 * k);
  });
  return <mesh ref={shadow} geometry={ballShadowGeometry()} material={material} renderOrder={5} frustumCulled={false} />;
}
