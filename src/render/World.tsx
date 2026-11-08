import { useFrame } from '@react-three/fiber/native';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { DELTA } from '../game/types';
import { Board } from './Board';
import { buildBridgeGeometry } from './bridge';
import { cellX, cellZ } from './coords';
import type { SceneBus } from './bus';
import { DecorLayer } from './decor/DecorLayer';
import type { DecorLibrary } from './decor/models';
import { Features3D } from './Features3D';
import { Slides } from './Slides';
import { decorForQuality, useQuality } from './perf';
import { DecalPool } from './ParticlePool';
import { Decals } from './Particles';
import type { PreparedLevel } from './prepare';
import { BoardSurface } from './surface';
import { WorldKeyContext } from './worldContext';

type Props = {
  prepared: PreparedLevel;
  /** Unique per mounted board (level id + restart counter). */
  worldKey: string;
  bus: SceneBus;
  library: DecorLibrary | null;
  /** Position of this board inside the scene root. */
  offset: [number, number, number];
  visible: boolean;
  /** The board the ball is playing on: it receives the ball's notifications and the splash collisions. */
  active: boolean;
  register: (key: string, group: THREE.Group | null) => void;
};

/** Pause (ms) between the stages of a board that mounts in the background. */
const STAGE_GAP_MS = 60;
/** Stages: 0 island and bridge, 1 maze, 2 special tiles and stains, 3 scenery. */
const STAGES = 3;

/**
 * A board that is only waiting (the next level) mounts a piece at a time, so no single frame creates all its objects. The
 * board being played mounts at once.
 */
function useStages(immediate: boolean): number {
  const [stage, setStage] = useState(immediate ? STAGES : 0);
  useEffect(() => {
    if (stage >= STAGES) return;
    const id = setTimeout(() => setStage((n) => n + 1), STAGE_GAP_MS);
    return () => clearTimeout(id);
  }, [stage]);
  return stage;
}

/**
 * One complete board: grass island (with the pit beside the exit), maze, special tiles, decor and
 * the paint stains left on it. During a level transition two worlds exist at once.
 */
export function LevelWorld({ prepared, worldKey, bus, library, offset, visible, active, register }: Props) {
  const group = useRef<THREE.Group>(null);
  const decals = useMemo(() => new DecalPool(40), []);
  // The bridge behind the entry (it leads to the previous board), or a short stub after the exit of an isolated level.
  const bridge = useMemo(() => {
    const { level } = prepared;
    const ring = level.entry ? { r: level.entry.r, c: level.entry.c, out: DELTA[level.entry.side] } : { r: level.exit.r, c: level.exit.c, out: DELTA[level.exit.dir] };
    return { x: cellX(level, ring.c), z: cellZ(level, ring.r), geometry: buildBridgeGeometry(ring.out[1], ring.out[0]) };
  }, [prepared]);
  useLayoutEffect(() => () => bridge.geometry.dispose(), [bridge]);
  // The bridge in front of the exit lights up a little when the exit opens: the next board's bridge, or the stub of an isolated level.
  const bridgeMat = useRef<THREE.MeshStandardMaterial>(null);
  const bridgeMesh = useRef<THREE.Mesh>(null);
  const glow = useRef(0);
  /** The bridge behind the entry: there while the ball crosses it, then it fades and sinks (and is not there at all in a level that was not arrived at). */
  const seenArrival = useRef(false);
  const bridgeFade = useRef(1);
  useFrame((_, dt) => {
    const m = bridgeMat.current;
    const mesh = bridgeMesh.current;
    if (!m || !mesh) return;
    if (prepared.level.entry) {
      if (bus.arrivalKey === worldKey) {
        seenArrival.current = true;
        bridgeFade.current = 1;
      } else if (active) {
        bridgeFade.current = seenArrival.current ? Math.max(0, bridgeFade.current - dt / 0.7) : 0;
      }
      m.transparent = true;
      m.opacity = bridgeFade.current;
      mesh.visible = bridgeFade.current > 0.01;
      mesh.position.y = -(1 - bridgeFade.current) * 0.35;
    }
    const lit = bus.exitOpenKey !== '' && bus.exitOpenKey === bus.activeKey && (active ? !prepared.level.entry : true);
    glow.current += ((lit ? 1 : 0) - glow.current) * Math.min(1, dt * 5);
    m.emissiveIntensity = glow.current * 0.55;
  });
  const stage = useStages(active);
  const quality = useQuality();
  const decorPlan = useMemo(() => decorForQuality(prepared.decor, quality), [prepared.decor, quality]);
  const surface = useMemo(() => new BoardSurface(prepared.level), [prepared.level]);

  useLayoutEffect(() => {
    // The level transition needs this board's collision data the moment it takes over.
    if (group.current) {
      group.current.userData.surface = surface;
      group.current.userData.decals = decals;
    }
    register(worldKey, group.current);
    return () => register(worldKey, null);
  }, [register, worldKey, surface, decals]);

  // The warm-up draw waits until every piece of the board is mounted.
  useLayoutEffect(() => {
    if (group.current) group.current.userData.ready = stage >= STAGES;
  }, [stage]);

  useLayoutEffect(() => {
    if (!active) return;
    bus.activeKey = worldKey;
    bus.surface = surface;
    bus.decals = decals;
  }, [active, bus, worldKey, surface, decals]);

  return (
    <group ref={group} position={offset} visible={visible}>
      <WorldKeyContext.Provider value={worldKey}>
        <mesh geometry={prepared.island} position-y={active ? 0 : 0.02} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={bridgeMesh} geometry={bridge.geometry} position={[bridge.x, 0, bridge.z]}>
          <meshStandardMaterial ref={bridgeMat} vertexColors roughness={0.85} emissive="#ffd166" emissiveIntensity={0} />
        </mesh>
        {stage >= 1 && <Board level={prepared.level} bus={bus} geometries={prepared.geometries} />}
        {stage >= 2 && <Features3D level={prepared.level} bus={bus} />}
        {stage >= 2 && <Slides level={prepared.level} bus={bus} />}
        {stage >= 2 && <Decals decals={decals} />}
        {stage >= 3 && <DecorLayer plan={decorPlan} library={library} theme={prepared.theme} />}
      </WorldKeyContext.Provider>
    </group>
  );
}
