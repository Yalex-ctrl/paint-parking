import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { DELTA, type Cell, type Level } from '../game/types';
import type { SceneBus } from './bus';
import { GROUND_Y, PLATEAU_H, WALL_H, cellX, cellZ } from './coords';
import { crackGeometry, crackMaterial, holeGeometry, holeMaterial } from './collapseVisuals';
import { CollapseDebris } from './CollapseDebris';
import { RAMP_STRETCH, rampNormal } from './heights';
import { TierMeshes } from './TierMeshes';
import { buildBoardGeometries, type BoardGeometries } from './geometry';
import { SHADOW_MARGIN, buildBoardShadowTexture } from './boardShadow';
import { animatePaint, isPaintEffect, paintStyle, paintTint, sharedPaintMaterial } from './paintEffects';
import { ExitMarks, GatePadlock } from './ExitMarks';
import { benchPhase } from '../core/render/bench';
import { RenderStyleContext } from './style';
import { sharedWoodMaterial } from './slideVisuals';
import { WorldKeyContext } from './worldContext';

const PAINT_SECONDS = 0.22;
/** The wave of shine that runs over the painted board when the last tile is done. */
const WAVE_SECONDS = 0.55;
const WAVE_DELAY = 0.06;
/** The gate of the entry rises from the floor behind the ball in this long (seconds), with a little rebound. */
const ENTRY_CLOSE_SECONDS = 0.25;
const GATE_OPEN_SPEED = 6.7; // progress per second: the gate is up in about 150 ms
/** How far the barrier sits from the middle of the exit cell, toward the outside of the board. */
const GATE_OFFSET = 0.3;
const tmp = new THREE.Object3D();
const tint = new THREE.Color();
const UP_V = new THREE.Vector3(0, 1, 0);
/** How long a collapsing tile trembles before it breaks, and how hard (world units). */
const BREAK_TREMBLE = 0.15;
const BREAK_AMP = 0.03;
const CRUMBLE_TREMBLE = 0.2;
const CRUMBLE_AMP = 0.012;
/** A collapsing tile sits a hair lower than its neighbours. */
const COLLAPSE_DROP = 0.012;

const easeOutBack = (p: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

// Cheap deterministic hash -> [0, 1) so tile shades don't change between renders.
const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Props = {
  level: Level;
  bus: SceneBus;
  /** Prepared geometry (then owned by the caller); built here when absent. */
  geometries?: BoardGeometries;
};

/**
 * The maze: ONE merged wall block (no seams, rounded edges), instanced floor tiles that form the
 * visible grid inside the corridors, the progressive paint layer (one instanced tile per paintable
 * cell, popping in as the ball passes; a double tile is painted by its second pass), soft contact
 * shadows at the foot of the walls, and the exit gate that sinks once everything is painted.
 *
 * The parent remounts this component for every level / restart (via `key`),
 * so all per-level state can live in refs initialised here.
 */
export function Board({ level, bus, geometries }: Props) {
  const worldKey = useContext(WorldKeyContext);
  const { paint: paintId, env } = useContext(RenderStyleContext);
  const effect = isPaintEffect(paintId) ? paintId : 'classic';
  // One material for every painted tile of every board (shared: see sharedPaintMaterial); a moving paint is animated by one clock.
  const paintMaterial = useMemo(() => sharedPaintMaterial(effect, env), [effect, env]);
  const animated = !!paintStyle(effect).animated;
  const floorRef = useRef<THREE.InstancedMesh>(null);
  const paintRef = useRef<THREE.InstancedMesh>(null);
  const crackRef = useRef<THREE.InstancedMesh>(null);
  const holeRef = useRef<THREE.InstancedMesh>(null);
  const gateRef = useRef<THREE.Group>(null);
  const entryGateRef = useRef<THREE.Group>(null);
  /** The entry gate: 1 = up (shut). It is down while the ball comes in, then rises behind it. */
  const entryGate = useRef({ p: 1, arrived: false });

  // Paintable cells: floor tiles, and the fragile walls (floor once broken).
  const { floors, floorIndex, doubles } = useMemo(() => {
    const floors: Cell[] = [];
    const floorIndex = new Map<number, number>();
    const add = (r: number, c: number) => {
      floorIndex.set(r * level.cols + c, floors.length);
      floors.push([r, c]);
    };
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (level.grid[r][c] === '.') add(r, c);
    for (const [r, c] of level.features.fragile) add(r, c);
    const doubles = new Set(level.features.doubles.map(([r, c]) => r * level.cols + c));
    return { floors, floorIndex, doubles };
  }, [level]);

  // How each tile sits: its height (platform, ramp, ordinary), the tilt of a ramp, and which collapsing tile it is.
  const layout = useMemo(() => {
    const raised = new Set((level.features.raised ?? []).map(([r, c]) => r * level.cols + c));
    const ramps = new Map((level.features.ramps ?? []).map((k) => [k.r * level.cols + k.c, k.up]));
    const collapse = new Map((level.features.collapse ?? []).map(([r, c], k) => [r * level.cols + c, k]));
    return floors.map(([r, c]) => {
      const key = r * level.cols + c;
      const up = ramps.get(key);
      if (up) {
        const nm = rampNormal(up);
        return { y: PLATEAU_H / 2, q: new THREE.Quaternion().setFromUnitVectors(UP_V, new THREE.Vector3(nm[0], nm[1], nm[2])), alongZ: up === 'U' || up === 'D', raised: false, collapse: -1 };
      }
      return { y: raised.has(key) ? PLATEAU_H : 0, q: null, alongZ: false, raised: raised.has(key), collapse: collapse.get(key) ?? -1 };
    });
  }, [floors, level]);
  /** The floor index of each collapsing tile, in the order of the level's list. */
  const collapseTiles = useMemo(() => {
    const out: number[] = [];
    layout.forEach((l, i) => {
      if (l.collapse >= 0) out[l.collapse] = i;
    });
    return out;
  }, [layout]);
  /** Trembling of the tiles (a collapsing one that the ball crosses or has left), and how far each paint tile has grown. */
  const shakeX = useRef(new Float32Array(floors.length));
  const shakeZ = useRef(new Float32Array(floors.length));
  const paintScale = useRef(new Float32Array(floors.length));
  const fell = useRef(new Uint8Array(floors.length));
  const shakes = useRef<{ i: number; t: number; dur: number; amp: number; breaks: boolean }[]>([]);

  /** Puts an instance of a tile where it belongs: its height, the slope of a ramp, the trembling, a scale. */
  const place = (obj: THREE.Object3D, i: number, yOff: number, s: number) => {
    const l = layout[i];
    const [r, c] = floors[i];
    obj.position.set(cellX(level, c) + shakeX.current[i], l.y + yOff - (l.collapse >= 0 ? COLLAPSE_DROP : 0), cellZ(level, r) + shakeZ.current[i]);
    if (l.q) {
      obj.quaternion.copy(l.q);
      obj.scale.set(l.alongZ ? s : s * RAMP_STRETCH, 1, l.alongZ ? s * RAMP_STRETCH : s);
    } else {
      obj.quaternion.identity();
      obj.scale.set(s, 1, s);
    }
    obj.updateMatrix();
  };

  const owned = useMemo(() => (geometries ? null : buildBoardGeometries(level)), [geometries, level]);
  const wallGeometry = geometries?.walls ?? owned!.walls;
  const shadowGeometry = geometries?.shadows ?? owned!.shadows;
  const slabGeometry = geometries?.slab ?? owned!.slab;
  useEffect(
    () => () => {
      owned?.walls.dispose();
      owned?.shadows.dispose();
      owned?.slab.dispose();
    },
    [owned],
  );

  const shadowTexture = useMemo(() => buildBoardShadowTexture(level), [level]);
  useEffect(() => () => shadowTexture.dispose(), [shadowTexture]);

  const baseColor = useMemo(() => new THREE.Color(level.color), [level.color]);
  const hasTiers = (level.features.raised ?? []).length > 0;

  // Paint animation state (mutated every frame, never in React state).
  const coat = useRef(new Uint8Array(floors.length));
  const progress = useRef(new Float32Array(floors.length).fill(1));
  const delay = useRef(new Float32Array(floors.length));
  const from = useRef(new Float32Array(floors.length));
  const queued = useRef(new Uint8Array(floors.length));
  const active = useRef<number[]>([]);
  const layersPainted = useRef(0);
  /** For each tile, how many tiles were painted before it (the rainbow follows the path). */
  const order = useRef(new Int32Array(floors.length).fill(-1));
  const paintedCount = useRef(0);
  /** The shine wave: time since it started (negative = not yet) and the colours the tiles had. */
  const wave = useRef<{ t: number; orig: Float32Array; dur: number } | null>(null);
  /** Distance of each tile from the start tile, 0 to 1: the wave runs from the start outward. */
  const waveDistance = useMemo(() => {
    const d = floors.map(([r, c]) => Math.hypot(r - level.start[0], c - level.start[1]));
    const max = Math.max(1, ...d);
    return d.map((x) => x / max);
  }, [floors, level]);
  const gate = useRef({ opening: false, p: 0 });

  useLayoutEffect(() => {
    const mesh = floorRef.current;
    const paint = paintRef.current;
    if (!mesh || !paint) return;
    floors.forEach((_, i) => {
      place(tmp, i, -0.06, 1);
      mesh.setMatrixAt(i, tmp.matrix);
      // The floor of a platform is a little lighter: the platform reads as another level.
      tint.setHSL(layout[i].raised ? 0.1 : 0.72, layout[i].raised ? 0.3 : 0.18, (layout[i].raised ? 0.34 : 0.2) + (hash01(i + 99) - 0.5) * 0.03);
      mesh.setColorAt(i, tint);

      // Paint tiles start fully shrunk.
      place(tmp, i, 0.015, 0);
      paint.setMatrixAt(i, tmp.matrix);
      paint.setColorAt(i, baseColor);
    });
    // The cracks over the collapsing tiles, and the holes they will leave (hidden until the tile breaks).
    const cracks = crackRef.current;
    const holes = holeRef.current;
    collapseTiles.forEach((fi, k) => {
      if (cracks) {
        place(tmp, fi, 0.03, 1);
        cracks.setMatrixAt(k, tmp.matrix);
      }
      if (holes) {
        const [r, c] = floors[fi];
        tmp.position.set(cellX(level, c), layout[fi].y, cellZ(level, r));
        tmp.quaternion.identity();
        tmp.scale.set(0, 0, 0);
        tmp.updateMatrix();
        holes.setMatrixAt(k, tmp.matrix);
      }
    });
    if (cracks) cracks.instanceMatrix.needsUpdate = true;
    if (holes) holes.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    paint.instanceMatrix.needsUpdate = true;
    if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
  }, [floors, level, baseColor, layout, collapseTiles]);

  // A collapsing tile: it trembles when the ball rolls over it, and trembles then breaks once the ball has left it.
  useLayoutEffect(() => {
    const start = (cell: Cell, dur: number, amp: number, breaks: boolean) => {
      const i = floorIndex.get(cell[0] * level.cols + cell[1]);
      if (i === undefined || fell.current[i]) return;
      shakes.current.push({ i, t: 0, dur, amp, breaks });
    };
    const offCrumble = bus.on('crumble', (cell) => start(cell, CRUMBLE_TREMBLE, CRUMBLE_AMP, false), worldKey);
    const offCollapse = bus.on('collapse', (cell) => start(cell, BREAK_TREMBLE, BREAK_AMP, true), worldKey);
    return () => {
      offCrumble();
      offCollapse();
    };
  }, [bus, floorIndex, level, worldKey]);

  useLayoutEffect(() => {
    return bus.on('paint', (p, wait = 0) => {
      const i = floorIndex.get(p.cell[0] * level.cols + p.cell[1]);
      const paint = paintRef.current;
      if (i === undefined || !paint || p.coat <= coat.current[i]) return;
      coat.current[i] = p.coat;
      // A tile that must be crossed twice (the "x2") stays bare after the first pass: only the second one paints it.
      const isDouble = doubles.has(p.cell[0] * level.cols + p.cell[1]);
      if (!isDouble || p.coat >= 2) {
        if (order.current[i] < 0) order.current[i] = paintedCount.current++;
        paintTint(tint, effect, baseColor, {
          order: order.current[i],
          noise: hash01(i + 7) - 0.5,
          coat: 1,
          double: false,
          pos: { u: p.cell[1] / Math.max(1, level.cols - 1), v: p.cell[0] / Math.max(1, level.rows - 1) },
        });
        // On a level with platforms the paint keeps the height in its light: a touch lighter up, a touch darker down.
        if (hasTiers) tint.offsetHSL(0, 0, layout[i].raised ? 0.045 : -0.025);
        paint.setColorAt(i, tint);
        if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
        // A tile painted while the wave runs (a bomb's blast, the last coat): the colours the wave gives back are the real ones.
        const running = wave.current;
        if (running) {
          running.orig[i * 3] = tint.r;
          running.orig[i * 3 + 1] = tint.g;
          running.orig[i * 3 + 2] = tint.b;
        }

        progress.current[i] = 0;
        delay.current[i] = wait;
        from.current[i] = 0;
        if (!queued.current[i]) {
          queued.current[i] = 1;
          active.current.push(i);
        }
      }
      layersPainted.current++;
      if (layersPainted.current >= level.layers) {
        gate.current.opening = true;
        benchPhase('lastTile');
        // The last tile: a wave of shine over everything painted. The ball's speed is not touched.
        if (paint.instanceColor) {
          wave.current = { t: -WAVE_DELAY, orig: new Float32Array(paint.instanceColor.array as Float32Array), dur: WAVE_SECONDS };
        }
        bus.exitOpenKey = worldKey;
        bus.exitOpenAt = performance.now() / 1000;
        bus.onEvent?.('exitOpen');
      }
    }, worldKey);
  }, [bus, floorIndex, level, doubles, baseColor, worldKey, effect, hasTiers, layout]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const paint = paintRef.current;
    if (animated) animatePaint(paintMaterial, effect, state.clock.elapsedTime);
    // Trembling tiles: their floor, their paint and their cracks shake together; at the end of a collapse they break and leave a hole.
    const sh = shakes.current;
    const floorMesh = floorRef.current;
    if (paint && floorMesh && sh.length > 0) {
      for (let k = sh.length - 1; k >= 0; k--) {
        const s = sh[k];
        s.t += dt;
        const done = s.t >= s.dur;
        const amp = done ? 0 : s.amp * (1 - s.t / s.dur);
        shakeX.current[s.i] = Math.sin(s.t * 70) * amp;
        shakeZ.current[s.i] = Math.cos(s.t * 83) * amp;
        if (done && s.breaks && !fell.current[s.i]) {
          // The tile breaks: it is gone (floor, paint, cracks), the hole is there, and the pieces fall.
          fell.current[s.i] = 1;
          const [r, c] = floors[s.i];
          paint.getColorAt(s.i, tint);
          bus.emit('fall', [r, c], `#${tint.getHexString()}`);
          bus.onEvent?.('collapse');
          const holes = holeRef.current;
          const slot = layout[s.i].collapse;
          if (holes && slot >= 0) {
            tmp.position.set(cellX(level, c), layout[s.i].y, cellZ(level, r));
            tmp.quaternion.identity();
            tmp.scale.set(1, 1, 1);
            tmp.updateMatrix();
            holes.setMatrixAt(slot, tmp.matrix);
            holes.instanceMatrix.needsUpdate = true;
          }
        }
        const gone = fell.current[s.i] === 1;
        place(tmp, s.i, -0.06, gone ? 0 : 1);
        floorMesh.setMatrixAt(s.i, tmp.matrix);
        place(tmp, s.i, 0.015, gone ? 0 : paintScale.current[s.i]);
        paint.setMatrixAt(s.i, tmp.matrix);
        const crack = crackRef.current;
        if (crack && layout[s.i].collapse >= 0) {
          place(tmp, s.i, 0.03, gone ? 0 : 1);
          crack.setMatrixAt(layout[s.i].collapse, tmp.matrix);
          crack.instanceMatrix.needsUpdate = true;
        }
        if (done) sh.splice(k, 1);
      }
      floorMesh.instanceMatrix.needsUpdate = true;
      paint.instanceMatrix.needsUpdate = true;
    }

    const list = active.current;
    if (paint && list.length > 0) {
      for (let k = list.length - 1; k >= 0; k--) {
        const i = list[k];
        if (delay.current[i] > 0) {
          delay.current[i] -= dt;
          continue;
        }
        const p = Math.min(1, progress.current[i] + dt / PAINT_SECONDS);
        progress.current[i] = p;
        const s0 = from.current[i];
        const s = p >= 1 ? 1 : s0 + (1 - s0) * easeOutBack(p);
        paintScale.current[i] = s;
        place(tmp, i, 0.015, fell.current[i] ? 0 : s);
        paint.setMatrixAt(i, tmp.matrix);
        if (p >= 1) {
          list.splice(k, 1);
          queued.current[i] = 0;
        }
      }
      paint.instanceMatrix.needsUpdate = true;
    }

    // The wave: a band of white moving from the start tile outward, over the tiles (their colours are put back afterwards).
    const w = wave.current;
    if (w && paint?.instanceColor) {
      w.t += dt;
      // It plays once, and is over before the ball leaves the board: if the ball is already out, the real colours come back at
      // once, so the board that is left never shows a pale tile.
      if (bus.transitioning || bus.exitFall) {
        (paint.instanceColor.array as Float32Array).set(w.orig);
        paint.instanceColor.needsUpdate = true;
        wave.current = null;
      } else if (w.t >= 0) {
        const k = w.t / w.dur;
        const arr = paint.instanceColor.array as Float32Array;
        const front = k * 1.3 - 0.15;
        for (let i = 0; i < floors.length; i++) {
          const band = k >= 1 ? 0 : Math.max(0, 1 - Math.abs(waveDistance[i] - front) / 0.16);
          const m = band * 0.75;
          arr[i * 3] = w.orig[i * 3] + (1 - w.orig[i * 3]) * m;
          arr[i * 3 + 1] = w.orig[i * 3 + 1] + (1 - w.orig[i * 3 + 1]) * m;
          arr[i * 3 + 2] = w.orig[i * 3 + 2] + (1 - w.orig[i * 3 + 2]) * m;
        }
        paint.instanceColor.needsUpdate = true;
        if (k >= 1) wave.current = null;
      }
    }

    // The entry gate: down while the ball comes in through it; once the ball has landed it rises behind it (about 250 ms, with a
    // small rebound, a soft knock and a light vibration). It is a wall for the rest of the level, and already up after a restart.
    const eg = entryGate.current;
    const gateObj = entryGateRef.current;
    if (gateObj) {
      if (bus.arrivalKey === worldKey) {
        eg.arrived = true;
        eg.p = 0;
        gateObj.visible = false;
      } else {
        if (eg.arrived && eg.p === 0) bus.onEvent?.('gate');
        if (eg.arrived && eg.p < 1) eg.p = Math.min(1, eg.p + dt / ENTRY_CLOSE_SECONDS);
        if (eg.p >= 1) eg.arrived = false;
        gateObj.visible = true;
        gateObj.position.y = -(1 - easeOutBack(eg.p)) * 1.0;
      }
    }

    const g = gate.current;
    if (g.opening && g.p < 1) {
      if (g.p === 0) benchPhase('exitOpening');
      g.p = Math.min(1, g.p + dt * GATE_OPEN_SPEED);
      const e = g.p * g.p * (3 - 2 * g.p);
      if (gateRef.current) {
        gateRef.current.position.y = -e * 0.85; // the barrier sinks into the floor...
        gateRef.current.visible = g.p < 1; // ...and is gone once it has: nothing is left at the opening
      }
    }
  });

  // The exit is an opening in the outer wall. `out` points out of the board (world x, z).
  const gx = cellX(level, level.exit.c);
  const gz = cellZ(level, level.exit.r);
  const [exitDr, exitDc] = DELTA[level.exit.dir];
  const gateX = gx + exitDc * GATE_OFFSET;
  const gateZ = gz + exitDr * GATE_OFFSET;
  const gateSpin = exitDc !== 0 ? Math.PI / 2 : 0; // the barrier runs across the opening
  // The entry: the same opening in the wall, on the side the ball came from.
  const entry = level.entry;
  const [entryDr, entryDc] = entry ? DELTA[entry.side] : [0, 0];
  const ex = entry ? cellX(level, entry.c) : 0;
  const ez = entry ? cellZ(level, entry.r) : 0;

  return (
    <group>
      {/* Base slab under the whole board: the dark "carved" ground between the floor tiles. */}
      {/* Drop shadow of the board on the ground, away from the light: the board stands out from any ground. */}
      <mesh position={[0.3, GROUND_Y + 0.012, -0.24]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[level.cols + SHADOW_MARGIN * 2, level.rows + SHADOW_MARGIN * 2]} />
        <meshBasicMaterial map={shadowTexture} transparent depthWrite={false} />
      </mesh>

      <mesh geometry={slabGeometry} receiveShadow>
        <meshStandardMaterial color="#1c1620" roughness={0.95} />
      </mesh>

      <mesh geometry={wallGeometry} castShadow receiveShadow>
        <primitive object={sharedWoodMaterial()} attach="material" />
      </mesh>

      <instancedMesh ref={floorRef} args={[undefined, undefined, floors.length]} frustumCulled={false} receiveShadow>
        <boxGeometry args={[0.94, 0.12, 0.94]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={paintRef} args={[undefined, undefined, floors.length]} frustumCulled={false} receiveShadow>
        <boxGeometry args={[0.92, 0.03, 0.92]} />
        <primitive object={paintMaterial} attach="material" />
      </instancedMesh>

      {/* The sharp cracks over the tiles that collapse, and the holes they leave. */}
      {collapseTiles.length > 0 && <instancedMesh ref={crackRef} args={[crackGeometry(), crackMaterial(), collapseTiles.length]} frustumCulled={false} renderOrder={3} />}
      {collapseTiles.length > 0 && <instancedMesh ref={holeRef} args={[holeGeometry(), holeMaterial(), collapseTiles.length]} frustumCulled={false} renderOrder={2} />}
      <TierMeshes level={level} />
      <CollapseDebris level={level} bus={bus} />

      {/* Contact shadows (cheap ambient occlusion) at the foot of the walls. */}
      <mesh geometry={shadowGeometry} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} />
      </mesh>

      {/* Exit: the threshold of the opening, in the same wood as the walls... */}
      <mesh position={[gx, GROUND_Y / 2, gz]} receiveShadow>
        <boxGeometry args={[1, -GROUND_Y, 1]} />
        <meshStandardMaterial color="#d6ab74" roughness={0.75} />
      </mesh>
      {/* ...closed by a gate as tall as the walls, in the level colour, with a padlock; it sinks away when everything is painted. */}
      <group ref={gateRef} position={[gateX, 0, gateZ]} rotation={[0, gateSpin, 0]}>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, WALL_H / 2, 0]}>
            <boxGeometry args={[0.12, WALL_H, 0.14]} />
            <meshStandardMaterial color="#d6ab74" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, WALL_H * 0.5, 0]}>
          <boxGeometry args={[0.8, WALL_H * 0.86, 0.07]} />
          <meshStandardMaterial color={level.color} emissive={level.color} emissiveIntensity={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[0, WALL_H - 0.03, 0]}>
          <boxGeometry args={[1, 0.07, 0.16]} />
          <meshStandardMaterial color="#d6ab74" roughness={0.8} />
        </mesh>
        <GatePadlock />
      </group>
      <ExitMarks level={level} bus={bus} />
      {/* Entry: the same threshold, and a plain wooden fence that stays shut behind the ball. */}
      {entry && (
        <>
          <mesh position={[ex, GROUND_Y / 2, ez]} receiveShadow>
            <boxGeometry args={[1, -GROUND_Y, 1]} />
            <meshStandardMaterial color="#d6ab74" roughness={0.75} />
          </mesh>
          <group ref={entryGateRef} position={[ex + entryDc * GATE_OFFSET, 0, ez + entryDr * GATE_OFFSET]} rotation={[0, entryDc !== 0 ? Math.PI / 2 : 0, 0]}>
            {[-0.45, 0.45].map((x) => (
              <mesh key={x} position={[x, WALL_H / 2, 0]}>
                <boxGeometry args={[0.12, WALL_H, 0.14]} />
                <meshStandardMaterial color="#d6ab74" roughness={0.8} />
              </mesh>
            ))}
            <mesh position={[0, WALL_H * 0.5, 0]}>
              <boxGeometry args={[0.8, WALL_H * 0.86, 0.07]} />
              <meshStandardMaterial color={level.color} emissive={level.color} emissiveIntensity={0.45} roughness={0.45} />
            </mesh>
            <mesh position={[0, WALL_H - 0.03, 0]}>
              <boxGeometry args={[1, 0.07, 0.16]} />
              <meshStandardMaterial color="#d6ab74" roughness={0.8} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
