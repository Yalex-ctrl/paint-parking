import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import type { Cell, Level } from '../game/types';
import type { SceneBus } from './bus';
import { cellX, cellZ } from './coords';
import { tileHeight } from './heights';
import { WorldKeyContext } from './worldContext';

/**
 * The pieces of a tile that breaks, and the dust that goes up when it does (and, a little, when the ball rolls over a collapsing
 * tile). Both are pools made once for the board: a few boxes that fall spinning and sink into the hole, a few puffs that swell and go,
 * all moved in `useFrame` with no React state. Nothing is created while the game runs: an event only wakes up pieces of the pool.
 * The pieces and the puffs do not cast a shadow.
 */
const PIECES = 24;
const PIECES_PER_TILE = 5;
const PUFFS = 12;
const GRAVITY = 15;
/** Below this height a piece is in the hole: it shrinks and is gone. */
const SINK_Y = -0.12;

type Piece = { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; ax: number; ay: number; az: number; spin: number; rx: number; ry: number; rz: number; size: number; shrink: number };
type Puff = { life: number; x: number; y: number; z: number; vx: number; vz: number; r: number };

let pieceGeometry: THREE.BoxGeometry | null = null;
const pieceGeo = () => (pieceGeometry ??= new THREE.BoxGeometry(1, 0.5, 0.8));
let pieceMat: THREE.MeshStandardMaterial | null = null;
const pieceMaterial = () => (pieceMat ??= new THREE.MeshStandardMaterial({ roughness: 0.9 }));
let puffGeometry: THREE.SphereGeometry | null = null;
const puffGeo = () => (puffGeometry ??= new THREE.SphereGeometry(1, 8, 6));
let puffMat: THREE.MeshBasicMaterial | null = null;
const puffMaterial = () => (puffMat ??= new THREE.MeshBasicMaterial({ color: '#cbbfae', transparent: true, opacity: 0.5, depthWrite: false }));

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function CollapseDebris({ level, bus }: { level: Level; bus: SceneBus }) {
  const worldKey = useContext(WorldKeyContext);
  const has = (level.features.collapse ?? []).length > 0;
  const piecesRef = useRef<THREE.InstancedMesh>(null);
  const puffsRef = useRef<THREE.InstancedMesh>(null);
  const pieces = useMemo<Piece[]>(() => Array.from({ length: PIECES }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, spin: 0, rx: 0, ry: 0, rz: 0, size: 0, shrink: 1 })), []);
  const puffs = useMemo<Puff[]>(() => Array.from({ length: PUFFS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, r: 0 })), []);
  const nextPiece = useRef(0);
  const nextPuff = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  const puff = (x: number, y: number, z: number, count: number, spread: number) => {
    for (let k = 0; k < count; k++) {
      const p = puffs[nextPuff.current++ % PUFFS];
      const a = Math.random() * Math.PI * 2;
      p.life = 0.0001;
      p.x = x + Math.cos(a) * 0.12;
      p.y = y + 0.05;
      p.z = z + Math.sin(a) * 0.12;
      p.vx = Math.cos(a) * rand(0.2, spread);
      p.vz = Math.sin(a) * rand(0.2, spread);
      p.r = rand(0.1, 0.18);
    }
  };

  useLayoutEffect(() => {
    if (!has) return;
    // Everything starts out of sight.
    const pm = piecesRef.current;
    const fm = puffsRef.current;
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = 0; i < PIECES; i++) {
      pm?.setMatrixAt(i, dummy.matrix);
      pm?.setColorAt(i, tint.set('#8a7a6a'));
    }
    for (let i = 0; i < PUFFS; i++) fm?.setMatrixAt(i, dummy.matrix);
    if (pm) pm.instanceMatrix.needsUpdate = true;
    if (pm?.instanceColor) pm.instanceColor.needsUpdate = true;
    if (fm) fm.instanceMatrix.needsUpdate = true;

    const offFall = bus.on(
      'fall',
      (cell: Cell, color: string) => {
        const x = cellX(level, cell[1]);
        const z = cellZ(level, cell[0]);
        const y0 = tileHeight(level, cell[0], cell[1]);
        const m = piecesRef.current;
        for (let k = 0; k < PIECES_PER_TILE; k++) {
          const i = nextPiece.current++ % PIECES;
          const p = pieces[i];
          const a = (k / PIECES_PER_TILE) * Math.PI * 2 + rand(-0.4, 0.4);
          p.alive = true;
          p.x = x + Math.cos(a) * 0.18;
          p.y = y0;
          p.z = z + Math.sin(a) * 0.18;
          p.vx = Math.cos(a) * rand(0.2, 0.9);
          p.vz = Math.sin(a) * rand(0.2, 0.9);
          p.vy = rand(0.4, 1.6);
          p.ax = Math.random();
          p.ay = Math.random();
          p.az = Math.random();
          p.spin = rand(3, 9);
          p.rx = p.ry = p.rz = 0;
          p.size = rand(0.2, 0.34);
          p.shrink = 1;
          if (m) {
            // The colour of the tile, a little varied from piece to piece.
            tint.set(color).offsetHSL(0, 0, rand(-0.08, 0.06));
            m.setColorAt(i, tint);
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
          }
        }
        puff(x, y0, z, 4, 0.9);
      },
      worldKey,
    );
    const offCrumble = bus.on('crumble', (cell: Cell) => puff(cellX(level, cell[1]), tileHeight(level, cell[0], cell[1]), cellZ(level, cell[0]), 2, 0.5), worldKey);
    return () => {
      offFall();
      offCrumble();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, level, worldKey, has]);

  useFrame((_, rawDt) => {
    if (!has) return;
    const dt = Math.min(rawDt, 1 / 20);
    const pm = piecesRef.current;
    const fm = puffsRef.current;
    let movedPieces = false;
    if (pm) {
      for (let i = 0; i < PIECES; i++) {
        const p = pieces[i];
        if (!p.alive) continue;
        movedPieces = true;
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.ax * p.spin * dt;
        p.ry += p.ay * p.spin * dt;
        p.rz += p.az * p.spin * dt;
        // In the hole the piece shrinks away: it disappears under the platform, it never goes through the floor of the board.
        if (p.y < SINK_Y) p.shrink = Math.max(0, p.shrink - dt * 4);
        if (p.shrink <= 0) {
          p.alive = false;
          dummy.scale.set(0, 0, 0);
        } else {
          dummy.scale.setScalar(p.size * p.shrink);
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx, p.ry, p.rz);
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      }
      if (movedPieces) pm.instanceMatrix.needsUpdate = true;
    }
    let movedPuffs = false;
    if (fm) {
      for (let i = 0; i < PUFFS; i++) {
        const p = puffs[i];
        if (p.life <= 0) continue;
        movedPuffs = true;
        p.life += dt;
        const k = p.life / 0.55;
        if (k >= 1) {
          p.life = 0;
          dummy.scale.set(0, 0, 0);
        } else {
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += 0.35 * dt;
          dummy.scale.setScalar(p.r * (0.6 + 1.6 * k) * (1 - k * k));
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        fm.setMatrixAt(i, dummy.matrix);
      }
      if (movedPuffs) fm.instanceMatrix.needsUpdate = true;
    }
  });

  if (!has) return null;
  return (
    <group>
      <instancedMesh ref={piecesRef} args={[pieceGeo(), pieceMaterial(), PIECES]} frustumCulled={false} />
      <instancedMesh ref={puffsRef} args={[puffGeo(), puffMaterial(), PUFFS]} frustumCulled={false} renderOrder={6} />
    </group>
  );
}
