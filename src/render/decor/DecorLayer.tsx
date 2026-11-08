import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { WorldTheme } from '../../game/worlds';
import { GROUND_Y } from '../coords';
import { getDecorLibrary, preloadDecor, type DecorLibrary, type DecorPart } from './models';
import type { Placed } from './placement';

const themed = new Map<string, THREE.Material>();

/**
 * The material of a part in a given world: the kit's leaves take the world's leaf colours (green in the
 * forest, orange in autumn, frosty in the snow...), and the bushes / tall grass built in code are tinted.
 * One material per world and per kind, shared by every instance.
 */
function materialFor(part: DecorPart, model: string, theme: WorldTheme | undefined): THREE.Material {
  if (!theme) return part.material;
  const { leaves, leavesDark, bushTint, grassTint } = theme.foliage;
  let color: string | null = null;
  if (part.materialName === 'leafsGreen') color = leaves;
  else if (part.materialName === 'leafsDark') color = leavesDark;
  else if (model.startsWith('dune_')) color = theme.ground.near;
  else if ((part.materialName === 'stone' || part.materialName === '_defaultMat') && theme.foliage.rock) color = theme.foliage.rock;
  else if (model.startsWith('bush_')) color = bushTint;
  else if (model.startsWith('grass_')) color = grassTint;
  if (!color) return part.material;
  const key = `${model}|${part.materialName ?? ''}|${color}`;
  let m = themed.get(key);
  if (!m) {
    m = part.material.clone();
    (m as THREE.MeshStandardMaterial).color = new THREE.Color(color);
    themed.set(key, m);
  }
  return m;
}

const POS = new THREE.Vector3();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const M = new THREE.Matrix4();

/** The decor models, once loaded (starts loading them if the home screen has not already). */
export function useDecorLibrary(enabled: boolean): DecorLibrary | null {
  const [library, setLibrary] = useState<DecorLibrary | null>(getDecorLibrary());
  useEffect(() => {
    if (!enabled || library) return;
    let alive = true;
    preloadDecor().then((lib) => alive && setLibrary(lib));
    return () => {
      alive = false;
    };
  }, [enabled, library]);
  return enabled ? library : null;
}

/** One InstancedMesh per mesh of a model, for all the placements of that model. */
function ModelInstances({ model, parts, placements, theme }: { model: string; parts: DecorPart[]; placements: Placed[]; theme?: WorldTheme }) {
  return (
    <>
      {parts.map((part, i) => (
        <PartInstances key={i} part={part} material={materialFor(part, model, theme)} placements={placements} />
      ))}
    </>
  );
}

function PartInstances({ part, material, placements }: { part: DecorPart; material: THREE.Material; placements: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((p, i) => {
      POS.set(p.x, GROUND_Y, p.z);
      QUAT.setFromAxisAngle(UP, p.rotY);
      SCALE.setScalar(p.scale);
      M.compose(POS, QUAT, SCALE).multiply(part.matrix);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [part, placements]);

  // No castShadow / receiveShadow: decor shadows must never fall on the board.
  return (
    <instancedMesh
      key={placements.length}
      ref={ref}
      args={[part.geometry, material, placements.length]}
      frustumCulled={false}
    />
  );
}

/**
 * Scenery around the board (trees, rocks, bushes). The plan comes from the level preparation
 * (deterministic from the level seed, checked against the camera so it never covers a cell,
 * the ball or the exit lane); this only draws it, sharing geometry and materials per model.
 */
export function DecorLayer({ plan, library, theme }: { plan: Placed[]; library: DecorLibrary | null; theme?: WorldTheme }) {
  const groups = useMemo(() => {
    const byModel = new Map<string, Placed[]>();
    for (const p of plan) {
      const list = byModel.get(p.model.name);
      if (list) list.push(p);
      else byModel.set(p.model.name, [p]);
    }
    return [...byModel.entries()];
  }, [plan]);

  if (!library) return null;
  return (
    <group>
      {groups.map(([name, list]) =>
        library.has(name) ? <ModelInstances key={name} model={name} parts={library.get(name)!} placements={list} theme={theme} /> : null,
      )}
    </group>
  );
}
