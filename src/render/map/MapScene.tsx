import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';

import {
  chestLevel,
  levelAtZ,
  levelPoint,
  padState,
  worldFirstLevel,
  worldLastLevel,
  worldOfLevel,
} from '../../game/mapLayout';
import { themeForLevel, type WorldTheme } from '../../game/worlds';
import { FirstFrame } from '../FirstFrame';
import { PerfMonitor } from '../PerfMonitor';
import { MAX_PIXEL_RATIO } from '../perf';
import { DecorLayer, useDecorLibrary } from '../decor/DecorLayer';
import { ThemeRig, useEnvironment } from '../GameCanvas';
import { Chest, CurrentBall, Pads } from './mapObjects';
import { FlyingCoin, RollingBalls } from './mapLife';
import { planMapDecor } from './mapDecor';
import { pathRibbon, recolorRibbon, worldGround } from './mapGeometry';
import type { MapHit, MapShared } from './mapState';

const CLEAR = '#1d1733';
// The camera looks from high and far: eight to ten pads on screen, scenery on both sides of the path.
const CAM_HEIGHT = 25.6;
const CAM_BACK = 17.9;
const LOOK_AHEAD = 0;
/** The view is slid a little to the right so the column of buttons on the left never covers the pad of the current level. */
const CAM_SHIFT_X = 1.0;
/** Levels drawn behind and ahead of the one in the middle of the screen. */
const BEHIND = 8;
const AHEAD = 20;
export const WINDOW = BEHIND + AHEAD + 1;

const V = new THREE.Vector3();

/** The pads' colours for the path of one world: warm wood for most, grey stone in the snow, red sandstone in the desert. */
function pathColors(theme: WorldTheme): [THREE.Color, THREE.Color] {
  const base = new THREE.Color().setHSL(theme.id === 'snow' ? 0.6 : 0.095, theme.id === 'snow' ? 0.12 : theme.wood.sat * 0.8, 0.47 * Math.min(1.1, theme.wood.tone + 0.15) + 0.1);
  return [base.clone(), base.clone().offsetHSL(0, 0, -0.012)];
}

const themeOfWorld = (w: number) => themeForLevel(worldFirstLevel(w));

/** Scrolling: inertia after a flick, limits, and the camera that follows. Also tells the screen where we are. */
function MapCamera({ shared, onWindow }: { shared: MapShared; onWindow: (focus: number) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const lastFocus = useRef(-1);
  const lastWorld = useRef(-1);

  useEffect(() => {
    camera.fov = 40;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.near = 0.1;
    camera.far = 200;
    camera.updateProjectionMatrix();
    // How far the ground moves for one pixel of finger: the visible depth at the middle of the screen, over its height.
    const d = Math.hypot(CAM_HEIGHT, CAM_BACK + LOOK_AHEAD);
    const elevation = Math.atan2(CAM_HEIGHT, CAM_BACK + LOOK_AHEAD);
    shared.worldPerPx = (2 * d * Math.tan((40 * Math.PI) / 360)) / Math.sin(elevation) / Math.max(1, size.height);
  }, [camera, size, shared]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    if (!shared.dragging) {
      shared.z += shared.velocity * dt;
      shared.velocity *= Math.exp(-3.2 * dt);
      if (Math.abs(shared.velocity) < 0.02) shared.velocity = 0;
    }
    // Soft limits: a little give beyond the ends, then it springs back.
    if (shared.z > shared.maxZ) {
      if (!shared.dragging) shared.z += (shared.maxZ - shared.z) * Math.min(1, dt * 9);
      shared.z = Math.min(shared.z, shared.maxZ + 1.5);
    }
    if (shared.z < shared.minZ) {
      if (!shared.dragging) shared.z += (shared.minZ - shared.z) * Math.min(1, dt * 9);
      shared.z = Math.max(shared.z, shared.minZ - 1.5);
    }
    const focus = levelAtZ(shared.z);
    const x = levelPoint(focus).x * 0.4 - CAM_SHIFT_X;
    camera.position.set(x, CAM_HEIGHT, shared.z + CAM_BACK);
    camera.lookAt(x, 0, shared.z - LOOK_AHEAD);
    shared.focusLevel = focus;
    const f = Math.floor(focus);
    if (f !== lastFocus.current) {
      lastFocus.current = f;
      onWindow(f);
    }
    const w = worldOfLevel(Math.max(1, Math.round(focus)));
    if (w !== lastWorld.current) {
      lastWorld.current = w;
      shared.onWorld?.(w);
    }
  });
  return null;
}

/** Turns a tap on the screen into what was hit: a flying coin, the balloon, a chest, or a level pad. */
function MapPicker({ shared }: { shared: MapShared }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    shared.pickAt = (sx, sy) => {
      camera.updateMatrixWorld(true);
      const screen = (x: number, y: number, z: number) => {
        V.set(x, y, z).project(camera);
        if (V.z > 1) return null;
        return { x: (V.x * 0.5 + 0.5) * size.width, y: (1 - (V.y * 0.5 + 0.5)) * size.height };
      };
      const near = (p: { x: number; y: number } | null, r: number) => (p ? Math.hypot(p.x - sx, p.y - sy) <= r : false);
      const coin = shared.dyn.coin;
      if (coin.active) {
        const p = screen(coin.pos.x, coin.pos.y, coin.pos.z);
        if (near(p, 60 + (coin.value > 1 ? 30 : 0))) return { kind: 'coin', id: 0, value: coin.value, sx: p!.x, sy: p!.y } as MapHit;
      }
      const focus = Math.floor(levelAtZ(shared.z));
      const from = Math.max(1, focus - BEHIND);
      const to = focus + AHEAD;
      for (let k = Math.ceil(from / 10); k <= Math.floor(to / 10); k++) {
        const p = levelPoint(chestLevel(k));
        const side = k % 2 === 0 ? -1 : 1;
        const cp = screen(p.x + side * 2.7, 0.5, p.z);
        if (near(cp, 48)) return { kind: 'chest', id: k, sx: cp!.x, sy: cp!.y };
      }
      let best: MapHit | null = null;
      let bestD = 38;
      for (let id = from; id <= to; id++) {
        const p = levelPoint(id);
        const lp = screen(p.x, 0.4, p.z);
        if (!lp) continue;
        const d = Math.hypot(lp.x - sx, lp.y - sy);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'level', id, sx: lp.x, sy: lp.y };
        }
      }
      return best;
    };
  }, [shared, camera, size]);
  return null;
}

/** One world's strip of the map: its ground (blending from the previous world's), the path, and the scenery along it. */
/**
 * What a world of the map is made of (its ground, its path, the plan of its scenery) is built the first time it is seen and kept:
 * coming back to the map costs nothing. (A few dozen kilobytes per world; the map has a handful of them in sight at a time.)
 */
const worldCache = new Map<number, { ground: THREE.BufferGeometry; ribbon: THREE.BufferGeometry; edge: THREE.BufferGeometry; decor: ReturnType<typeof planMapDecor> }>();
const EDGE = new THREE.Color('#6c6a82');

function MapWorld({ world, library, shared }: { world: number; library: ReturnType<typeof useDecorLibrary>; shared: MapShared }) {
  const theme = themeOfWorld(world);
  const prev = world > 0 ? themeOfWorld(world - 1) : theme;
  const built = useMemo(() => {
    const hit = worldCache.get(world);
    if (hit) return hit;
    const [a, b] = pathColors(theme);
    const made = {
      ground: worldGround(
        worldFirstLevel(world),
        worldLastLevel(world),
        new THREE.Color(theme.ground.near),
        new THREE.Color(theme.ground.far),
        new THREE.Color(prev.ground.near),
        new THREE.Color(prev.ground.far),
      ),
      ribbon: pathRibbon(worldFirstLevel(world) - 1, worldLastLevel(world) + 1, 1.7, a, b),
      // A slightly wider, darker ribbon under it: the soft edge of the path, the same width all along.
      edge: pathRibbon(worldFirstLevel(world) - 1, worldLastLevel(world) + 1, 2.0, EDGE, EDGE, 0.025),
      decor: planMapDecor(world, theme),
    };
    worldCache.set(world, made);
    return made;
  }, [world, theme, prev]);
  const { ground, ribbon, edge, decor } = built;
  // The path takes the colour of the levels as they are finished (the one the ball is about to walk waits for it to arrive).
  const seen = useRef(-1);
  useFrame(() => {
    if (seen.current === shared.pathVersion) return;
    seen.current = shared.pathVersion;
    recolorRibbon(ribbon, worldFirstLevel(world) - 1, (id) => !!shared.stars[id] && !(shared.hop && shared.hop.from === id));
  });
  // The ground and the path stay in the cache: they are not disposed with the screen.
  return (
    <group>
      <mesh geometry={ground} position={[0, -0.02, 0]}>
        <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={edge}>
        <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={ribbon}>
        <meshStandardMaterial vertexColors roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <DecorLayer plan={decor} library={library} theme={theme} />
    </group>
  );
}

/**
 * The number of each level is written by the screen, in the app's own font (crisp at any zoom), over the pad:
 * every frame the pad's position on the screen and its size are handed over. Twenty slots are reused as levels scroll.
 */
const LABEL_SLOTS = 20;
function LevelLabels({ shared }: { shared: MapShared }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const focus = Math.floor(levelAtZ(shared.z));
    const first = Math.max(1, focus - 6);
    const hidden = new Set<number>();
    for (let id = first; id < first + LABEL_SLOTS; id++) {
      const slot = id % LABEL_SLOTS;
      hidden.add(slot);
      const p = levelPoint(id);
      V.set(p.x, 0.55, p.z).project(camera);
      const cx = (V.x * 0.5 + 0.5) * size.width;
      const cy = (1 - (V.y * 0.5 + 0.5)) * size.height;
      const behind = V.z > 1;
      V.set(p.x + PAD_R_LABEL, 0.55, p.z).project(camera);
      const r = Math.abs((V.x * 0.5 + 0.5) * size.width - cx);
      const shown = !behind && cx > -40 && cx < size.width + 40 && cy > -40 && cy < size.height + 40;
      const state = padState(id, shared.current, shared.stars);
      shared.onLabel?.(slot, id, cx, cy, r / 34, state === 'locked', shown);
    }
  });
  return null;
}
const PAD_R_LABEL = 0.72;

/** The banner that announces each world: its text is a screen label, centred on the path at the start of the world. */
function WorldSigns({ shared, worlds }: { shared: MapShared; worlds: number[] }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    worlds.forEach((w, slot) => {
      const p = levelPoint(worldFirstLevel(w) - 0.55);
      V.set(p.x, 0.3, p.z).project(camera);
      const visible = V.z < 1 && Math.abs(V.x) < 1.2 && Math.abs(V.y) < 1.2;
      shared.onSign?.(slot, (V.x * 0.5 + 0.5) * size.width, (1 - (V.y * 0.5 + 0.5)) * size.height, visible ? themeOfWorld(w).name : null);
    });
    for (let slot = worlds.length; slot < 2; slot++) shared.onSign?.(slot, 0, 0, null);
  });
  return null;
}


/** Rate (frames per second) at which the resting map still redraws, so the clouds and butterflies keep a gentle life. */
const IDLE_FPS = 12;
/** The map keeps drawing at full rate this long after the last movement (a settling bounce, a star dropping...). */
const HOLD_MS = 1600;

/**
 * Lets the map rest: while it scrolls, a finger is on it or something is moving (the ball hopping, a coin, stars falling) it
 * draws every frame; once it has been still for a moment it switches to on-demand drawing and only redraws IDLE_FPS times a
 * second. A phone that is not asked to draw 60 frames of a motionless scene stays cool and keeps its battery.
 */
function FrameGovernor({ shared }: { shared: MapShared }) {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let lastZ = shared.z;
    let lastOpened = shared.opened.length;
    let lastPath = shared.pathVersion;
    let lastCurrent = shared.current;
    let lastActive = Date.now();
    let mode: 'always' | 'demand' = 'always';
    shared.wake = () => {
      lastActive = Date.now();
      if (mode !== 'always') {
        mode = 'always';
        setFrameloop('always');
        invalidate();
      }
    };
    const id = setInterval(() => {
      const moving =
        shared.dragging ||
        shared.velocity !== 0 ||
        shared.z !== lastZ ||
        !!shared.hop ||
        !!shared.starDrop ||
        !!shared.lockPop ||
        shared.dyn.coin.active ||
        shared.opened.length !== lastOpened ||
        shared.pathVersion !== lastPath ||
        shared.current !== lastCurrent;
      lastZ = shared.z;
      lastOpened = shared.opened.length;
      lastPath = shared.pathVersion;
      lastCurrent = shared.current;
      const now = Date.now();
      if (moving) lastActive = now;
      const want = now - lastActive < HOLD_MS ? 'always' : 'demand';
      if (want !== mode) {
        mode = want;
        setFrameloop(want);
      }
      if (mode === 'demand') invalidate();
    }, 1000 / IDLE_FPS);
    return () => {
      clearInterval(id);
      shared.wake = undefined;
      setFrameloop('always');
    };
  }, [shared, setFrameloop, invalidate]);
  return null;
}

function Content({ shared }: { shared: MapShared }) {
  const library = useDecorLibrary(true);
  const env = useEnvironment();
  const [focus, setFocus] = useState(() => Math.floor(levelAtZ(shared.z)));
  const [worldIdx, setWorldIdx] = useState(() => worldOfLevel(Math.max(1, Math.round(levelAtZ(shared.z)))));

  const onWindow = useCallback((f: number) => setFocus(f), []);
  useEffect(() => {
    shared.onWorld = (w) => setWorldIdx(w);
    return () => {
      shared.onWorld = undefined;
    };
  }, [shared]);

  const from = Math.max(1, focus - BEHIND);
  const to = from + WINDOW - 1;
  // At most two worlds are alive at once: the one(s) the window overlaps.
  const worlds = useMemo(() => {
    const a = worldOfLevel(from);
    const b = worldOfLevel(to);
    return a === b ? [a] : [a, b];
  }, [from, to]);
  const theme = themeOfWorld(worldIdx);
  const chests: number[] = [];
  for (let k = Math.ceil(from / 10); k <= Math.floor(to / 10); k++) chests.push(k);

  return (
    <>
      <ThemeRig theme={theme} span={14} />
      <MapCamera shared={shared} onWindow={onWindow} />
      <MapPicker shared={shared} />
      {worlds.map((w) => (
        <MapWorld key={w} world={w} library={library} shared={shared} />
      ))}
      <WorldSigns shared={shared} worlds={worlds} />
      <LevelLabels shared={shared} />
      <Pads shared={shared} from={from} to={to} />
      {chests.map((k) => (
        <Chest key={k} shared={shared} k={k} />
      ))}
      <CurrentBall shared={shared} envMap={env} />
      <FlyingCoin shared={shared} />
      <RollingBalls shared={shared} envMap={env} />
    </>
  );
}

/** The map of levels: a vertical 3D path, scrolled by the screen through the shared object. */
export function MapScene({ shared, onReady }: { shared: MapShared; onReady?: () => void }) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      camera={{ fov: 40, near: 0.1, far: 200, position: [0, CAM_HEIGHT, CAM_BACK] }}
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
      {/* Measured like the game (dev logs), but a slow map never lowers the quality of the game. */}
      <PerfMonitor adapt={false} phase="map" />
      <FrameGovernor shared={shared} />
      <Content shared={shared} />
    </Canvas>
  );
}

