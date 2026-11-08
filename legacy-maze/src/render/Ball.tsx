import { useContext, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import type { SlideResult } from '../game/engine';
import { DELTA, OPPOSITE, type Cell, type Level } from '../game/types';
import type { SceneBus } from './bus';
import { BALL_R, cellX, cellZ } from './coords';
import { groundY } from './heights';
import { slideCenterline } from './slidePath';
import { RIDE_MAX_SPEED, planRide, type Ride } from './slideRide';
import { EXIT_SPEED as EXIT_PACE, HANDOFF_DISTANCE } from './exitPhysics';
import { arcHeading, arcPoint, rolledDistance, rollSpeed, START_SPEED, TURN_R } from './rolling';
import { slideThrill } from '../game/soundRules';
import type { ParticlePool } from '../core/render/ParticlePool';
import { BallBand, BallBody } from './skins';
import { BallShadow } from './BallShadow';
import { benchPhase } from '../core/render/bench';
import { RenderStyleContext } from './style';

// Rolling: see rolling.ts (a short ease-out acceleration, then a constant speed).
const PORTAL_SECONDS = 0.18;
/** Stagger (s) between the rings of tiles painted by a bomb blast. */
const BLAST_STAGGER = 0.07;

type Phase = 'roll' | 'suck' | 'appear' | 'chute' | 'end' | 'exit';
type EndKind = 'wall' | 'break' | 'stop' | 'soft';

type Anim = {
  res: SlideResult;
  phase: Phase;
  /** Index of the last step reached (-1 before the first one). */
  cur: number;
  x: number;
  z: number;
  /** Current rolling direction (world units, unit length). */
  dx: number;
  dz: number;
  speed: number;
  /** Time spent rolling since the swipe (s): the speed is a function of it, so the motion does not depend on the frame rate. */
  rollT: number;
  /** The legs (straight runs and bend arcs) towards the next tile, which one is being run and how far along it. */
  legs: Leg[] | null;
  legI: number;
  legS: number;
  t: number;
  fired: boolean[];
  endKind: EndKind;
  endFired: boolean;
  // exit fall
  exitDist: number;
  vy: number;
  y: number;
  /** The ride down a chute: the tabulated ride, the time spent on it, the distance already rolled. */
  ride: Ride | null;
  rideT: number;
  rideS: number;
  /** Height of the floor under the ball (for the sink into a portal), and the last height seen (a ball that comes down a ramp lands). */
  baseY: number;
  lastGround: number;
  /** Seconds since the ball landed from a ramp or a chute (the small bounce of the whole ball), or -1. */
  hopT: number;
  /** The tiles that collapse behind the ball in this slide, and the ones already announced. */
  collapsing: Set<number>;
  /** Time to the next little splash on the rims while the ball runs down a chute. */
  splashT: number;
};

type Leg =
  | { kind: 'line'; ax: number; az: number; hx: number; hz: number; len: number }
  | { kind: 'arc'; cx: number; cz: number; inX: number; inZ: number; outX: number; outZ: number; len: number };

type Props = {
  level: Level;
  /** Changes whenever the board is rebuilt (new level or restart): the ball goes back to its start tile. */
  resetKey: string;
  bus: SceneBus;
  particles: ParticlePool;
  envMap?: THREE.Texture | null;
};

/** Bounce of the whole ball when it lands (height in cells, time in seconds): no change of shape, only of position. */
const HOP_HEIGHT = 0.1;
const HOP_SECONDS = 0.24;
const AXIS = new THREE.Vector3();
const DELTA_Q = new THREE.Quaternion();
const SPIN_Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// The ball stops dead against a wall (no squash, no rebound): only a stop tile has a little hop.
const END_SECONDS = { wall: 0.06, break: 0.14, stop: 0.3, soft: 0.04 } as const;

/**
 * The ball (gold by default; the shop skins are in skins.tsx). Owns the whole slide animation: acceleration, true rolling (rotation follows
 * the distance travelled), turning at bends, being sucked into / coming out of portals,
 * progressive painting and splashes behind it, and how it ends (dead against a wall, a hop on a
 * stop tile, a fragile wall breaking, or rolling out through the exit and falling).
 * The ball is a perfect sphere at all times: nothing here ever changes its scale, and nothing shakes the camera or the walls. The
 * feel of an impact comes from the splash, the vibration and the sound.
 * It only plays back what the engine already decided (`SlideResult`).
 */
export function Ball({ level, resetKey, bus, particles, envMap }: Props) {
  const { ball: skin } = useContext(RenderStyleContext);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const anim = useRef<Anim | null>(null);

  const cx = (cell: Cell) => cellX(level, cell[1]);
  const cz = (cell: Cell) => cellZ(level, cell[0]);
  /** Height of the middle of the ball when it rolls at (x, z): on the floor, a platform, or the slope of a ramp. */
  const yAt = (x: number, z: number) => groundY(level, x, z) + BALL_R;

  useLayoutEffect(() => {
    anim.current = null;
    bus.rolling = false;
    bus.exiting = false;
    const x = cx(level.start);
    const z = cz(level.start);
    const g = group.current;
    if (g) {
      g.position.set(x, yAt(x, z), z);
      g.visible = true;
    }
    body.current?.quaternion.identity();
    bus.ballX = x;
    bus.ballZ = z;
    bus.ballY = yAt(x, z);
    bus.inChute = false;
    bus.emit('paint', { cell: level.start, coat: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, resetKey, bus]);

  /** True while the ball is still on the platform side of a ramp tile (the top half): the bounce is only for the bottom. */
  const isRampTop = (x: number, z: number) => groundY(level, x, z) > 0.25 * 1;

  // The level transition moves the ball itself: give it the objects.
  useLayoutEffect(() => {
    if (group.current && body.current) bus.ball = { group: group.current, body: body.current };
    return () => {
      bus.ball = null;
    };
  }, [bus]);

  /** Rolls the ball body by `len` cells along (dx, dz). */
  const rollBy = (len: number, dx: number, dz: number) => {
    const b = body.current;
    if (!b || len <= 0) return;
    AXIS.set(dz, 0, -dx);
    DELTA_Q.setFromAxisAngle(AXIS, len / BALL_R);
    b.quaternion.premultiply(DELTA_Q);
  };

  const finish = (exited: boolean) => {
    anim.current = null;
    bus.rolling = false;
    bus.onSlideDone?.(exited);
  };

  /** Everything that happens when the ball gets into the tile of step `i`. */
  const fireStep = (a: Anim, i: number) => {
    if (a.fired[i]) return;
    a.fired[i] = true;
    const s = a.res.steps[i];
    for (const p of s.painted) bus.emit('paint', p);
    // A collapsing tile trembles under the ball; the one the ball has just left (the step before) breaks.
    if (a.collapsing.size > 0) {
      const here = s.cell[0] * level.cols + s.cell[1];
      if (level.features.collapse?.some(([r, c]) => r === s.cell[0] && c === s.cell[1])) bus.emit('crumble', s.cell);
      const before = i === 0 ? a.res.from : a.res.steps[i - 1].cell;
      const key = before[0] * level.cols + before[1];
      if (key !== here && a.collapsing.delete(key)) bus.emit('collapse', before);
    }
    if (s.painted.length > 0 && !s.bomb) bus.onEvent?.('tile');
    if (s.coin) {
      bus.emit('coin', s.cell);
      bus.onEvent?.('coin');
    }
    if (a.res.exited && i === a.res.steps.length - 1) return; // leaving the board
    particles.elevation = groundY(level, cx(s.cell), cz(s.cell));
    particles.trail(cx(s.cell), cz(s.cell), s.dir);
    if (s.bomb) {
      const { center, painted } = s.bomb;
      bus.emit('bomb', center, painted);
      for (const p of painted) {
        const d = Math.max(Math.abs(p.cell[0] - center[0]), Math.abs(p.cell[1] - center[1]));
        bus.emit('paint', p, d * BLAST_STAGGER);
      }
      particles.elevation = groundY(level, cx(center), cz(center));
      particles.blast(cx(center), 0.3, cz(center));
      bus.onEvent?.('bomb');
    }
  };

  const beginEnd = (a: Anim) => {
    const r = a.res;
    a.phase = 'end';
    a.t = 0;
    a.endFired = false;
    a.endKind = r.reason === 'stop' ? 'stop' : r.reason === 'portal' ? 'soft' : r.broke ? 'break' : 'wall';
    // The ball stops on a tile it will leave: nothing breaks yet. Tiles it left earlier in this slide have all been announced by now.
    a.collapsing.clear();
    bus.rolling = false;
  };

  const arrive = (a: Anim, i: number) => {
    fireStep(a, i);
    a.cur = i;
    const next = a.res.steps[i + 1];
    if (!next) {
      if (a.res.exited) {
        a.phase = 'exit';
        benchPhase('ballExit');
        bus.exiting = true;
        a.exitDist = 0;
        a.vy = 0;
        a.y = BALL_R;
      } else beginEnd(a);
    } else if (next.teleport) {
      a.phase = 'suck';
      a.t = 0;
      a.baseY = yAt(cx(a.res.steps[i].cell), cz(a.res.steps[i].cell));
      bus.rolling = false;
      bus.emit('portal', a.res.steps[i].cell, 'in');
      bus.onEvent?.('teleport');
    } else if (next.slide >= 0) {
      // The ball is on the entry tile, travelling in the direction of the funnel: it goes up into the chute and rides it.
      const slide = level.features.slides[next.slide];
      a.ride = planRide(slideCenterline(level, slide));
      a.rideT = 0;
      a.rideS = 0;
      a.phase = 'chute';
      bus.rolling = false;
      bus.inChute = true;
      bus.chuteIndex = next.slide;
      bus.chuteU = 0;
      a.splashT = 0;
      bus.onEvent?.('chuteIn');
    }
  };

  /**
   * The legs from where the ball is to the centre of step `idx`: a straight run, and when the ball turns at that tile (a bend, or a
   * stop on a side branch) an arc of radius TURN_R through it, so the path is one continuous curve.
   */
  const makeLegs = (a: Anim, idx: number): Leg[] => {
    const steps = a.res.steps;
    const tx = cx(steps[idx].cell);
    const tz = cz(steps[idx].cell);
    const prev = idx === 0 ? a.res.from : steps[idx - 1].cell;
    let inX = tx - cx(prev);
    let inZ = tz - cz(prev);
    const inLen = Math.hypot(inX, inZ) || 1;
    inX /= inLen;
    inZ /= inLen;
    const next = steps[idx + 1];
    let outX = 0;
    let outZ = 0;
    let turns = false;
    if (next && !next.teleport && next.slide < 0) {
      outX = cx(next.cell) - tx;
      outZ = cz(next.cell) - tz;
      const outLen = Math.hypot(outX, outZ) || 1;
      outX /= outLen;
      outZ /= outLen;
      turns = Math.abs(inX * outX + inZ * outZ) < 0.5;
    }
    const legs: Leg[] = [];
    const endX = turns ? tx - inX * TURN_R : tx;
    const endZ = turns ? tz - inZ * TURN_R : tz;
    const lx = endX - a.x;
    const lz = endZ - a.z;
    const ll = Math.hypot(lx, lz);
    if (ll > 1e-6) legs.push({ kind: 'line', ax: a.x, az: a.z, hx: lx / ll, hz: lz / ll, len: ll });
    if (turns) {
      legs.push({ kind: 'arc', cx: tx - inX * TURN_R + outX * TURN_R, cz: tz - inZ * TURN_R + outZ * TURN_R, inX, inZ, outX, outZ, len: (Math.PI / 2) * TURN_R });
    }
    return legs;
  };

  useFrame((_, rawDt) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    // Time-based motion only: the real elapsed time, capped so one very long frame cannot throw the ball ahead.
    const dt = Math.min(rawDt, 1 / 20);

    if (!anim.current && bus.pending) {
      const res = bus.pending.result;
      bus.pending = null;
      const [dr, dc] = DELTA[res.lastDir];
      const a: Anim = {
        res,
        phase: 'roll',
        cur: -1,
        x: cx(res.from),
        z: cz(res.from),
        dx: dc,
        dz: dr,
        speed: START_SPEED,
        rollT: 0,
        legs: null,
        legI: 0,
        legS: 0,
        t: 0,
        fired: [],
        endKind: 'wall',
        endFired: false,
        exitDist: 0,
        vy: 0,
        y: BALL_R,
        ride: null,
        rideT: 0,
        rideS: 0,
        baseY: BALL_R,
        lastGround: groundY(level, cx(res.from), cz(res.from)),
        hopT: -1,
        collapsing: new Set(res.collapsed.map((c) => c[0] * level.cols + c[1])),
        splashT: 0,
      };
      anim.current = a;
      bus.rolling = true;
      if (res.steps.length === 0) beginEnd(a); // hit a fragile wall right next to the ball
    }
    const a = anim.current;
    if (!a) return;
    const res = a.res;

    if (a.phase === 'roll') {
      // The distance covered over this frame is the difference of two positions of the same curve: whatever the frame rate.
      let remaining = rolledDistance(a.rollT + dt) - rolledDistance(a.rollT);
      a.rollT += dt;
      a.speed = rollSpeed(a.rollT);
      while (remaining > 1e-6 && a.phase === 'roll') {
        if (!a.legs) {
          a.legs = makeLegs(a, a.cur + 1);
          a.legI = 0;
          a.legS = 0;
        }
        const leg = a.legs[a.legI];
        if (!leg) {
          a.legs = null;
          arrive(a, a.cur + 1);
          continue;
        }
        const adv = Math.min(leg.len - a.legS, remaining);
        const s0 = a.legS;
        a.legS += adv;
        remaining -= adv;
        let hx: number;
        let hz: number;
        if (leg.kind === 'line') {
          a.x = leg.ax + leg.hx * a.legS;
          a.z = leg.az + leg.hz * a.legS;
          hx = leg.hx;
          hz = leg.hz;
        } else {
          // Quarter circle: the angle goes with the distance, the heading turns from the way in to the way out.
          const pt = arcPoint(leg.cx, leg.cz, leg.inX, leg.inZ, leg.outX, leg.outZ, a.legS / leg.len);
          const h = arcHeading(leg.inX, leg.inZ, leg.outX, leg.outZ, (s0 + a.legS) / 2 / leg.len);
          a.x = pt.x;
          a.z = pt.z;
          hx = h.x;
          hz = h.z;
        }
        a.dx = hx;
        a.dz = hz;
        rollBy(adv, hx, hz);
        const target = res.steps[a.cur + 1];
        if (target && !a.fired[a.cur + 1] && Math.hypot(cx(target.cell) - a.x, cz(target.cell) - a.z) <= 0.5) fireStep(a, a.cur + 1);
        if (a.legS >= leg.len - 1e-9) {
          a.legI++;
          if (a.legI >= a.legs.length) {
            a.legs = null;
            arrive(a, a.cur + 1);
          } else a.legS = 0;
        }
      }
      // The ball follows the floor: a platform, a ramp. Coming down a ramp onto the low floor it lands with a small bounce.
      const ground = groundY(level, a.x, a.z);
      if (a.lastGround > 0.001 && ground <= 0.001 && a.speed > 8 && !isRampTop(a.x, a.z)) {
        a.hopT = 0;
        bus.onEvent?.('rampLand');
        particles.elevation = groundY(level, a.x, a.z);
        particles.impact(a.x, a.z, res.lastDir, 10);
      }
      a.lastGround = ground;
      const hop = a.hopT >= 0 ? HOP_HEIGHT * Math.sin(Math.min(1, a.hopT / HOP_SECONDS) * Math.PI) : 0;
      if (a.hopT >= 0) {
        a.hopT += dt;
        if (a.hopT >= HOP_SECONDS) a.hopT = -1;
      }
      g.position.set(a.x, ground + BALL_R + hop, a.z);
    } else if (a.phase === 'suck') {
      // Pulled into the portal: the ball sinks into the hole while spinning (its size never changes: it goes under the floor).
      a.t += dt;
      const k = Math.min(1, a.t / PORTAL_SECONDS);
      g.position.y = a.baseY - k * k * (BALL_R * 2.4);
      SPIN_Q.setFromAxisAngle(UP, 25 * dt);
      b.quaternion.premultiply(SPIN_Q);
      if (k >= 1) {
        const tp = res.steps[a.cur + 1];
        a.cur += 1;
        a.x = cx(tp.cell);
        a.z = cz(tp.cell);
        a.dx = DELTA[tp.dir][1];
        a.dz = DELTA[tp.dir][0];
        fireStep(a, a.cur);
        bus.emit('portal', tp.cell, 'out');
        a.baseY = yAt(a.x, a.z);
        g.position.set(a.x, a.baseY - BALL_R * 2.4, a.z);
        a.phase = 'appear';
        a.t = 0;
        a.legs = null;
      }
    } else if (a.phase === 'appear') {
      // It comes up out of the other portal, still the same sphere.
      a.t += dt;
      const k = Math.min(1, a.t / PORTAL_SECONDS);
      g.position.y = a.baseY - (1 - k) * (1 - k) * (BALL_R * 2.4);
      SPIN_Q.setFromAxisAngle(UP, -18 * dt * (1 - k));
      b.quaternion.premultiply(SPIN_Q);
      if (k >= 1) {
        g.position.y = a.baseY;
        if (a.cur + 1 < res.steps.length) {
          a.phase = 'roll';
          bus.rolling = true;
        } else beginEnd(a);
      }
    } else if (a.phase === 'chute') {
      // The ride is tabulated: the position is a lookup of the time, so it is the same at any frame rate. The ball rolls along the
      // tube, leans into the bends (it climbs the side of the trough a little: its shape never changes), and is faster going down.
      const ride = a.ride!;
      a.rideT += dt;
      const smp = ride.sample(a.rideT);
      const h = Math.hypot(smp.t[0], smp.t[2]) || 1;
      const hx = smp.t[0] / h;
      const hz = smp.t[2] / h;
      rollBy(Math.max(0, smp.s - a.rideS), hx, hz);
      a.rideS = smp.s;
      // The ball stays on the flat floor of the trough (a little to the outside in a bend, never into the rims or the arches).
      const side = Math.max(-0.04, Math.min(0.04, -smp.lean * 0.1));
      g.position.set(smp.p[0] + hz * side, smp.p[1], smp.p[2] - hx * side);
      bus.chuteU = smp.u;
      a.splashT -= dt;
      if (a.splashT <= 0 && smp.u > 0.12 && smp.u < 0.92) {
        // A few droplets of paint thrown on the rims: few, and only now and then (the pool is shared with everything else).
        a.splashT = 0.2;
        particles.elevation = smp.p[1] - BALL_R;
        particles.impact(g.position.x + hz * side * 6, g.position.z - hx * side * 6, res.steps[a.cur].dir, 3);
      }
      a.x = smp.p[0];
      a.z = smp.p[2];
      a.dx = hx;
      a.dz = hz;
      bus.onEvent?.('chuteRide', Math.min(1, smp.speed / RIDE_MAX_SPEED));
      if (a.rideT >= ride.duration) {
        // It comes out onto the exit tile: a little plop, a small splash of paint, and it goes on in the direction of the end of the chute.
        a.cur += 1;
        const land = res.steps[a.cur];
        a.ride = null;
        bus.inChute = false;
        bus.chuteIndex = -1;
        a.x = cx(land.cell);
        a.z = cz(land.cell);
        a.dx = DELTA[land.dir][1];
        a.dz = DELTA[land.dir][0];
        a.baseY = yAt(a.x, a.z);
        a.lastGround = groundY(level, a.x, a.z);
        a.legs = null;
        a.rollT = 0.05;
        a.hopT = 0;
        g.position.set(a.x, a.baseY, a.z);
        fireStep(a, a.cur);
        particles.elevation = groundY(level, a.x, a.z);
        particles.impact(a.x, a.z, land.dir, 16);
        bus.onEvent?.('chuteOut', Math.min(1, smp.speed / RIDE_MAX_SPEED));
        if (a.cur + 1 < res.steps.length) {
          a.phase = 'roll';
          bus.rolling = true;
        } else beginEnd(a);
      }
    } else if (a.phase === 'end') {
      const kind = a.endKind;
      const [dr, dc] = DELTA[res.lastDir];
      const endX = cx(res.end);
      const endZ = cz(res.end);
      if (!a.endFired) {
        a.endFired = true;
        if (kind === 'wall') {
          // The longer the slide, the bigger the splash and the harder the hit.
          const cells = res.steps.length;
          // The ball arrives on the exit tile of a chute travelling toward it: it stops against the flap, which shudders.
          const flap = level.features.slides.findIndex((sl) => sl.exit[0] === res.end[0] && sl.exit[1] === res.end[1] && OPPOSITE[sl.exitDir] === res.lastDir);
          particles.elevation = groundY(level, endX, endZ);
          if (flap >= 0) {
            particles.impact(endX + dc * BALL_R, endZ + dr * BALL_R, res.lastDir, 5);
            bus.emit('flapHit', flap);
            bus.onEvent?.('flapHit', cells);
          } else {
            particles.impact(endX + dc * BALL_R, endZ + dr * BALL_R, res.lastDir, 22 + 12 * slideThrill(cells));
            bus.onEvent?.('impact', cells);
          }
        } else if (kind === 'break' && res.broke) {
          particles.elevation = groundY(level, endX, endZ);
          particles.impact(endX + dc * BALL_R, endZ + dr * BALL_R, res.lastDir, 12);
          particles.debris(cx(res.broke), cz(res.broke));
          bus.emit('breakWall', res.broke);
          bus.onEvent?.('break');
        } else if (kind === 'stop') {
          particles.elevation = groundY(level, endX, endZ);
          particles.impact(endX, endZ, res.lastDir, 8 + 8 * slideThrill(res.steps.length));
          bus.onEvent?.('stop', res.steps.length);
        }
      }
      a.t += dt;
      const t = a.t;
      // Dead stop on the tile (no squash, no rebound); only a stop tile has a small hop, a movement of the ball and not of its shape.
      const hop = kind === 'stop' ? 0.16 * Math.sin(Math.min(1, t / 0.3) * Math.PI) : 0;
      // Just landed from a chute or a ramp: the small bounce of the whole ball goes on while it comes to rest.
      const land = a.hopT >= 0 ? HOP_HEIGHT * Math.sin(Math.min(1, a.hopT / HOP_SECONDS) * Math.PI) : 0;
      if (a.hopT >= 0) a.hopT += dt;
      const floorY = yAt(endX, endZ);
      g.position.set(endX, floorY + hop + land, endZ);
      bus.ballX = endX;
      bus.ballZ = endZ;
      bus.ballY = g.position.y;
      if (t >= END_SECONDS[kind] && (a.hopT < 0 || a.hopT >= HOP_SECONDS)) {
        g.position.set(endX, floorY, endZ);
        finish(false);
      }
      return;
    } else if (a.phase === 'exit') {
      // Rolls out through the opening at a steady pace; just past the middle of the exit tile the crossing takes over.
      // The same speed curve goes on, up to the pace of the crossing.
      a.rollT += dt;
      a.speed = Math.min(rollSpeed(a.rollT), EXIT_PACE);
      const len = a.speed * dt;
      rollBy(len, a.dx, a.dz);
      a.x += a.dx * len;
      a.z += a.dz * len;
      a.exitDist += len;
      g.position.set(a.x, BALL_R, a.z);
      if (a.exitDist > HANDOFF_DISTANCE) {
        bus.exitFall = { x: a.x, y: BALL_R, z: a.z, vx: a.dx * a.speed, vz: a.dz * a.speed, coasted: 0 };
        finish(true);
        return;
      }
    }
    bus.ballX = g.position.x;
    bus.ballZ = g.position.z;
    bus.ballY = g.position.y;
  });

  return (
    <>
      <group ref={group} position={[cellX(level, level.start[1]), BALL_R, cellZ(level, level.start[0])]}>
        <mesh ref={body} castShadow>
          <BallBody skin={skin} envMap={envMap} />
          <BallBand skin={skin} />
        </mesh>
      </group>
      <BallShadow level={level} bus={bus} group={group} />
    </>
  );
}
