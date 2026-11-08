import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { levelAtZ, levelPaintColor, levelPoint } from '../../game/mapLayout';
import { itemsOfKind } from '../../core/shopItems';
import { BALL_R } from '../coords';
import { BallBody } from '../skins';
import type { MapShared } from './mapState';

const nowSec = () => performance.now() / 1000;
const o = new THREE.Object3D();
const c = new THREE.Color();

/* ------------------------------------------------------------ flying coins */

const FIRST_COIN_IN = 7; // the first coin of a visit shows up quickly, so the player learns they exist
const COIN_EVERY: [number, number] = [20, 40];
const COIN_TRAVEL = 7; // seconds to cross the screen
const GIANT_CHANCE = 0.12;

/**
 * A coin crossing the screen now and then, every 20 to 40 seconds: rolling along the path, or flying with little
 * wings. Tapping it catches it (the screen pays it and floats a "+1"); a giant one, rarer, is worth 10. Nothing flies by
 * once the day's quota of coins has been caught.
 */
export function FlyingCoin({ shared }: { shared: MapShared }) {
  const group = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  const state = useRef({ next: nowSec() + FIRST_COIN_IN, start: 0, active: false, flying: false, giant: false, from: 0, to: 0, lateral: 0 });
  const [giant, setGiant] = useState(false);
  const [flying, setFlying] = useState(false);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = nowSec();
    const s = state.current;
    const dyn = shared.dyn.coin;
    if (!s.active) {
      g.visible = false;
      dyn.active = false;
      if (t >= s.next && shared.coinsLeft > 0 && !shared.hop) {
        const isGiant = Math.random() < GIANT_CHANCE && shared.coinsLeft >= 10;
        const isFlying = Math.random() < 0.5;
        s.active = true;
        s.start = t;
        s.giant = isGiant;
        s.flying = isFlying;
        s.from = levelAtZ(shared.z) + 6;
        s.to = levelAtZ(shared.z) - 3.5;
        s.lateral = (Math.random() - 0.5) * 1.6;
        setGiant(isGiant);
        setFlying(isFlying);
        dyn.value = isGiant ? 10 : 1;
      }
      return;
    }
    if (dyn.caughtAt > 0 && t - dyn.caughtAt > 0.3) {
      s.active = false;
      s.next = t + COIN_EVERY[0] + Math.random() * (COIN_EVERY[1] - COIN_EVERY[0]);
      dyn.caughtAt = 0;
      return;
    }
    const k = (t - s.start) / COIN_TRAVEL;
    if (k >= 1) {
      s.active = false;
      s.next = t + COIN_EVERY[0] + Math.random() * (COIN_EVERY[1] - COIN_EVERY[0]);
      return;
    }
    const lvl = s.from + (s.to - s.from) * k;
    const p = levelPoint(lvl);
    const size = s.giant ? 2.3 : 1;
    const caught = dyn.caughtAt > 0;
    const pop = caught ? Math.max(0, 1 - (t - dyn.caughtAt) / 0.3) : 1;
    g.visible = true;
    g.position.set(p.x + (s.flying ? s.lateral : 0.2), (s.flying ? 1.8 + Math.sin(t * 5) * 0.25 : 0.55 * size) + (caught ? (1 - pop) * 1.5 : 0), p.z);
    g.scale.setScalar(size * pop * (caught ? 1 + (1 - pop) : 1));
    g.rotation.set(0, s.flying ? t * 3 : Math.PI / 2, 0);
    if (!s.flying) g.rotation.z = -(t - s.start) * 7; // rolls along the path
    if (wings.current) wings.current.rotation.z = Math.sin(t * 22) * 0.7;
    dyn.active = !caught;
    dyn.pos.set(g.position.x, g.position.y, g.position.z);
  });

  return (
    <group ref={group} visible={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 24]} />
        <meshStandardMaterial color={giant ? '#ffe07a' : '#ffd23f'} metalness={0.8} roughness={0.2} emissive="#d98a00" emissiveIntensity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.056]}>
        <torusGeometry args={[0.2, 0.025, 6, 20]} />
        <meshStandardMaterial color="#fff0a8" emissive="#ffb300" emissiveIntensity={0.5} />
      </mesh>
      {flying && (
        <group ref={wings}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, 0.1, side * 0.5]} rotation={[0.3 * side, 0, 0]}>
              <boxGeometry args={[0.28, 0.04, 0.5]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ----------------------------------------------------------- rolling balls */

const BALL_EVERY: [number, number] = [5, 10];
const ROLL_LEVELS = 6;
const TRAIL_N = 18;
const TRAIL_LIFE = 1.4;
const BALL_IDS = itemsOfKind('ball').map((b) => b.id);

/**
 * Every 5 to 10 seconds a ball (any skin of the shop) rolls down a stretch of the path toward the player, painting it as it
 * goes; the paint fades after a moment.
 */
export function RollingBalls({ shared, envMap }: { shared: MapShared; envMap: THREE.Texture | null }) {
  const group = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const [skin, setSkin] = useState('gold');
  const st = useRef({
    next: nowSec() + 3,
    active: false,
    start: 0,
    from: 0,
    cursor: 0,
    sinceEmit: 0,
    px: new Float32Array(TRAIL_N),
    pz: new Float32Array(TRAIL_N),
    born: new Float32Array(TRAIL_N).fill(-99),
    color: Array.from({ length: TRAIL_N }, () => new THREE.Color('#ffffff')),
  });

  useLayoutEffect(() => {
    const m = trail.current;
    if (!m) return;
    o.scale.set(0, 0, 0);
    o.updateMatrix();
    for (let i = 0; i < TRAIL_N; i++) {
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set('#ffffff'));
    }
  }, []);

  useFrame((_, rawDt) => {
    const g = group.current;
    const m = trail.current;
    if (!g || !m) return;
    const t = nowSec();
    const s = st.current;
    if (!s.active) {
      g.visible = false;
      if (t >= s.next) {
        s.active = true;
        s.start = t;
        s.from = Math.round(levelAtZ(shared.z)) + 3 + Math.floor(Math.random() * 3);
        setSkin(BALL_IDS[Math.floor(Math.random() * BALL_IDS.length)]);
      }
    } else {
      const el = t - s.start;
      // It speeds up as it goes down, like a ball let go on a slope.
      const dist = 1.2 * el * el + 1.5 * el;
      const lvl = s.from - dist / 2.6;
      if (lvl < s.from - ROLL_LEVELS) {
        s.active = false;
        s.next = t + BALL_EVERY[0] + Math.random() * (BALL_EVERY[1] - BALL_EVERY[0]);
        g.visible = false;
      } else {
        const p = levelPoint(lvl);
        g.visible = true;
        g.position.set(p.x, 0.5, p.z);
        g.rotation.x = el * 6;
        s.sinceEmit += rawDt;
        if (s.sinceEmit > 0.05) {
          s.sinceEmit = 0;
          const i = s.cursor++ % TRAIL_N;
          s.px[i] = p.x;
          s.pz[i] = p.z;
          s.born[i] = t;
          s.color[i].set(levelPaintColor(Math.round(lvl), undefined));
        }
      }
    }
    // The painted stripe behind it fades out.
    for (let i = 0; i < TRAIL_N; i++) {
      const age = t - s.born[i];
      if (age > TRAIL_LIFE || age < 0) {
        o.scale.set(0, 0, 0);
      } else {
        const f = 1 - age / TRAIL_LIFE;
        o.position.set(s.px[i], 0.07, s.pz[i]);
        o.scale.set(0.75 * f + 0.1, 1, 0.75 * f + 0.1);
        m.setColorAt(i, s.color[i]);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  useEffect(() => undefined, []);
  return (
    <>
      <group ref={group} visible={false} scale={0.95 / (BALL_R * 2) * 0.7}>
        <mesh>
          <BallBody skin={skin} envMap={envMap} />
        </mesh>
      </group>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_N]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 0.05, 14]} />
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
    </>
  );
}
