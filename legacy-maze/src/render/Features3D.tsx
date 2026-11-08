import { useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useFrame } from '@react-three/fiber/native';

import type { Cell, Level } from '../game/types';
import type { SceneBus } from './bus';
import { BASE_Y, WALL_H, cellX, cellZ } from './coords';
import { Coins } from './Coins';
import { tileHeight } from './heights';
import { buildCornerWallGeometry } from './geometry';
import { MARK_SIZE, POP_DURATION, popScale, pulseScale, x2Texture } from './x2Mark';
import { WorldKeyContext } from './worldContext';

/** Colour of each portal pair. */
export const PORTAL_COLORS = ['#38bdf8', '#f472b6'];

const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

type Props = { level: Level; bus: SceneBus };

/**
 * Everything that makes the special tiles visible: stop pads, curved walls of the bends,
 * glowing portals, the big "x2" of the tiles to cross twice, bombs, coins and the cracked walls.
 * The pieces react to what the ball does through the bus (paint / coin / bomb / break / portal).
 */
export function Features3D({ level, bus }: Props) {
  const f = level.features;
  return (
    <group>
      {f.stops.map((c) => (
        <StopPad key={`s${c}`} level={level} cell={c} />
      ))}
      {f.corners.map((k) => (
        <CornerWall key={`k${k.r},${k.c}`} level={level} r={k.r} c={k.c} a={k.a} b={k.b} />
      ))}
      {f.portals.flatMap((p, i) =>
        [p.a, p.b].map((cell, j) => <Portal key={`p${i}${j}`} level={level} bus={bus} cell={cell} color={PORTAL_COLORS[i % 2]} />),
      )}
      <DoubleMarks level={level} bus={bus} />
      {f.bombs.map((c) => (
        <Bomb key={`b${c}`} level={level} bus={bus} cell={c} />
      ))}
      <Coins level={level} bus={bus} />
      <FragileBlocks level={level} bus={bus} />
    </group>
  );
}

/** A slightly raised round road-sign: red disc with a white bar, white rim. */
function StopPad({ level, cell }: { level: Level; cell: Cell }) {
  return (
    <group position={[cellX(level, cell[1]), tileHeight(level, cell[0], cell[1]), cellZ(level, cell[0])]}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.39, 0.4, 0.08, 28]} />
        <meshStandardMaterial color="#f6f6f2" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.0815, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.31, 28]} />
        <meshStandardMaterial color="#d62828" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.083, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.45} />
      </mesh>
    </group>
  );
}

/** The small curved wooden wall that closes the outside of a bend. */
function CornerWall({ level, r, c, a, b }: { level: Level; r: number; c: number; a: string; b: string }) {
  const geometry = useMemo(() => buildCornerWallGeometry(a, b), [a, b]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[cellX(level, c), tileHeight(level, r, c), cellZ(level, r)]}>
      <meshStandardMaterial vertexColors roughness={0.75} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Glowing ring with orbiting sparks; flashes when the ball goes through. */
function Portal({ level, bus, cell, color }: { level: Level; bus: SceneBus; cell: Cell; color: string }) {
  const worldKey = useContext(WorldKeyContext);
  const ring = useRef<THREE.Mesh>(null);
  const disc = useRef<THREE.Mesh>(null);
  const orbit = useRef<THREE.Group>(null);
  const flash = useRef(0);

  useEffect(
    () =>
      bus.on('portal', (c) => {
        if (sameCell(c, cell)) flash.current = 1;
      }, worldKey),
    [bus, cell, worldKey],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = clock.elapsedTime;
    flash.current = Math.max(0, flash.current - dt * 3.5);
    const pulse = 1 + Math.sin(t * 4) * 0.05 + flash.current * 0.35;
    if (ring.current) {
      ring.current.scale.set(pulse, pulse, 1);
      (ring.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + flash.current * 2.2 + Math.sin(t * 5) * 0.2;
    }
    if (disc.current) {
      disc.current.rotation.z = t * 2.2;
      (disc.current.material as THREE.MeshBasicMaterial).opacity = 0.42 + flash.current * 0.4 + Math.sin(t * 3) * 0.08;
    }
    if (orbit.current) orbit.current.rotation.y = -t * 2.6;
  });

  return (
    <group position={[cellX(level, cell[1]), tileHeight(level, cell[0], cell[1]), cellZ(level, cell[0])]}>
      <mesh ref={ring} position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.36, 0.055, 12, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} roughness={0.3} />
      </mesh>
      <mesh ref={disc} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.31, 28, 1, 0, Math.PI * 1.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={orbit} position={[0, 0.12, 0]}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[Math.cos((k * Math.PI * 2) / 3) * 0.36, 0, Math.sin((k * Math.PI * 2) / 3) * 0.36]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * The big "x2" on every tile that has to be crossed twice: one instanced mesh and one shared texture for all of them (no text object
 * per tile). It pulses slowly while the tile has not been visited; at the first pass it swells a little and is gone (a discreet
 * sound), and the tile stays unpainted. The second pass paints it like any other tile.
 */
function DoubleMarks({ level, bus }: { level: Level; bus: SceneBus }) {
  const worldKey = useContext(WorldKeyContext);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = level.features.doubles;
  /** Seconds since the first pass over each mark (null = not visited yet). */
  const popping = useRef<(number | null)[]>(cells.map(() => null));
  const alive = useRef(cells.length);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: x2Texture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(
    () =>
      bus.on('paint', (p) => {
        const i = cells.findIndex((c) => sameCell(c, p.cell));
        if (i < 0 || popping.current[i] !== null) return;
        popping.current[i] = 0;
        bus.onEvent?.('double');
      }, worldKey),
    [bus, cells, worldKey],
  );

  useFrame(({ clock }, rawDt) => {
    const m = mesh.current;
    if (!m || alive.current === 0) return;
    const dt = Math.min(rawDt, 1 / 20);
    const t = clock.elapsedTime;
    let left = 0;
    for (let i = 0; i < cells.length; i++) {
      const k = popping.current[i];
      let scale: number;
      if (k === null) {
        scale = MARK_SIZE * pulseScale(t + i * 0.7);
        left++;
      } else {
        const next = Math.min(1, k + dt / POP_DURATION);
        popping.current[i] = next;
        scale = MARK_SIZE * popScale(next);
        if (next < 1) left++;
      }
      dummy.position.set(cellX(level, cells[i][1]), 0.045 + tileHeight(level, cells[i][0], cells[i][1]), cellZ(level, cells[i][0]));
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    alive.current = left;
    if (left === 0) m.visible = false;
  });

  if (cells.length === 0) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, cells.length]} frustumCulled={false} renderOrder={5} />;
}

/** A black bomb with a sparking fuse; blows up in a shock wave when the ball passes. */
function Bomb({ level, bus, cell }: { level: Level; bus: SceneBus; cell: Cell }) {
  const worldKey = useContext(WorldKeyContext);
  const body = useRef<THREE.Group>(null);
  const spark = useRef<THREE.Mesh>(null);
  const wave = useRef<THREE.Mesh>(null);
  const blast = useRef<number | null>(null);

  useEffect(
    () =>
      bus.on('bomb', (center) => {
        if (sameCell(center, cell)) blast.current = 0;
      }, worldKey),
    [bus, cell, worldKey],
  );

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const b = body.current;
    if (b && blast.current === null) {
      b.position.y = 0.24 + Math.sin(t * 3 + cell[0]) * 0.025;
      b.rotation.y = Math.sin(t * 1.5) * 0.3;
    }
    if (spark.current) spark.current.scale.setScalar(0.8 + Math.sin(t * 30) * 0.35);
    if (blast.current !== null && wave.current && b) {
      blast.current = Math.min(1, blast.current + Math.min(rawDt, 1 / 20) / 0.45);
      const k = blast.current;
      b.visible = k < 0.08;
      wave.current.visible = k < 1;
      const s = 0.3 + k * 3.2;
      wave.current.scale.set(s, s, 1);
      (wave.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
    }
  });

  return (
    <group position={[cellX(level, cell[1]), tileHeight(level, cell[0], cell[1]), cellZ(level, cell[0])]}>
      <group ref={body} position={[0, 0.24, 0]}>
        <mesh>
          <sphereGeometry args={[0.21, 18, 14]} />
          <meshStandardMaterial color="#23232b" metalness={0.45} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.085, 0.08, 12]} />
          <meshStandardMaterial color="#6b6f7a" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.03, 0.29, 0]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.012, 0.012, 0.13, 6]} />
          <meshStandardMaterial color="#8a6a3a" />
        </mesh>
        <mesh ref={spark} position={[0.075, 0.35, 0]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshBasicMaterial color="#ffb02e" />
        </mesh>
      </group>
      <mesh ref={wave} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}


/** Cracked blocks standing where a fragile wall is; they collapse when the ball hits them. */
function FragileBlocks({ level, bus }: Props) {
  const geometry = useMemo(() => new RoundedBoxGeometry(0.99, WALL_H - BASE_Y, 0.99, 3, 0.08), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      {level.features.fragile.map((cell) => (
        <FragileBlock key={`f${cell}`} level={level} bus={bus} cell={cell} geometry={geometry} />
      ))}
    </>
  );
}

function FragileBlock({ level, bus, cell, geometry }: { level: Level; bus: SceneBus; cell: Cell; geometry: THREE.BufferGeometry }) {
  const worldKey = useContext(WorldKeyContext);
  const group = useRef<THREE.Group>(null);
  const broken = useRef<number | null>(null);

  useEffect(
    () =>
      bus.on('breakWall', (c) => {
        if (sameCell(c, cell) && broken.current === null) broken.current = 0;
      }, worldKey),
    [bus, cell, worldKey],
  );

  useFrame((_, rawDt) => {
    const g = group.current;
    if (!g || broken.current === null) return;
    broken.current = Math.min(1, broken.current + Math.min(rawDt, 1 / 20) / 0.22);
    const k = broken.current;
    g.scale.set(1 + k * 0.15, Math.max(0.001, 1 - k), 1 + k * 0.15);
    if (k >= 1) g.visible = false;
  });

  const crack = (x: number, y: number, z: number, rot: [number, number, number], len: number, onTop: boolean) => (
    <mesh position={[x, y, z]} rotation={rot}>
      <boxGeometry args={onTop ? [len, 0.012, 0.045] : [len, 0.045, 0.012]} />
      <meshStandardMaterial color="#4a2c14" roughness={0.9} />
    </mesh>
  );
  const topY = WALL_H + 0.004;
  return (
    <group ref={group} position={[cellX(level, cell[1]), 0, cellZ(level, cell[0])]}>
      <mesh geometry={geometry} position={[0, (WALL_H + BASE_Y) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#d99b5c" roughness={0.85} />
      </mesh>
      {/* cracks on the top and on the face toward the camera */}
      {crack(-0.05, topY, -0.1, [0, 0.5, 0], 0.7, true)}
      {crack(0.18, topY, 0.16, [0, -0.7, 0], 0.4, true)}
      {crack(-0.22, topY, 0.2, [0, 0.9, 0], 0.32, true)}
      {crack(0, WALL_H * 0.5, 0.497, [0, 0, 0.4], 0.6, false)}
      {crack(0.14, WALL_H * 0.32, 0.497, [0, 0, -0.9], 0.36, false)}
      {crack(-0.2, WALL_H * 0.7, 0.497, [0, 0, -0.5], 0.34, false)}
    </group>
  );
}
