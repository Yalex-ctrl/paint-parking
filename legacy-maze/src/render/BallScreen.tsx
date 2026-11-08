import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber/native';

import type { SceneBus } from './bus';

const V = new THREE.Vector3();

/** Inside a Canvas: tells the bus where the ball is on screen (NDC), so words can float over it. Renders nothing. */
export function BallScreen({ bus }: { bus: SceneBus }) {
  const camera = useThree((s) => s.camera);
  const out = useRef({ x: 0, y: 0 });
  useFrame(() => {
    const ball = bus.ball;
    if (!ball) {
      bus.ballNdc = null;
      return;
    }
    ball.group.getWorldPosition(V).project(camera);
    out.current.x = V.x;
    out.current.y = V.y;
    bus.ballNdc = out.current;
  });
  return null;
}
