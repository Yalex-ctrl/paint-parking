import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

import { DECOR_MODELS } from '../core/render/decor/catalog';
import { getDecorLibrary, preloadDecor, type DecorLibrary, type DecorPart } from '../core/render/decor/models';
import { MAX_PIXEL_RATIO } from '../core/render/perf';
import { createRng } from '../core/rng';
import { DELTA } from '../core/grid';
import type { Level } from '../game/types';
import { fitCamera, type Margins } from './cameraFit';
import { cellAt, ROAD_W, SIDEWALK, SLAB_H, VEHICLE_H } from './coords';
import { digitTexture, emojiTexture } from './textures';
import { crownGeometry, lightsGeometry, shadowGeometry, carGeometry } from './vehicleGeometry';
import { buildLotGeometry, gateGeometry } from './lotGeometry';
import { EMOJIS, PUFFS, TRAIL_CAPACITY, type ParkingScene } from './ParkingScene';
import { LOT_COLORS } from './palette';

/** Clear colour: only visible for a few frames at start-up. */
const SKY_BG = '#a9cdee';

/** What the screen needs from the scene to turn a touch into a vehicle. */
export type PickBridge = {
  camera: THREE.PerspectiveCamera | null;
  width: number;
  height: number;
  /** The grid cell under a point of the canvas (pixels), or null when it is outside the lot. */
  pick: (x: number, y: number) => [number, number] | null;
  /** The pixel under a point of the ground (to put the help hand on a vehicle). */
  toScreen: (x: number, z: number, y?: number) => { x: number; y: number } | null;
};

export function createPickBridge(level: () => Level): PickBridge {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const p = new THREE.Vector3();
  const bridge: PickBridge = {
    camera: null,
    width: 0,
    height: 0,
    pick(x, y) {
      if (!bridge.camera || bridge.width === 0) return null;
      ndc.set((x / bridge.width) * 2 - 1, -(y / bridge.height) * 2 + 1);
      ray.setFromCamera(ndc, bridge.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return cellAt(level(), hit.x, hit.z);
    },
    toScreen(x, z, y = 0.3) {
      if (!bridge.camera || bridge.width === 0) return null;
      p.set(x, y, z).project(bridge.camera);
      return { x: ((p.x + 1) / 2) * bridge.width, y: ((1 - p.y) / 2) * bridge.height };
    },
  };
  return bridge;
}

type Props = {
  level: Level;
  scene: ParkingScene;
  bridge: PickBridge;
  margins: Margins;
  /** False while another screen is on top: nothing is drawn. */
  active?: boolean;
  /** Scenery around the board (the "Décors" setting). */
  decor: boolean;
  onReady?: () => void;
};

/* ----------------------------------------------------------------------------------------- shared */

// Geometries and materials are made once and shared by every level.
let shared: {
  car: THREE.BufferGeometry;
  truck: THREE.BufferGeometry;
  carLights: THREE.BufferGeometry;
  truckLights: THREE.BufferGeometry;
  carShadow: THREE.BufferGeometry;
  truckShadow: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  body: THREE.MeshLambertMaterial;
  lit: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  lot: THREE.MeshLambertMaterial;
  paint: THREE.MeshBasicMaterial;
  puff: THREE.MeshBasicMaterial;
  trailGeo: THREE.BufferGeometry;
  puffGeo: THREE.BufferGeometry;
} | null = null;

function sharedAssets() {
  if (shared) return shared;
  const trailGeo = new THREE.PlaneGeometry(0.46, 0.52);
  trailGeo.rotateX(-Math.PI / 2);
  shared = {
    car: carGeometry(2),
    truck: carGeometry(3),
    carLights: lightsGeometry(2),
    truckLights: lightsGeometry(3),
    carShadow: shadowGeometry(2),
    truckShadow: shadowGeometry(3),
    crown: crownGeometry(),
    body: new THREE.MeshLambertMaterial({ vertexColors: true }),
    lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    shadow: new THREE.MeshBasicMaterial({ color: '#1a1530', transparent: true, opacity: 0.28, depthWrite: false }),
    lot: new THREE.MeshLambertMaterial({ vertexColors: true }),
    paint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    puff: new THREE.MeshBasicMaterial({ color: '#e8e6ef', transparent: true, opacity: 0.7, depthWrite: false }),
    trailGeo,
    puffGeo: new THREE.SphereGeometry(0.5, 8, 6),
  };
  return shared;
}

/* ----------------------------------------------------------------------------------------- camera, light, input */

function CameraRig({ level, margins, bridge }: { level: Level; margins: Margins; bridge: PickBridge }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useLayoutEffect(() => {
    if (width === 0 || height === 0) return;
    fitCamera(camera, level, width, height, margins);
    bridge.camera = camera;
    bridge.width = width;
    bridge.height = height;
  }, [camera, level, width, height, margins, bridge]);
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.85} color="#fff4e8" />
      <hemisphereLight args={['#dbe9ff', '#7a8a5a', 0.55]} />
      <directionalLight position={[-6, 12, 7]} intensity={1.15} color="#fff1d6" />
    </>
  );
}

function Ready({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    if (++frames.current >= 3) {
      fired.current = true;
      onReady?.();
    }
  });
  return null;
}

/* ----------------------------------------------------------------------------------------- the lot */

function Lot({ level, scene }: { level: Level; scene: ParkingScene }) {
  const { lot } = sharedAssets();
  const geometry = useMemo(() => buildLotGeometry(level), [level]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const gates = useMemo(() => level.gates.map((_, i) => gateGeometry(level, i)), [level]);
  useEffect(() => () => gates.forEach((g) => g.geometry.dispose()), [gates]);
  return (
    <group>
      <mesh geometry={geometry} material={lot} />
      {gates.map((g, i) => (
        <Gate key={i} level={level} scene={scene} index={i} info={g} />
      ))}
      <mesh position={[0, -SLAB_H - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 90]} />
        <meshLambertMaterial color={LOT_COLORS.grass} />
      </mesh>
    </group>
  );
}

function Gate({ level, scene, index, info }: { level: Level; scene: ParkingScene; index: number; info: ReturnType<typeof gateGeometry> }) {
  const { lot } = sharedAssets();
  const group = useRef<THREE.Group>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const spriteMat = useRef<THREE.SpriteMaterial>(null);
  const open = useRef(0);
  const shown = useRef(-1);
  const need = level.gates[index].need;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const remaining = Math.max(0, need - scene.exited);
    const target = remaining === 0 ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * 7);
    g.position.y = info.y - open.current * 0.75;
    if (remaining !== shown.current && spriteMat.current) {
      if (remaining === 0 && shown.current > 0) scene.onEvent?.('gateOpen');
      shown.current = remaining;
      spriteMat.current.map = digitTexture(remaining);
      spriteMat.current.needsUpdate = true;
    }
    if (sprite.current) sprite.current.visible = open.current < 0.6;
  });
  return (
    <group ref={group} position={[info.x, info.y, info.z]} rotation={[0, info.yaw, 0]}>
      <mesh geometry={info.geometry} material={lot} />
      <sprite ref={sprite} position={[0, 0.95, 0]} scale={[0.62, 0.62, 1]}>
        <spriteMaterial ref={spriteMat} map={digitTexture(need)} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/* ----------------------------------------------------------------------------------------- vehicles */

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _c = new THREE.Color();

function Vehicles({ scene }: { scene: ParkingScene }) {
  const a = sharedAssets();
  const cars = useMemo(() => scene.actors.filter((x) => x.len === 2), [scene]);
  const trucks = useMemo(() => scene.actors.filter((x) => x.len === 3), [scene]);
  const refs = {
    car: useRef<THREE.InstancedMesh>(null),
    carLights: useRef<THREE.InstancedMesh>(null),
    carShadow: useRef<THREE.InstancedMesh>(null),
    truck: useRef<THREE.InstancedMesh>(null),
    truckLights: useRef<THREE.InstancedMesh>(null),
    truckShadow: useRef<THREE.InstancedMesh>(null),
  };
  const crown = useRef<THREE.Mesh>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    for (const [mesh, list] of [
      [refs.car.current, cars],
      [refs.truck.current, trucks],
    ] as const) {
      if (!mesh) continue;
      list.forEach((actor, i) => mesh.setColorAt(i, actor.color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    first.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, trucks]);

  useFrame(() => {
    if (!first.current && !scene.active) return;
    first.current = false;
    const write = (list: typeof cars, body: THREE.InstancedMesh | null, lights: THREE.InstancedMesh | null, shadow: THREE.InstancedMesh | null) => {
      if (!body || !lights || !shadow) return;
      list.forEach((actor, i) => {
        const hide = actor.hidden;
        _s.setScalar(hide ? 0 : 1);
        _q.setFromAxisAngle(Y, actor.yaw);
        _q2.setFromAxisAngle(Z, -actor.pitch);
        _q3.setFromAxisAngle(X, actor.roll);
        _q.multiply(_q2).multiply(_q3);
        _p.set(actor.x, 0.03, actor.z);
        _m.compose(_p, _q, _s);
        body.setMatrixAt(i, _m);
        lights.setMatrixAt(i, _m);
        _q.setFromAxisAngle(Y, actor.yaw);
        _p.set(actor.x, 0.036, actor.z);
        _m.compose(_p, _q, _s);
        shadow.setMatrixAt(i, _m);
      });
      body.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
    };
    write(cars, refs.car.current, refs.carLights.current, refs.carShadow.current);
    write(trucks, refs.truck.current, refs.truckLights.current, refs.truckShadow.current);
    const c = crown.current;
    const p = scene.actors[scene.player];
    if (c) {
      c.visible = !!p && !p.hidden;
      if (p) c.position.set(p.x, VEHICLE_H + 0.12, p.z);
    }
  });

  return (
    <group>
      {cars.length > 0 && (
        <>
          <instancedMesh ref={refs.carShadow} args={[a.carShadow, a.shadow, cars.length]} frustumCulled={false} />
          <instancedMesh ref={refs.car} args={[a.car, a.body, cars.length]} frustumCulled={false} />
          <instancedMesh ref={refs.carLights} args={[a.carLights, a.lit, cars.length]} frustumCulled={false} />
        </>
      )}
      {trucks.length > 0 && (
        <>
          <instancedMesh ref={refs.truckShadow} args={[a.truckShadow, a.shadow, trucks.length]} frustumCulled={false} />
          <instancedMesh ref={refs.truck} args={[a.truck, a.body, trucks.length]} frustumCulled={false} />
          <instancedMesh ref={refs.truckLights} args={[a.truckLights, a.lit, trucks.length]} frustumCulled={false} />
        </>
      )}
      <mesh ref={crown} geometry={a.crown} material={a.lit} visible={scene.player >= 0} />
    </group>
  );
}

/* ----------------------------------------------------------------------------------------- paint on the ground */

const SHINE_MIX = 0.6;

function Trails({ scene }: { scene: ParkingScene }) {
  const a = sharedAssets();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const written = useRef(0);
  const version = useRef(-1);
  const shining = useRef(false);

  useFrame(() => {
    const m = mesh.current;
    if (!m || version.current === scene.trailVersion) return;
    version.current = scene.trailVersion;
    const count = scene.trailCount;
    const wave = scene.shine >= 0;
    // New marks are written once; during the shine (and once after it) every mark's colour is worked out again.
    const from = wave || shining.current ? 0 : written.current;
    for (let i = from; i < count; i++) {
      if (i >= written.current) {
        _p.set(scene.trailX[i], 0.056 + (i % 7) * 0.0007, scene.trailZ[i]);
        _q.setFromAxisAngle(Y, scene.trailYaw[i]);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        m.setMatrixAt(i, _m);
      }
      _c.setRGB(scene.trailColor[i * 3], scene.trailColor[i * 3 + 1], scene.trailColor[i * 3 + 2]);
      if (wave) _c.lerp(WHITE, scene.shineAt(i) * SHINE_MIX);
      m.setColorAt(i, _c);
    }
    shining.current = wave;
    written.current = count;
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[a.trailGeo, a.paint, TRAIL_CAPACITY]} frustumCulled={false} count={0} />;
}
const WHITE = new THREE.Color('#ffffff');

/* ----------------------------------------------------------------------------------------- smoke, emoji, hint */

function Effects({ scene }: { scene: ParkingScene }) {
  const a = sharedAssets();
  const puffs = useRef<THREE.InstancedMesh>(null);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    const m = puffs.current;
    if (m) {
      scene.puffs.forEach((p, i) => {
        const k = p.t / 0.7;
        const size = p.active ? 0.15 + 0.55 * Math.sin(Math.min(1, k) * Math.PI * 0.9) : 0;
        _p.set(p.x, 0.2 + k * 0.3, p.z);
        _q.identity();
        _s.setScalar(size);
        _m.compose(_p, _q, _s);
        m.setMatrixAt(i, _m);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    scene.emojis.forEach((e, i) => {
      const s = sprites.current[i];
      if (!s) return;
      s.visible = e.active;
      if (!e.active) return;
      const pop = Math.min(1, e.t * 8);
      const fade = e.t > 0.75 ? 1 - (e.t - 0.75) / 0.25 : 1;
      s.position.set(e.x, VEHICLE_H + 0.5 + e.t * 0.35, e.z);
      s.scale.setScalar(0.65 * pop * (0.8 + 0.2 * fade));
    });
  });
  const tex = useMemo(() => emojiTexture(), []);
  return (
    <group>
      <instancedMesh ref={puffs} args={[a.puffGeo, a.puff, PUFFS]} frustumCulled={false} />
      {Array.from({ length: EMOJIS }, (_, i) => (
        <sprite
          key={i}
          ref={(s) => {
            sprites.current[i] = s;
          }}
          visible={false}
        >
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

function HintMarker({ scene }: { scene: ParkingScene }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const h = scene.hint;
    const actor = h ? scene.actors[h.vehicle] : null;
    g.visible = !!actor && !actor.hidden;
    if (!h || !actor || actor.hidden) return;
    const t = clock.elapsedTime;
    g.position.set(actor.x, 0.08, actor.z);
    if (ring.current) {
      const pulse = 1 + 0.14 * Math.sin(t * 6);
      ring.current.scale.set(actor.len * 0.62 * pulse, actor.len * 0.62 * pulse, 1);
    }
    if (arrow.current) {
      const [dr, dc] = DELTA[h.dir];
      const bob = 0.35 + 0.18 * Math.sin(t * 7);
      arrow.current.position.set(dc * (actor.len / 2 + bob), 0.45, dr * (actor.len / 2 + bob));
      // The cone points along +Y; laid down it points along the heading.
      arrow.current.rotation.set(dr !== 0 ? (dr > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, 0, dc !== 0 ? (dc > 0 ? -Math.PI / 2 : Math.PI / 2) : 0);
    }
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color="#ffe14a" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={arrow}>
        <coneGeometry args={[0.22, 0.5, 8]} />
        <meshBasicMaterial color="#ffe14a" />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------------------------------------------- scenery */

type Placed = { name: string; x: number; z: number; scale: number; rot: number };

/** Trees, bushes and stones round the plate, always outside it; the same for the same level. */
export function planDecor(level: Level): Placed[] {
  const rng = createRng(level.seed ^ 0x51ed270b);
  const hw = level.cols / 2 + SIDEWALK + ROAD_W + 0.25;
  const hd = level.rows / 2 + SIDEWALK + ROAD_W + 0.25;
  const pool = DECOR_MODELS.filter((m) => m.kind === 'tree' || m.kind === 'bush' || m.kind === 'stone' || m.kind === 'flower');
  const out: Placed[] = [];
  let guard = 0;
  while (out.length < 14 && guard++ < 200) {
    const model = rng.pick(pool);
    const angle = rng.next() * Math.PI * 2;
    // A point on a ring a little beyond the plate (a rounded rectangle).
    const reach = 1.2 + rng.next() * 5;
    const x = Math.cos(angle) * (hw + reach);
    const z = Math.sin(angle) * (hd + reach);
    if (Math.abs(x) < hw + model.radius * 2 && Math.abs(z) < hd + model.radius * 2) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.1)) continue;
    out.push({ name: model.name, x, z, scale: model.scale[0] + rng.next() * (model.scale[1] - model.scale[0]), rot: rng.next() * Math.PI * 2 });
  }
  return out;
}

function useDecorLibrary(enabled: boolean): DecorLibrary | null {
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

function PartInstances({ part, placements }: { part: DecorPart; placements: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    placements.forEach((p, i) => {
      _p.set(p.x, -SLAB_H - 0.06, p.z);
      _q.setFromAxisAngle(Y, p.rot);
      _s.setScalar(p.scale);
      _m.compose(_p, _q, _s).multiply(part.matrix);
      m.setMatrixAt(i, _m);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [part, placements]);
  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]} frustumCulled={false} />;
}

function Decor({ level, enabled }: { level: Level; enabled: boolean }) {
  const library = useDecorLibrary(enabled);
  const groups = useMemo(() => {
    const byModel = new Map<string, Placed[]>();
    for (const p of planDecor(level)) {
      const list = byModel.get(p.name);
      if (list) list.push(p);
      else byModel.set(p.name, [p]);
    }
    return [...byModel.entries()];
  }, [level]);
  if (!library) return null;
  return (
    <group>
      {groups.map(([name, placements]) =>
        (library.get(name) ?? []).map((part, i) => <PartInstances key={`${name}-${i}-${placements.length}`} part={part} placements={placements} />),
      )}
    </group>
  );
}

/* ----------------------------------------------------------------------------------------- canvas */

function Scene({ level, scene, bridge, margins, decor, onReady }: Omit<Props, 'active'>) {
  return (
    <>
      <CameraRig level={level} margins={margins} bridge={bridge} />
      <Lights />
      <Ready onReady={onReady} />
      <Lot level={level} scene={scene} />
      <Decor level={level} enabled={decor} />
      <Trails scene={scene} />
      <Vehicles scene={scene} />
      <Effects scene={scene} />
      <HintMarker scene={scene} />
    </>
  );
}

/**
 * The GL canvas. It stays mounted for the whole session (creating a GL context is slow); the lots inside it come and go. A new
 * `scene` (a new level, or a restart) remounts everything that depends on it.
 */
function ParkingCanvasImpl(props: Props) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      frameloop={props.active === false ? 'never' : 'always'}
      camera={{ fov: 40, near: 0.1, far: 300, position: [0, 10, 6] }}
      gl={{ antialias: true }}
      onCreated={({ gl, size }) => {
        gl.setClearColor(SKY_BG, 1);
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.setPixelRatio(Math.min(PixelRatio.get(), MAX_PIXEL_RATIO));
        gl.setSize(size.width, size.height, false);
      }}
    >
      <Scene key={props.scene.level.id + ':' + props.level.seed} {...props} />
    </Canvas>
  );
}

export const ParkingCanvas = memo(ParkingCanvasImpl);
