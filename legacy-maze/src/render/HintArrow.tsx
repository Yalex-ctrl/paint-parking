import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { DELTA } from '../game/types';
import type { SceneBus } from './bus';

/** The arrow floats slowly back and forth (seconds): it never blinks, fades or pulses. */
const CYCLE = 2.4;
/** The arrow is about this long (cells): small, so it points without hiding the board. */
const LENGTH = 0.55;

/** A flat arrow lying on the floor, pointing along +X, one unit long. */
function arrowShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.17);
  s.lineTo(0.52, -0.17);
  s.lineTo(0.52, -0.42);
  s.lineTo(1, 0);
  s.lineTo(0.52, 0.42);
  s.lineTo(0.52, 0.17);
  s.lineTo(0, 0.17);
  s.closePath();
  return s;
}

/**
 * The help arrow: small, plain white (no outline) and steady: it points in the direction of the next good swipe and only drifts gently
 * back and forth, with no blinking. Used by the beginners' help and by the Hint button.
 */
export function HintArrow({ bus }: { bus: SceneBus }) {
  const group = useRef<THREE.Group>(null);
  const white = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, depthWrite: false }), []);
  const fill = useMemo(() => new THREE.ShapeGeometry(arrowShape()), []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const hint = bus.hint;
    if (!hint || performance.now() > hint.until) {
      g.visible = false;
      return;
    }
    const [dr, dc] = DELTA[hint.dir];
    // Always there, fully visible; it only drifts gently along the way to go.
    const dist = 0.85 + 0.1 * Math.sin((clock.elapsedTime / CYCLE) * Math.PI * 2);
    g.visible = true;
    g.position.set(bus.ballX + dc * dist, bus.ballY - 0.11, bus.ballZ + dr * dist);
    g.rotation.y = Math.atan2(-dr, dc);
    g.scale.setScalar(LENGTH);
  });

  return (
    <group ref={group} visible={false}>
      <group rotation={[-Math.PI / 2, 0, 0]} position={[-0.5, 0, 0]}>
        <mesh geometry={fill} material={white} renderOrder={21} />
      </group>
    </group>
  );
}
