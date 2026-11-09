import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

import { getDecorLibrary, preloadDecor, type DecorLibrary, type DecorPart } from '../core/render/decor/models';
import { MAX_PIXEL_RATIO, useQuality } from '../core/render/perf';
import { PerfMonitor } from './PerfMonitor';
import type { Level } from '../game/types';
import { fitCamera, type Margins } from './cameraFit';
import { decorKey, planDecor, type Placed } from './decorPlan';
import { pickAt, toCanvas, type Picked } from './pick';
import { GROUND_DROP, linkOffset, VEHICLE_H } from './coords';
import { digitTexture, emojiTexture } from './textures';
import { arrowGeometry, crownGeometry, lightsGeometry, roofTop, shadowGeometry, carGeometry, skinGeometry, wheelGeometry, wheelLayout, WHEEL_Y } from './vehicleGeometry';
import { specOf, type Finish } from './skinSpecs';
import { buildLotGeometry, gateGeometry } from './lotGeometry';
import { EMOJIS, PUFFS, TRAIL_CAPACITY, type Actor, type ParkingScene } from './ParkingScene';
import { LOT_COLORS } from './palette';

/** Clear colour: only visible for a few frames at start-up. */
const SKY_BG = '#a9cdee';

/** What the screen needs from the scene to turn a touch into a vehicle. */
export type PickBridge = {
  /** The camera the scene is drawn with, as it is this very frame (not a copy: the object of the renderer). */
  camera: THREE.PerspectiveCamera | null;
  /** The size of the canvas in points. */
  width: number;
  height: number;
  /** The vehicle under a point of the canvas (points from its top left): a ray against the box of each vehicle, else the nearest one. */
  pick: (x: number, y: number, scene: ParkingScene) => Picked;
  /** The point of the canvas (points) a point of the world falls on (to put the help hand on a vehicle). */
  toScreen: (x: number, z: number, y?: number) => { x: number; y: number } | null;
};

export function createPickBridge(): PickBridge {
  const bridge: PickBridge = {
    camera: null,
    width: 0,
    height: 0,
    pick(x, y, scene) {
      if (!bridge.camera || bridge.width === 0) return { vehicle: -1, via: 'none', distance: Infinity };
      return pickAt(bridge.camera, bridge.width, bridge.height, x, y, scene.actors);
    },
    toScreen(x, z, y = 0.3) {
      if (!bridge.camera || bridge.width === 0) return null;
      return toCanvas(bridge.camera, bridge.width, bridge.height, x, y, z);
    },
  };
  return bridge;
}
/** A level that is ready to play: its rules are compiled elsewhere, the canvas only needs the level and its scene. */
export type Stage = { level: Level; scene: ParkingScene };

type Props = {
  level: Level;
  scene: ParkingScene;
  /** The next level, mounted below the current one as soon as it is prepared, so the transition never waits. */
  next: Stage | null;
  /** Bump to start the transition to `next`: the camera follows the road to it. */
  transition: number;
  onTransitionDone?: () => void;
  bridge: PickBridge;
  margins: Margins;
  /** False while another screen is on top: nothing is drawn. */
  active?: boolean;
  /** Scenery around the board (the "Décors" setting). */
  decor: boolean;
  /** The equipped vehicle skin (shop id): worn by the vehicle with the crown. */
  skin: string;
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
  arrow: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
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
    arrow: arrowGeometry(),
    wheel: wheelGeometry(),
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
  }, [camera, level, width, height, margins]);
  // The picking uses the camera and the size of THIS frame: it is told again on every frame (no allocation, plain assignments), so it
  // can never disagree with what is drawn, whatever moved the camera (the framing, the transition, a resize).
  useFrame((state) => {
    bridge.camera = state.camera as THREE.PerspectiveCamera;
    bridge.width = state.size.width;
    bridge.height = state.size.height;
  });
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
        <Gate key={`gate-${level.gates[i].side}-${level.gates[i].from}-${level.gates[i].to}`} level={level} scene={scene} index={i} info={g} />
      ))}
      <mesh position={[0, -GROUND_DROP, 0]} rotation={[-Math.PI / 2, 0, 0]}>
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

const skinMaterials = new Map<Finish, THREE.Material>();
/** One material per finish: matt, glossy, metallic (a strong highlight) or neon (it glows: no shading). */
export function skinMaterial(finish: Finish): THREE.Material {
  let m = skinMaterials.get(finish);
  if (!m) {
    if (finish === 'neon') m = new THREE.MeshBasicMaterial({ vertexColors: true });
    else if (finish === 'matte') m = new THREE.MeshLambertMaterial({ vertexColors: true });
    else m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: finish === 'metal' ? 110 : 55, specular: finish === 'metal' ? 0xffffff : 0x666666 });
    skinMaterials.set(finish, m);
  }
  return m;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _q5 = new THREE.Quaternion();
const LAYOUT_CAR = wheelLayout(2);
const LAYOUT_TRUCK = wheelLayout(3);
const _v = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _c = new THREE.Color();

/** Lays the wheels: they follow the vehicle, turn as it drives and (the front ones) steer into the bends. */
function writeWheels(actors: Actor[], mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  let n = 0;
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    const layout = a.len === 3 ? LAYOUT_TRUCK : LAYOUT_CAR;
    _q.setFromAxisAngle(Y, a.yaw);
    _q2.setFromAxisAngle(Z, -a.pitch);
    _q3.setFromAxisAngle(X, a.roll);
    _q.multiply(_q2).multiply(_q3);
    for (let k = 0; k < layout.length; k++) {
      const w = layout[k];
      _p.set(w.x, WHEEL_Y, w.z).applyQuaternion(_q).add(_v.set(a.x, 0.03, a.z));
      // The front wheels steer; every wheel spins about its axle.
      _q4.copy(_q);
      if (w.front) _q4.multiply(_q5.setFromAxisAngle(Y, a.steer));
      _q4.multiply(_q5.setFromAxisAngle(Z, a.spin));
      _s.setScalar(a.hidden ? 0 : 1);
      _m.compose(_p, _q4, _s);
      mesh.setMatrixAt(n++, _m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Lays the arrow of every vehicle on its roof: it follows the vehicle (and its tilt) and points the way it goes. */
function writeArrows(actors: Actor[], mesh: THREE.InstancedMesh | null, dressedId: number, dressedRoof: number) {
  if (!mesh) return;
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    // A vehicle that reverses has its arrow toward its rear.
    _q.setFromAxisAngle(Y, a.yaw);
    _q2.setFromAxisAngle(Z, -a.pitch);
    _q3.setFromAxisAngle(X, a.roll);
    _q.multiply(_q2).multiply(_q3);
    if (a.reverse) _q.multiply(_q4.setFromAxisAngle(Y, Math.PI));
    const roof = a.len === 3 ? 0.745 : a.id === dressedId ? dressedRoof : 0.575;
    _p.set(0, (roof + 0.012) * (1 - 0.09 * a.squash), 0).applyQuaternion(_q).add(_v.set(a.x, 0.03, a.z));
    _s.setScalar(a.hidden ? 0 : a.len === 3 ? 1.5 : 1.12);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Writes the matrices of a kind of vehicle (nothing is allocated: plain loops, shared temporaries). */
function writeVehicles(list: Actor[], body: THREE.InstancedMesh | null, lights: THREE.InstancedMesh | null, shadow: THREE.InstancedMesh | null, dressedId: number) {
  if (!body || !lights || !shadow) return;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    const hide = actor.hidden;
    // The vehicle that wears a skin is drawn apart (its colours are in its geometry).
    const sink = 1 - 0.09 * actor.squash;
    if (hide || actor.id === dressedId) _s.setScalar(0);
    else _s.set(1, sink, 1);
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
    _s.setScalar(hide ? 0 : 1);
    _m.compose(_p, _q, _s);
    shadow.setMatrixAt(i, _m);
  }
  body.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  shadow.instanceMatrix.needsUpdate = true;
}

function Vehicles({ scene, skin }: { scene: ParkingScene; skin: string }) {
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
  const arrows = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const wheelCount = useMemo(() => scene.actors.reduce((s, x) => s + (x.len === 3 ? LAYOUT_TRUCK.length : LAYOUT_CAR.length), 0), [scene]);
  const crown = useRef<THREE.Mesh>(null);
  const worn = useRef<THREE.Mesh>(null);
  const first = useRef(true);
  const spec = specOf(skin);
  const player = scene.actors[scene.player];
  const wornGeometry = useMemo(() => (player ? skinGeometry(spec, player.len) : null), [spec, player]);
  useEffect(() => () => wornGeometry?.dispose(), [wornGeometry]);

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
  }, [cars, trucks, wornGeometry]);

  useFrame(() => {
    if (!first.current && !scene.active) return;
    first.current = false;
    const dressed = wornGeometry !== null ? scene.player : -1;
    writeVehicles(cars, refs.car.current, refs.carLights.current, refs.carShadow.current, dressed);
    writeVehicles(trucks, refs.truck.current, refs.truckLights.current, refs.truckShadow.current, dressed);
    writeWheels(scene.actors, wheels.current);
    writeArrows(scene.actors, arrows.current, wornGeometry !== null ? scene.player : -1, roofTop(spec, player?.len ?? 2));
    const w = worn.current;
    if (w && player) {
      w.visible = !player.hidden;
      w.position.set(player.x, 0.03, player.z);
      w.scale.set(1, 1 - 0.09 * player.squash, 1);
      _q.setFromAxisAngle(Y, player.yaw);
      _q2.setFromAxisAngle(Z, -player.pitch);
      _q3.setFromAxisAngle(X, player.roll);
      w.quaternion.copy(_q.multiply(_q2).multiply(_q3));
    }
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
      {wornGeometry && <mesh ref={worn} geometry={wornGeometry} material={skinMaterial(spec.finish)} />}
      <instancedMesh ref={wheels} args={[a.wheel, a.body, wheelCount]} frustumCulled={false} />
      <instancedMesh ref={arrows} args={[a.arrow, a.lit, scene.actors.length]} frustumCulled={false} renderOrder={1} />
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
      for (let i = 0; i < scene.puffs.length; i++) {
        const p = scene.puffs[i];
        const k = p.t / 0.7;
        const size = p.active ? 0.15 + 0.55 * Math.sin(Math.min(1, k) * Math.PI * 0.9) : 0;
        _p.set(p.x, 0.2 + k * 0.3, p.z);
        _q.identity();
        _s.setScalar(size);
        _m.compose(_p, _q, _s);
        m.setMatrixAt(i, _m);
      }
      m.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < scene.emojis.length; i++) {
      const e = scene.emojis[i];
      const s = sprites.current[i];
      if (!s) continue;
      s.visible = e.active;
      if (!e.active) continue;
      const pop = Math.min(1, e.t * 8);
      const fade = e.t > 0.75 ? 1 - (e.t - 0.75) / 0.25 : 1;
      s.position.set(e.x, VEHICLE_H + 0.5 + e.t * 0.35, e.z);
      s.scale.setScalar(0.65 * pop * (0.8 + 0.2 * fade));
    }
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

/** The halo round the vehicle to tap (the hint and the help of the first levels). Not touchable: the touches go through. */
function HintMarker({ scene }: { scene: ParkingScene }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const fill = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const h = scene.hint;
    const actor = h ? scene.actors[h.vehicle] : null;
    g.visible = !!actor && !actor.hidden;
    if (!h || !actor || actor.hidden) return;
    const pulse = 1 + 0.1 * Math.sin(clock.elapsedTime * 6);
    g.position.set(actor.x, 0.075, actor.z);
    g.rotation.y = actor.baseYaw;
    // An oval along the vehicle.
    const sx = (actor.len * 0.9) / 2 + 0.2;
    if (ring.current) ring.current.scale.set(sx * pulse, 0.74 * pulse, 1);
    if (fill.current) fill.current.scale.set(sx * pulse, 0.74 * pulse, 1);
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={fill} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#ffe14a" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.9, 1, 40]} />
        <meshBasicMaterial color="#ffe14a" transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}
/* ----------------------------------------------------------------------------------------- scenery */

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
      _p.set(p.x, -GROUND_DROP, p.z);
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
  // A phone that cannot keep up loses the scenery first.
  const quality = useQuality();
  const library = useDecorLibrary(enabled && quality <= 1);
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
      {groups.flatMap(([name, placements]) => (library.get(name) ?? []).map((part, i) => <PartInstances key={decorKey(name, i, placements.length)} part={part} placements={placements} />))}
    </group>
  );
}

/* ----------------------------------------------------------------------------------------- canvas */

/** Everything of one level, at its place in the world (the next level waits below the current one). */
function World({ level, scene, decor, skin, offset }: { level: Level; scene: ParkingScene; decor: boolean; skin: string; offset: [number, number, number] }) {
  return (
    <group position={offset}>
      <Lot level={level} scene={scene} />
      <Decor level={level} enabled={decor} />
      <Trails scene={scene} />
      <Vehicles scene={scene} skin={skin} />
      <Effects scene={scene} />
      <HintMarker scene={scene} />
    </group>
  );
}

const DURATION = 1.5;

/**
 * The camera follows the road from the current lot to the next. Only the position moves (the angle is the same for every lot), and
 * the screen swaps the levels when it arrives: the camera is then exactly where the new level frames itself, so nothing jumps.
 */
function Director({ next, offset, transition, margins, onDone }: { next: Stage | null; offset: [number, number, number]; transition: number; margins: Margins; onDone?: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const probe = useMemo(() => new THREE.PerspectiveCamera(), []);
  const state = useRef({ id: transition, t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() });
  useLayoutEffect(() => {
    const s = state.current;
    if (transition === s.id) return;
    s.id = transition;
    if (!next) {
      onDone?.();
      return;
    }
    fitCamera(probe, next.level, width, height, margins);
    s.to.copy(probe.position).add(_off.set(offset[0], offset[1], offset[2]));
    s.from.copy(camera.position);
    s.t = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition]);
  useFrame((_, dt) => {
    const s = state.current;
    if (s.t < 0) return;
    s.t += Math.min(dt, 0.05) / DURATION;
    const k = Math.min(1, s.t);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(s.from, s.to, e);
    camera.updateMatrixWorld();
    if (s.t >= 1) {
      s.t = -1;
      onDone?.();
    }
  });
  return null;
}
const _off = new THREE.Vector3();

function Scene({ level, scene, next, transition, onTransitionDone, bridge, margins, decor, skin, onReady }: Omit<Props, 'active'>) {
  const offset = useMemo(() => (next ? linkOffset(level, next.level) : ([0, 0, 60] as [number, number, number])), [level, next]);
  return (
    <>
      <CameraRig level={level} margins={margins} bridge={bridge} />
      <Lights />
      <Ready onReady={onReady} />
      <PerfMonitor />
      <World key={scene.uid} level={level} scene={scene} decor={decor} skin={skin} offset={[0, 0, 0]} />
      {next && <World key={next.scene.uid} level={next.level} scene={next.scene} decor={decor} skin={skin} offset={offset} />}
      <Director next={next} offset={offset} transition={transition} margins={margins} onDone={onTransitionDone} />
    </>
  );
}
/**
 * The GL canvas. It stays mounted for the whole session (creating a GL context is slow); the lots inside it come and go. A new
 * `scene` (a new level, or a restart) remounts everything that depends on it.
 */
function ParkingCanvasImpl(props: Props) {
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
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
      <Scene {...props} />
    </Canvas>
    </View>
  );
}

export const ParkingCanvas = memo(ParkingCanvasImpl);
