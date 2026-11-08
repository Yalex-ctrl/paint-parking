import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber/native';
import { Gesture } from 'react-native-gesture-handler';

import type { SceneBus } from './bus';

/**
 * Developer tool, "Caméra libre": turns the camera round the board (two fingers to turn, a pinch to zoom) in any level, to look at the
 * pieces from every side. It exists only in a development build: the screens never ask for it in a release build. Nothing is
 * allocated while it runs, and the camera goes back where the level put it when it is switched off.
 */

const MIN_PITCH = 0.12;
const MAX_PITCH = Math.PI / 2 - 0.02;
const MIN_DIST = 3;
const MAX_DIST = 60;
/** Radians per pixel of a two-finger drag. */
const TURN = 0.008;

const target = new THREE.Vector3(0, 0, 0);

/** The camera follows `bus.freeCam` while it is active (mount it after the Director, in the scene). */
export function FreeCamera({ bus, enabled }: { bus: SceneBus; enabled: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const saved = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);
  const live = useRef(false);

  useEffect(() => {
    bus.freeCam.active = enabled;
    return () => {
      bus.freeCam.active = false;
    };
  }, [bus, enabled]);

  useFrame(() => {
    const f = bus.freeCam;
    if (!f.active) {
      if (live.current && saved.current) {
        camera.position.copy(saved.current.position);
        camera.quaternion.copy(saved.current.quaternion);
        camera.updateMatrixWorld(true);
      }
      live.current = false;
      return;
    }
    if (!live.current) {
      // Start from where the camera is now.
      saved.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
      const d = camera.position.length();
      f.dist = d;
      f.yaw = Math.atan2(camera.position.x, camera.position.z);
      f.pitch = Math.asin(Math.min(1, Math.max(-1, camera.position.y / Math.max(d, 1e-6))));
      live.current = true;
    }
    const cp = Math.cos(f.pitch);
    camera.position.set(Math.sin(f.yaw) * cp * f.dist, Math.sin(f.pitch) * f.dist, Math.cos(f.yaw) * cp * f.dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  });
  return null;
}

/** The gesture of the free camera: two fingers to turn round the board, a pinch to come closer or go away. */
export function freeCameraGesture(bus: SceneBus) {
  const turn = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .onChange((e) => {
      const f = bus.freeCam;
      f.yaw -= e.changeX * TURN;
      f.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, f.pitch + e.changeY * TURN));
    });
  const zoom = Gesture.Pinch()
    .runOnJS(true)
    .onChange((e) => {
      const f = bus.freeCam;
      f.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, f.dist / e.scaleChange));
    });
  return Gesture.Simultaneous(turn, zoom);
}
