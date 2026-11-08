import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useFrame } from '@react-three/fiber/native';

import { BALL_R } from './coords';
import { SKIN_PATTERNS } from './skinPatterns';
import { SKIN_SPECS } from './skinSpecs';

const TEX_W = 256;
const TEX_H = 128;

const textures = new Map<string, THREE.DataTexture>();

/** Bakes a skin's pattern into an equirectangular texture (once per skin, then shared). */
export function skinTexture(id: string): THREE.DataTexture | null {
  const pattern = SKIN_PATTERNS[id];
  if (!pattern) return null;
  const cached = textures.get(id);
  if (cached) return cached;
  const data = new Uint8Array(TEX_W * TEX_H * 4);
  for (let py = 0; py < TEX_H; py++) {
    // Row 0 is the bottom of the texture, which is the south pole.
    const lat = ((py + 0.5) / TEX_H) * Math.PI - Math.PI / 2;
    for (let px = 0; px < TEX_W; px++) {
      const lon = ((px + 0.5) / TEX_W) * Math.PI * 2;
      // Same orientation as THREE.SphereGeometry: u runs around +y, starting at -x.
      const x = -Math.cos(lon) * Math.cos(lat);
      const y = Math.sin(lat);
      const z = Math.sin(lon) * Math.cos(lat);
      const [r, g, b] = pattern(x, y, z);
      const i = (py * TEX_W + px) * 4;
      // The texture holds sRGB bytes (see colorSpace below): the colour is written as authored.
      data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  textures.set(id, tex);
  return tex;
}

export { SKIN_SPECS, type SkinSpec } from './skinSpecs';

/** A faceted ball: flat shading, and a different pastel tint on each facet for the disco ball. */
function facetedGeometry(detail: number, tint: boolean, radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail).toNonIndexed();
  if (tint) {
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let f = 0; f < pos.count / 3; f++) {
      c.setHSL(Math.abs((Math.sin(f * 12.9898) * 43758.5453) % 1), 0.35, 0.82);
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f * 3 + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return g;
}

/**
 * The inside of the ball's mesh for a given skin: geometry and material (the caller provides the <mesh>).
 * Used by the ball in the game and by the 3D preview in the shop, so both always look the same.
 */
export function BallBody({ skin, envMap, radius = BALL_R }: { skin: string; envMap?: THREE.Texture | null; radius?: number }) {
  const spec = SKIN_SPECS[skin] ?? SKIN_SPECS.gold;
  const map = useMemo(() => skinTexture(skin), [skin]);
  const geometry = useMemo(
    () =>
      spec.shape === 'sphere'
        ? new THREE.SphereGeometry(radius, 32, 24)
        : facetedGeometry(spec.shape === 'disco' ? 2 : 1, spec.shape === 'disco', radius),
    [spec.shape, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const transparent = spec.opacity !== undefined && spec.opacity < 1;
  const material = useRef<THREE.MeshStandardMaterial>(null);
  // The sun and the lava breathe: their glow swells and fades slowly.
  useFrame(({ clock }) => {
    if (spec.animated && material.current) material.current.emissiveIntensity = (spec.emissiveIntensity ?? 0.8) * (0.8 + 0.25 * Math.sin(clock.elapsedTime * 2.6));
  });
  return (
    <>
      <primitive object={geometry} attach="geometry" />
      {spec.halo && (
        <mesh>
          <sphereGeometry args={[radius * 1.32, 20, 14]} />
          <meshBasicMaterial color={spec.halo} transparent opacity={0.22} depthWrite={false} side={THREE.BackSide} />
        </mesh>
      )}
      <meshStandardMaterial
        ref={material}
        key={skin}
        color={spec.color}
        map={map}
        emissiveMap={spec.glowMap ? map : null}
        metalness={spec.metalness}
        roughness={spec.roughness}
        envMap={envMap ?? null}
        envMapIntensity={spec.envMapIntensity}
        emissive={spec.emissive ?? '#000000'}
        emissiveIntensity={spec.emissiveIntensity ?? 0}
        flatShading={spec.shape !== 'sphere'}
        vertexColors={spec.shape === 'disco'}
        transparent={transparent}
        opacity={spec.opacity ?? 1}
      />
    </>
  );
}

/** The dark ring around plain balls: without it, a uniform sphere shows no rolling at all. */
export function BallBand({ skin, radius = BALL_R }: { skin: string; radius?: number }) {
  const spec = SKIN_SPECS[skin] ?? SKIN_SPECS.gold;
  if (!spec.band) return null;
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius * 1.001, radius * 0.07, 8, 32]} />
      <meshStandardMaterial color={skin === 'gold' ? '#b97a00' : '#7d8596'} metalness={0.6} roughness={0.35} />
    </mesh>
  );
}
