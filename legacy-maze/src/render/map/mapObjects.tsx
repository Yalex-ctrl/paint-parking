import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { chestLevel, chestState, levelPaintColor, levelPoint, PAD_R, padState } from '../../game/mapLayout';
import { BallBody } from '../skins';
import { lockGeometry, numberGeometry, starGeometry } from './mapGeometry';
import type { MapShared } from './mapState';

const o = new THREE.Object3D();
const c = new THREE.Color();
const nowSec = () => performance.now() / 1000;
const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

const LOCKED = new THREE.Color('#8f8aa6');
const WHITE = new THREE.Color('#ffffff');

/**
 * The pads of the levels in a window, as two InstancedMeshes (a thick dark base and a coloured top): finished levels in the
 * colour they were painted, the current one bigger and pulsing, the others grey. Numbers, stars and padlocks sit on top.
 */
export function Pads({ shared, from, to }: { shared: MapShared; from: number; to: number }) {
  const count = to - from + 1;
  const base = useRef<THREE.InstancedMesh>(null);
  const top = useRef<THREE.InstancedMesh>(null);
  const locks = useRef<THREE.InstancedMesh>(null);
  const starsMesh = useRef<THREE.InstancedMesh>(null);
  const lockPopMesh = useRef<THREE.Mesh>(null);

  const baseGeo = useMemo(() => new THREE.CylinderGeometry(PAD_R * 1.1, PAD_R * 1.16, 0.3, 28), []);
  const topGeo = useMemo(() => new THREE.CylinderGeometry(PAD_R, PAD_R * 1.02, 0.12, 28), []);
  const lock = useMemo(() => lockGeometry(), []);
  const star = useMemo(() => starGeometry(), []);
  useEffect(
    () => () => {
      baseGeo.dispose();
      topGeo.dispose();
      lock.dispose();
      star.dispose();
    },
    [baseGeo, topGeo, lock, star],
  );

  useLayoutEffect(() => {
    // Everything starts collapsed; the frame loop places what is visible.
    o.scale.set(0, 0, 0);
    o.updateMatrix();
    for (const m of [base.current, top.current, locks.current, starsMesh.current]) {
      if (!m) continue;
      for (let i = 0; i < m.count; i++) {
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, c.set('#ffffff'));
      }
    }
  }, [count]);

  useFrame(() => {
    const t = nowSec();
    const { current, stars } = shared;
    let lockI = 0;
    let starI = 0;
    for (let i = 0; i < count; i++) {
      const id = from + i;
      const p = levelPoint(id);
      const state = padState(id, current, stars);
      let s = 1;
      let lift = 0;
      if (state === 'current') {
        s = 1.18 + Math.sin(t * 3.2) * 0.05;
        lift = 0.1;
      }
      // The pad that was just reached pops a little.
      if (shared.lockPop && shared.lockPop.id === id && t - shared.lockPop.at < 0.5) lift += Math.sin(((t - shared.lockPop.at) / 0.5) * Math.PI) * 0.25;

      if (state === 'locked') c.copy(LOCKED);
      else c.set(levelPaintColor(id, undefined));
      if (state === 'current') c.lerp(WHITE, 0.25);

      o.position.set(p.x, 0.15 + lift, p.z);
      o.scale.set(s, 1, s);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      base.current?.setMatrixAt(i, o.matrix);
      base.current?.setColorAt(i, c.clone().multiplyScalar(state === 'locked' ? 0.62 : 0.55));
      o.position.set(p.x, 0.36 + lift, p.z);
      o.updateMatrix();
      top.current?.setMatrixAt(i, o.matrix);
      top.current?.setColorAt(i, c);

      // A small padlock badge on the upper edge of a locked pad (nothing stands in the grass; the number stays readable).
      if (state === 'locked' && locks.current) {
        o.position.set(p.x, 0.5 + lift, p.z - PAD_R * 0.98);
        o.rotation.set(0.9, 0, 0);
        o.scale.setScalar(1);
        o.updateMatrix();
        locks.current.setMatrixAt(lockI++, o.matrix);
      }
      o.rotation.set(0, 0, 0);

      // Stars above a finished level: up to three, in an arc behind the pad (toward the top of the screen).
      if (state === 'done' && starsMesh.current) {
        const n = stars[id] ?? 0;
        const drop = shared.starDrop && shared.starDrop.id === id ? t - shared.starDrop.at : 99;
        for (let k = 0; k < n; k++) {
          const dx = (k - (n - 1) / 2) * 0.55;
          const rest = 1.25 - Math.abs(k - (n - 1) / 2) * 0.12;
          const local = Math.max(0, drop - k * 0.18);
          const fall = drop < 0.18 * k ? 4 : 4 * (1 - easeOutBounce(Math.min(1, local / 0.7)));
          o.position.set(p.x + dx, rest - 0.1 + fall, p.z - 0.95);
          o.rotation.set(-0.7, Math.sin(t * 1.4 + k) * 0.35, 0);
          o.scale.setScalar(drop < 0.18 * k ? 0 : 1);
          o.updateMatrix();
          starsMesh.current.setMatrixAt(starI++, o.matrix);
        }
        o.rotation.set(0, 0, 0);
      }
    }
    // Unused slots collapse.
    o.scale.set(0, 0, 0);
    o.updateMatrix();
    if (locks.current) for (let i = lockI; i < locks.current.count; i++) locks.current.setMatrixAt(i, o.matrix);
    if (starsMesh.current) for (let i = starI; i < starsMesh.current.count; i++) starsMesh.current.setMatrixAt(i, o.matrix);
    for (const m of [base.current, top.current, locks.current, starsMesh.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // The padlock of the pad just reached flies off.
    const lp = lockPopMesh.current;
    if (lp) {
      const lk = shared.lockPop;
      const age = lk ? t - lk.at : 99;
      if (lk && age < 0.9) {
        const p = levelPoint(lk.id);
        lp.visible = true;
        lp.position.set(p.x + age * 0.8, 0.6 + age * 3 - age * age * 5, p.z - PAD_R * 0.98);
        lp.rotation.set(0.9, age * 6, age * 4);
        lp.scale.setScalar(1.5 * (1 - age / 0.9));
      } else lp.visible = false;
    }
  });

  return (
    <>
      <instancedMesh ref={base} args={[baseGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={top} args={[topGeo, undefined, count]} frustumCulled={false} receiveShadow>
        <meshStandardMaterial roughness={0.35} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={locks} args={[lock, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={starsMesh} args={[star, undefined, count * 3]} frustumCulled={false}>
        <meshStandardMaterial color="#ffc93c" emissive="#d98a00" emissiveIntensity={0.5} metalness={0.4} roughness={0.3} />
      </instancedMesh>
      <mesh ref={lockPopMesh} geometry={lock} visible={false}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </mesh>
    </>
  );
}

/** The player's equipped ball bouncing on the current level, or jumping from the level just finished to the next one. */
export function CurrentBall({ shared, envMap }: { shared: MapShared; envMap: THREE.Texture | null }) {
  const group = useRef<THREE.Group>(null);
  const skin = shared.ball;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = nowSec();
    let x: number;
    let y: number;
    let z: number;
    const hop = shared.hop;
    if (hop && t >= hop.start) {
      const k = Math.min(1, (t - hop.start) / hop.duration);
      const a = levelPoint(hop.from);
      const b = levelPoint(hop.to);
      x = a.x + (b.x - a.x) * k;
      z = a.z + (b.z - a.z) * k - 0.55;
      y = 1.7 + Math.sin(k * Math.PI) * 3.2;
    } else {
      const lvl = hop ? hop.from : shared.current;
      const p = levelPoint(lvl);
      const phase = (t * 1.6) % 1;
      const h = Math.abs(Math.sin(phase * Math.PI));
      x = p.x;
      z = p.z - 0.55;
      y = 1.6 + h * 1.0;
    }
    g.position.set(x, y, z);
    g.scale.setScalar(1.55); // the ball keeps its shape: a uniform size, never squashed
  });
  return (
    <group ref={group}>
      <mesh castShadow>
        <BallBody skin={skin} envMap={envMap} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- chests */

/** A chest beside the path every 10 levels: closed until the 10 levels are done, then it can be opened. */
export function Chest({ shared, k, openedAt }: { shared: MapShared; k: number; openedAt?: number }) {
  const lid = useRef<THREE.Group>(null);
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const lidMat = useRef<THREE.MeshStandardMaterial>(null);
  const p = levelPoint(chestLevel(k));
  const side = k % 2 === 0 ? -1 : 1;
  const x = p.x + side * 2.7;
  const z = p.z;

  useFrame(() => {
    const t = nowSec();
    const state = chestState(k, shared.stars, shared.opened);
    const g = group.current;
    if (g) {
      g.position.set(x, 0, z);
      g.rotation.y = -side * 0.5;
      // A chest that is ready hops now and then to be noticed.
      const hop = state === 'ready' ? Math.abs(Math.sin(t * 2.2)) * 0.18 : 0;
      g.position.y = hop;
    }
    if (lid.current) {
      const target = state === 'opened' ? -1.9 : 0;
      lid.current.rotation.x += (target - lid.current.rotation.x) * 0.2;
    }
    // Dull while locked, warm wood once it can be opened (the state changes without any re-render).
    bodyMat.current?.color.set(state === 'locked' ? '#6b5a4a' : '#9b5a2b');
    lidMat.current?.color.set(state === 'locked' ? '#6b5a4a' : '#b56d34');
    if (glow.current) {
      glow.current.visible = state === 'ready';
      glow.current.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    }
  });
  void openedAt;
  return (
    <group ref={group} position={[x, 0, z]} scale={1.35}>
      <mesh ref={glow} position={[0, 0.5, 0]} visible={false}>
        <sphereGeometry args={[0.85, 12, 8]} />
        <meshBasicMaterial color="#ffe27a" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.6]} />
        <meshStandardMaterial ref={bodyMat} color='#6b5a4a' roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, 0.31]}>
        <boxGeometry args={[0.95, 0.12, 0.02]} />
        <meshStandardMaterial color="#d9a441" metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={lid} position={[0, 0.5, -0.3]}>
        <mesh position={[0, 0.12, 0.3]} castShadow>
          <boxGeometry args={[0.9, 0.24, 0.6]} />
          <meshStandardMaterial ref={lidMat} color='#6b5a4a' roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.2, 0.61]}>
          <boxGeometry args={[0.18, 0.2, 0.05]} />
          <meshStandardMaterial color='#ffd23f' metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/* --------------------------------------------------------------- balloon */

/** The hot-air balloon of the daily challenge, floating beside the current level; it carries a flag with the streak. */
export function Balloon({ shared }: { shared: MapShared }) {
  const group = useRef<THREE.Group>(null);
  const envelope = useMemo(() => {
    const g = new THREE.SphereGeometry(0.95, 20, 14);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color('#ff5468');
    const b = new THREE.Color('#ffd23f');
    for (let i = 0; i < pos.count; i++) {
      const lon = Math.atan2(pos.getZ(i), pos.getX(i));
      const band = Math.floor(((lon + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const col = band === 0 ? a : b;
      colors.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.scale(1, 1.2, 1);
    return g;
  }, []);
  useEffect(() => () => envelope.dispose(), [envelope]);
  const digits = numberGeometry(String(Math.max(0, shared.streak)), 0.11, 0.06);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = nowSec();
    const p = levelPoint(shared.hop ? shared.hop.from : shared.current);
    g.position.set(p.x + 3.1, 3.6 + Math.sin(t * 0.9) * 0.25, p.z - 0.8);
    g.rotation.y = Math.sin(t * 0.5) * 0.2;
    shared.dyn.balloon.copy(g.position);
  });

  return (
    <group ref={group}>
      <mesh geometry={envelope} position={[0, 1.4, 0]} castShadow>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.5, 0.36, 0.5]} />
        <meshStandardMaterial color="#8a5a2b" roughness={0.8} />
      </mesh>
      {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([rx, rz], i) => (
        <mesh key={i} position={[rx * 0.9, 0.58, rz * 0.9]}>
          <cylinderGeometry args={[0.012, 0.012, 0.8, 4]} />
          <meshStandardMaterial color="#5a4630" />
        </mesh>
      ))}
      {/* A flag on a pole: the streak number on it, a flame above. */}
      <mesh position={[0.55, 2.9, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 5]} />
        <meshStandardMaterial color="#5a4630" />
      </mesh>
      <mesh position={[0.95, 3.15, 0]}>
        <boxGeometry args={[0.7, 0.42, 0.03]} />
        <meshStandardMaterial color={shared.dailyDone ? '#3a9a3f' : '#ff8a3d'} />
      </mesh>
      <group position={[0.95, 3.15, 0.03]} rotation={[Math.PI / 2, 0, 0]} scale={0.8}>
        <mesh geometry={digits}>
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      <mesh position={[0.55, 3.5, 0]}>
        <coneGeometry args={[0.13, 0.3, 8]} />
        <meshBasicMaterial color="#ffb347" />
      </mesh>
    </group>
  );
}

