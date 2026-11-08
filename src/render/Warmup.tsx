import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber/native';

import type { PreparedLevel } from './prepare';

/**
 * Draws the next board once into a tiny off-screen target as soon as it is fully built and still hidden. That makes the GPU
 * do, behind the level being played, the work that otherwise lands on the first frame it is shown: compiling the shaders of
 * its materials (the equipped paint included), uploading its geometry and textures, and the first shadow pass. When the
 * transition starts, nothing is left to create or upload: the camera just moves.
 */
export function Warmup({
  groups,
  next,
  nextKey,
  offset,
}: {
  groups: MutableRefObject<Map<string, THREE.Group>>;
  next: PreparedLevel | null;
  nextKey: string;
  offset: THREE.Vector3;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const target = useMemo(() => new THREE.WebGLRenderTarget(8, 8), []);
  useEffect(() => () => target.dispose(), [target]);
  const done = useRef('');
  const camera = useMemo(() => new THREE.PerspectiveCamera(40, 1, 0.1, 300), []);

  useFrame(() => {
    if (!next || done.current === nextKey) return;
    const group = groups.current.get(nextKey);
    // Every piece of the board has to be mounted first (the world mounts in stages, a few per frame).
    if (!group || !group.userData.ready) return;
    done.current = nextKey;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.position.copy(next.cameraPosition).add(offset);
    camera.quaternion.copy(next.cameraQuaternion);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const saved: [THREE.Group, boolean][] = [];
    groups.current.forEach((g, key) => {
      saved.push([g, g.visible]);
      g.visible = key === nextKey;
    });
    const before = gl.getRenderTarget();
    try {
      gl.setRenderTarget(target);
      gl.render(scene, camera);
    } finally {
      gl.setRenderTarget(before);
      for (const [g, visible] of saved) g.visible = visible;
    }
  });
  return null;
}
