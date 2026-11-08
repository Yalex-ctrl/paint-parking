import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';

import { applyMove, createState } from '../../game/engine';
import { LEVELS } from '../../game/levels';
import { pickDemoLevels } from '../../game/demoLevels';
import { themeForLevel } from '../../core/worlds';
import type { Level } from '../../game/types';
import { ambienceFor, WorldAmbience } from '../ambience';
import { Ball } from '../Ball';
import { SceneBus } from '../bus';
import { Clouds } from '../clouds';
import { useDecorLibrary } from '../../core/render/decor/DecorLayer';
import { planDecor } from '../../core/render/decor/placement';
import { ThemeRig, useEnvironment } from '../GameCanvas';
import { buildBoardGeometries } from '../geometry';
import { buildIslandGeometry, groundColors } from '../island';
import { FirstFrame } from '../FirstFrame';
import { MAX_PIXEL_RATIO } from '../../core/render/perf';
import { ParticlePool } from '../../core/render/ParticlePool';
import { Particles } from '../Particles';
import type { PreparedLevel } from '../prepare';
import { RenderStyleContext } from '../style';
import { Trail } from '../Trail';
import { LevelWorld } from '../World';

/** Neutral night blue: what shows for the first frames, before the sky is drawn. */
const CLEAR = '#1d1733';

/** The island of the diorama: everything the game's own board needs, built around a small level. */
function buildDiorama(level: Level, worldLevelId: number): PreparedLevel {
  const theme = themeForLevel(worldLevelId);
  const R = 12;
  const spec = { r0: -R, r1: level.rows + R, c0: -R, c1: level.cols + R, pit: new Set<number>() };
  const geometries = buildBoardGeometries(level, theme.wood);
  const island = buildIslandGeometry(level, spec, groundColors(theme.ground));
  // Decor all around (the camera sways), never on the board or in the exit lane.
  const decor = planDecor(level, () => true, theme.decor).map((p) => p);
  const camera = new THREE.PerspectiveCamera();
  return {
    id: level.id,
    level,
    theme,
    geometries,
    island,
    islandSpec: spec,
    decor,
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    dist: 15,
    dispose: () => {
      geometries.walls.dispose();
      geometries.shadows.dispose();
      geometries.slab.dispose();
      island.dispose();
    },
  };
}

const dioramaCache = new Map<string, PreparedLevel>();

/** What the camera does: a slow sway around the island, and a dive toward the board when the player taps Play. */
export class HomeControl {
  dive = false;
  setDive(on: boolean) {
    this.dive = on;
  }
}

/**
 * Distance at which the board fills about 86 % of the width of the screen (and not more than 55 % of its height): the demo is
 * framed tight in the free space between the title and the buttons, however big the board.
 */
function fitDistance(level: Level, aspect: number): number {
  const tanHalf = Math.tan((40 * Math.PI) / 360);
  const byWidth = level.cols / (0.86 * 2 * tanHalf * aspect);
  const byHeight = (level.rows * 0.8) / (0.55 * 2 * tanHalf);
  return Math.max(9, Math.max(byWidth, byHeight));
}

function OrbitCamera({ control, target, level }: { control: HomeControl; target: THREE.Vector3; level: Level }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dive = useRef(0);
  useEffect(() => {
    camera.fov = 40;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.near = 0.1;
    camera.far = 300;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    dive.current = control.dive ? Math.min(1, dive.current + dt / 0.75) : Math.max(0, dive.current - dt / 0.4);
    const e = dive.current * dive.current * (3 - 2 * dive.current);
    const angle = Math.sin(t * 0.13) * 0.3; // a slow sway left and right
    const base = fitDistance(level, size.width / Math.max(1, size.height));
    const radius = base - e * base * 0.68;
    const elevation = 0.95 - e * 0.1;
    camera.position.set(
      target.x + Math.sin(angle) * radius * Math.cos(elevation),
      target.y + Math.sin(elevation) * radius + Math.sin(t * 0.3) * 0.15,
      target.z + Math.cos(angle) * radius * Math.cos(elevation),
    );
    camera.lookAt(target.x, target.y - e * 0.5, target.z);
  });
  return null;
}

/**
 * The player's equipped ball rolling over a small board in an endless loop: it plays the stored solution, paints the
 * tiles, splashes against the walls, falls through the exit, and the board starts again.
 */
function DemoPlayer({ bus, level, onLoop, leaving }: { bus: SceneBus; level: Level; onLoop: () => void; leaving: { set: (v: boolean) => void } }) {
  const state = useRef(createState(level));
  const index = useRef(0);
  useEffect(() => {
    state.current = createState(level);
    index.current = 0;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const next = () => {
      if (!alive) return;
      const dir = level.solution[index.current] as 'U' | 'D' | 'L' | 'R' | undefined;
      if (!dir) return;
      const res = applyMove(level, state.current, dir);
      index.current++;
      if (res) bus.slide({ result: res });
    };
    bus.onSlideDone = (exited) => {
      if (!alive) return;
      if (exited) {
        timers.push(setTimeout(() => leaving.set(true), 1100));
        timers.push(
          setTimeout(() => {
            if (alive) onLoop();
          }, 1600),
        );
      } else {
        timers.push(setTimeout(next, 700));
      }
    };
    timers.push(setTimeout(next, 1100));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      bus.onSlideDone = undefined;
    };
  }, [bus, level, onLoop, leaving]);
  return null;
}

/** Seconds the next board takes to grow from the ground, and the one that is leaving to sink. */
const GROW_SECONDS = 0.55;
const SINK_SECONDS = 0.5;

/** Hands the board's group a scale: it grows when a new board arrives, sinks when the demo is over. */
function BoardMotion({ group, leaving, levelKey }: { group: React.RefObject<THREE.Group | null>; leaving: { get: () => boolean }; levelKey: number }) {
  const sink = useRef(0);
  const seen = useRef(-1);
  const arrivedAt = useRef(0);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (seen.current !== levelKey) {
      seen.current = levelKey;
      arrivedAt.current = performance.now() / 1000;
    }
    const grow = Math.min(1, (performance.now() / 1000 - arrivedAt.current) / GROW_SECONDS);
    const eased = 1 - Math.pow(1 - grow, 3);
    sink.current = leaving.get() ? Math.min(1, sink.current + 1 / 60 / SINK_SECONDS) : 0;
    const k = eased * (1 - sink.current);
    g.scale.setScalar(Math.max(0.001, k));
    g.position.y = -(1 - k) * 2;
  });
  return null;
}

function Diorama({ control, worldLevelId, completed, ball, paint }: { control: HomeControl; worldLevelId: number; completed: number; ball: string; paint: string }) {
  // The levels this visit plays, in an order that changes every time; another one follows each time a demo ends.
  const demos = useMemo(() => pickDemoLevels(LEVELS, completed), [completed]);
  const [index, setIndex] = useState(0);
  const level = demos[index % demos.length];
  const leavingRef = useRef(false);
  const leaving = useMemo(() => ({ get: () => leavingRef.current, set: (v: boolean) => { leavingRef.current = v; } }), []);
  const boardGroup = useRef<THREE.Group>(null);
  // Built once per level and world, then kept: coming back to the home screen builds nothing again.
  const prepared = useMemo(() => {
    const key = `${level.id}:${themeForLevel(worldLevelId).id}`;
    let hit = dioramaCache.get(key);
    if (!hit) {
      hit = buildDiorama(level, worldLevelId);
      dioramaCache.set(key, hit);
      // Only a few are kept (the oldest goes first).
      if (dioramaCache.size > 10) {
        const [oldKey, old] = dioramaCache.entries().next().value as [string, PreparedLevel];
        old.dispose();
        dioramaCache.delete(oldKey);
      }
    }
    return hit;
  }, [level, worldLevelId]);
  const bus = useMemo(() => new SceneBus(), []);
  const pool = useMemo(() => new ParticlePool(190), []);
  const library = useDecorLibrary(true);
  const env = useEnvironment();
  const [run, setRun] = useState(0);
  const loop = useCallback(() => {
    leavingRef.current = false;
    setIndex((i) => i + 1);
    setRun((r) => r + 1);
  }, []);
  const noRegister = useCallback(() => {}, []);
  const target = useMemo(() => new THREE.Vector3(0, -0.6, 0.5), []);
  const style = useMemo(() => ({ ball, paint, env }), [ball, paint, env]);
  const cloudCentre = useCallback(() => target, [target]);
  const ambience = ambienceFor(prepared.theme.id);
  const span = Math.max(level.cols, level.rows);

  useEffect(() => {
    pool.setPaintEffect(paint);
    pool.setPaintColor(level.color);
  }, [pool, level.color, paint]);

  return (
    <RenderStyleContext.Provider value={style}>
      <ThemeRig theme={prepared.theme} span={span} />
      <OrbitCamera control={control} target={target} level={level} />
      <BoardMotion group={boardGroup} leaving={leaving} levelKey={index} />
      <group ref={boardGroup}>
      <LevelWorld
        key={`home-${run}`}
        prepared={prepared}
        worldKey={`home-${run}`}
        bus={bus}
        library={library}
        offset={[0, 0, 0]}
        visible
        active
        register={noRegister}
      />
      <Trail bus={bus} color={level.color} />
      <Ball level={level} resetKey={`home-${run}`} bus={bus} particles={pool} envMap={env} />
      <Particles pool={pool} bus={bus} />
      </group>
      <DemoPlayer key={`player-${run}`} bus={bus} level={level} onLoop={loop} leaving={leaving} />
      <Clouds center={cloudCentre} />
      <WorldAmbience kind={ambience} center={cloudCentre} area={[16, 8, 16]} />
    </RenderStyleContext.Provider>
  );
}

/**
 * The home screen's background: a diorama of the world the player is in, full screen, behind the interface. It stays
 * mounted while the home is shown and is torn down with it.
 */
export function HomeScene({ control, worldLevelId, completed, ball, paint, onReady }: { control: HomeControl; worldLevelId: number; completed: number; ball: string; paint: string; onReady?: () => void }) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 40, near: 0.1, far: 300, position: [0, 10, 14] }}
      gl={{ antialias: true }}
      onCreated={({ gl, size }) => {
        gl.setClearColor(CLEAR, 1);
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.setPixelRatio(Math.min(PixelRatio.get(), MAX_PIXEL_RATIO));
        gl.setSize(size.width, size.height, false);
      }}
    >
      <FirstFrame onReady={onReady} />
      <Diorama control={control} worldLevelId={worldLevelId} completed={completed} ball={ball} paint={paint} />
    </Canvas>
  );
}
