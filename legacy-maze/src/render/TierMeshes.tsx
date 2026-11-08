import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { DELTA, type Cell, type Level, type Ramp } from '../game/types';
import { PLATEAU_H, cellX, cellZ } from './coords';
import { rampNormal } from './heights';
import { buildTierParts } from './tierGeometry';
import { plankMaterial, rampArrowGeometry, rampArrowMaterial, sharedWoodMaterial } from './slideVisuals';
import { themeForLevel } from '../core/worlds';

/**
 * The fixed parts of the levels with platforms ("étages"): the planks of the sides that face the low floor, with their light top
 * edge, the posts at their corners and the low walls of the ramps (see tierGeometry), the ridges across every ramp (the anti-slip
 * strips, perpendicular to the slope) and the double arrows painted at both ends of it (up and down). The raised floor, the
 * ramps and the paint on them are the board's own tiles, at their height. Nothing here moves.
 */
let ridgeGeometry: THREE.BoxGeometry | null = null;
const ridgeGeo = () => (ridgeGeometry ??= new THREE.BoxGeometry(0.07, 0.035, 0.8));
let ridgeMat: THREE.MeshStandardMaterial | null = null;
const ridgeMaterial = () => (ridgeMat ??= new THREE.MeshStandardMaterial({ roughness: 0.78 }));

/** Ridges along a ramp, from the low edge to the platform edge (offsets in tile units from its middle). */
const RIDGES = [-0.42, -0.14, 0.14, 0.42];
/** Where the two arrows are: between the ridges, near both ends. */
const ARROWS = [-0.28, 0.28];

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const tilt = new THREE.Quaternion();
const yaw = new THREE.Quaternion();
const NO_CELLS: Cell[] = [];
const NO_RAMPS: Ramp[] = [];
const normal = new THREE.Vector3();
const color = new THREE.Color();

export function TierMeshes({ level }: { level: Level }) {
  const raised = level.features.raised ?? NO_CELLS;
  const ramps = level.features.ramps ?? NO_RAMPS;
  const theme = themeForLevel(level.id);
  const parts = useMemo(() => buildTierParts(level, theme.wood), [level, theme.wood]);
  useEffect(
    () => () => {
      parts.trim?.dispose();
      parts.fittings?.dispose();
    },
    [parts],
  );
  const ridges = useRef<THREE.InstancedMesh>(null);
  const arrows = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const place = (mesh: THREE.InstancedMesh | null, offsets: number[], lift: number, along: boolean, tinted: boolean) => {
      if (!mesh) return;
      let n = 0;
      for (const k of ramps) {
        const [dr, dc] = DELTA[k.up];
        const nm = rampNormal(k.up);
        normal.set(nm[0], nm[1], nm[2]);
        for (const o of offsets) {
          // o along the slope toward the platform; the surface there is at height PLATEAU_H * (o + 0.5).
          dummy.position.set(cellX(level, k.c) + dc * o + normal.x * lift, PLATEAU_H * (o + 0.5) + normal.y * lift, cellZ(level, k.r) + dr * o + normal.z * lift);
          // Ridges: long across the slope. Arrows: their "up" points toward the platform.
          if (along) yaw.setFromAxisAngle(Y_AXIS, Math.atan2(-dc, -dr));
          else yaw.setFromAxisAngle(Y_AXIS, dc !== 0 ? 0 : Math.PI / 2);
          dummy.quaternion.copy(yaw).premultiply(tilt.setFromUnitVectors(UP, normal));
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          if (tinted) mesh.setColorAt(n, color.setHSL(0.095, theme.wood.sat, 0.62 * theme.wood.tone));
          n++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    place(ridges.current, RIDGES, 0.018, false, true);
    place(arrows.current, ARROWS, 0.056, true, false);
  }, [level, ramps, dummy, theme.wood]);

  if (raised.length === 0 && ramps.length === 0) return null;
  return (
    <group>
      {parts.trim && <mesh geometry={parts.trim} material={plankMaterial()} receiveShadow />}
      {parts.fittings && <mesh geometry={parts.fittings} material={sharedWoodMaterial()} castShadow receiveShadow />}
      {ramps.length > 0 && <instancedMesh ref={ridges} args={[ridgeGeo(), ridgeMaterial(), ramps.length * RIDGES.length]} frustumCulled={false} receiveShadow />}
      {ramps.length > 0 && <instancedMesh ref={arrows} args={[rampArrowGeometry(), rampArrowMaterial(), ramps.length * ARROWS.length]} frustumCulled={false} renderOrder={3} />}
    </group>
  );
}
