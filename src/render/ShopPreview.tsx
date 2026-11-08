import { useEffect, useMemo, useRef } from 'react';
import { PixelRatio } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { particlePalette } from '@/core/render/paintPalette';
import { MAX_PIXEL_RATIO } from '@/core/render/perf';
import { skinMaterial } from './ParkingCanvas';
import { specOf } from './skinSpecs';
import { skinGeometry } from './vehicleGeometry';
import { LOT_COLORS } from './palette';

const MARKS = 6;
const SPACING = 0.5;

/**
 * What the shop shows in big: the vehicle turning slowly on a piece of asphalt, with a few marks of the selected paint laid behind it
 * (the paint colours come from the same palette as the confetti). The equipped skin / paint stand in for whichever the player is
 * not looking at.
 */
function Turntable({ ball, paint }: { ball: string; paint: string }) {
  const spec = specOf(ball);
  const geometry = useMemo(() => skinGeometry(spec, 2), [spec]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const colors = useMemo(() => particlePalette(paint, 0xff5468).map((hex) => new THREE.Color(hex)), [paint]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.7;
  });
  return (
    <group ref={group}>
      <mesh geometry={geometry} material={skinMaterial(spec.finish)} position={[0.45, 0.06, 0]} />
      {Array.from({ length: MARKS }, (_, i) => (
        <mesh key={i} position={[-0.6 - i * SPACING + 1.2, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.46, 0.52]} />
          <meshBasicMaterial color={colors[i % Math.max(1, colors.length)] ?? '#ffffff'} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.9, 1.9, 0.08, 32]} />
        <meshLambertMaterial color={LOT_COLORS.asphalt} />
      </mesh>
    </group>
  );
}

export function ShopPreview({ ball, paint }: { ball: string; paint: string }) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      camera={{ fov: 32, near: 0.1, far: 50, position: [0, 3.1, 4.4] }}
      gl={{ antialias: true }}
      onCreated={({ gl, size, camera }) => {
        gl.setClearColor('#2a2250', 1);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.setPixelRatio(Math.min(PixelRatio.get(), MAX_PIXEL_RATIO));
        gl.setSize(size.width, size.height, false);
        camera.lookAt(0, 0.2, 0);
      }}
    >
      <ambientLight intensity={0.9} color="#fff4e8" />
      <hemisphereLight args={['#dbe9ff', '#7a8a5a', 0.5]} />
      <directionalLight position={[-3, 6, 4]} intensity={1.1} color="#fff1d6" />
      <Turntable ball={ball} paint={paint} />
    </Canvas>
  );
}
