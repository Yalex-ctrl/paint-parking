import { useLayoutEffect } from 'react';
import type * as THREE from 'three';
import { useThree } from '@react-three/fiber/native';

import type { PreparedLevel } from './prepare';

/**
 * Puts the camera where the prepared level wants it. This only runs when the current level
 * changes: during a level transition the Director moves the camera itself.
 */
export function CameraRig({ prepared }: { prepared: PreparedLevel }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useLayoutEffect(() => {
    if (width === 0 || height === 0) return;
    camera.fov = 40;
    camera.aspect = width / height;
    camera.near = 0.1;
    camera.far = 300;
    camera.clearViewOffset();
    camera.position.copy(prepared.cameraPosition);
    camera.quaternion.copy(prepared.cameraQuaternion);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }, [camera, prepared, width, height]);

  return null;
}
