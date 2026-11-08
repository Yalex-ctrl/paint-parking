import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { GROUND_Y } from './coords';

const SIZE = 120;
const SEGMENTS = 60; // ~2 world units per vertex: enough for soft patches of colour

/**
 * A big grass plane under and around the board. Plain vertex colours, no texture: a soft,
 * slightly desaturated green, lighter near the board and darker toward the far edges (which
 * always lie beyond the screen), with gentle patches of hue so the grass does not look flat.
 */
export function Ground() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const near = new THREE.Color('#86ab6a');
    const far = new THREE.Color('#5a7f4d');
    const c = new THREE.Color();
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Smooth pseudo-noise: a few sines at different scales, no random flicker between frames.
      const patch = Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.19) + 0.5 * Math.sin(x * 0.51 + z * 0.43 + 2);
      c.copy(near).lerp(far, Math.min(1, Math.pow(d / 38, 0.8)));
      c.offsetHSL(patch * 0.012, 0, patch * 0.022);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, GROUND_Y, 0]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}
