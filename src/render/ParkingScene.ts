import * as THREE from 'three';

import { createRng } from '../core/rng';
import { DELTA } from '../core/grid';
import type { TapResult } from '../game/engine';
import { isHorizontal, travelDir, vehicleCells, type Level } from '../game/types';
import { cellX, cellZ } from './coords';
import { VEHICLE_PALETTE } from './palette';
import { ACCEL, TOP_SPEED, buildRoute, sampleRoute, yawOf, type Pose, type Route } from './paths';

/**
 * Everything that moves in the parking, kept out of React: the scene reads these numbers every frame and nothing is allocated while
 * the game runs. The actors, their routes (the curves a vehicle follows to the road of exit), the trail, the puffs and the emojis are
 * all made once, when the level is prepared.
 */
export type SceneEvent = 'exit' | 'bump' | 'horn' | 'gateOpen';

enum Mode {
  Idle,
  Press,
  Exit,
  Bump,
}

export type Actor = {
  id: number;
  len: 2 | 3;
  horizontal: boolean;
  /** Where it parks (centre of its cells) and which way its front points. */
  baseX: number;
  baseZ: number;
  baseYaw: number;
  /** Heading unit vector of its front. */
  fx: number;
  fz: number;
  /** Direction of the move in progress (a bump) and whether the exit is a reverse. */
  mx: number;
  mz: number;
  reverse: boolean;
  /** Shown pose. */
  x: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  /** How much the suspension is pressed down at a tap (0..1) and the angle of the front wheels and how far the wheels have turned. */
  squash: number;
  steer: number;
  spin: number;
  hidden: boolean;
  /** True from the tap that sends it out: it no longer takes a touch. */
  leaving: boolean;
  /** The order of the taps that sent vehicles out: an earlier one has the road first. */
  order: number;
  busy: boolean;
  mode: Mode;
  /** The move that starts when the tap has been felt. */
  next: Mode;
  t: number;
  /** The way out, worked out with the level, and where the vehicle is on it. */
  route: Route;
  routeIndex: number;
  distance: number;
  speed: number;
  /** Heading unit vector of the travel at this moment (for the spacing between vehicles). */
  hx: number;
  hz: number;
  lastYaw: number;
  /** Exit: the distance up to which the trail has been laid. */
  laid: number;
  /** Bump: distance driven before the hit, the thing hit and when. */
  reach: number;
  hitDir: number;
  other: number;
  /** Vehicle colour (linear) and the colour of its trail. */
  color: THREE.Color;
  trail: THREE.Color;
};

/** Spacing of the paint marks laid along the way, and how many fit (the paint of a whole level). */
export const TRAIL_STEP = 0.4;
export const TRAIL_CAPACITY = 1800;
/** Only this much of the way is painted: the rest is off screen. */
const TRAIL_RANGE = 14;

export const PUFFS = 14;
export const EMOJIS = 4;

export type Puff = { active: boolean; x: number; z: number; t: number };
export type Emoji = { active: boolean; x: number; z: number; t: number };

/** The suspension sinks for this long at a tap, before the vehicle moves (the answer to the finger comes at once). */
export const PRESS_S = 0.08;
const BUMP_GAP = 0.1;
const IMPACT_S = 0.24;
const HOLD_S = 0.3;
const RETURN_S = 0.42;
const SHINE_S = 1.5;
/** Vehicles on the road keep a gap: a vehicle slows down behind another one that is ahead of it. */
const GAP_EXTRA = 0.25;
/** The wheels of the vehicles are this big. */


/** The wheels of the vehicles are this big (see vehicleGeometry.WHEEL_R). */
const WHEEL_R = 0.13;

/** Braking, in places per second per second. */
const BRAKE = ACCEL * 2.5;

const pose: Pose = { x: 0, z: 0, yaw: 0, hx: 0, hz: 0 };
const posePast: Pose = { x: 0, z: 0, yaw: 0, hx: 0, hz: 0 };
const poseAhead: Pose = { x: 0, z: 0, yaw: 0, hx: 0, hz: 0 };

/** How far a vehicle goes in `t` seconds when it brakes from the speed `s0` down to `v` (and then keeps `v`), or keeps `v` if it is slower. */
const brakeDistance = (s0: number, v: number, t: number): number => {
  if (s0 <= v) return v * t;
  const tb = (s0 - v) / BRAKE;
  return t < tb ? s0 * t - 0.5 * BRAKE * t * t : s0 * tb - 0.5 * BRAKE * tb * tb + v * (t - tb);
};

/** How far a vehicle that already has the speed `v0` goes in `t` seconds, accelerating to the top speed. */
const withSpeed = (v0: number, t: number): number => {
  const tt = Math.max(0, (TOP_SPEED - v0) / ACCEL);
  return t <= tt ? v0 * t + 0.5 * ACCEL * t * t : v0 * tt + 0.5 * ACCEL * tt * tt + TOP_SPEED * (t - tt);
};

/** How far a vehicle that sets off from rest has gone after `t` seconds. */
const fromRest = (t: number): number => {
  const tTop = TOP_SPEED / ACCEL;
  return t <= tTop ? 0.5 * ACCEL * t * t : 0.5 * ACCEL * tTop * tTop + TOP_SPEED * (t - tTop);
};

let sceneCount = 0;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The distance the centres of two vehicles on the road must keep. */
export const roadGap = (a: { len: number }, b: { len: number }): number => (a.len + b.len) * 0.45 + GAP_EXTRA;

export class ParkingScene {
  /** Tells two scenes of the same level apart (a restart builds a new one). */
  readonly uid = ++sceneCount;
  readonly level: Level;
  readonly actors: Actor[];
  /** The paint on the ground: x, z, yaw and colour of each mark. */
  readonly trailX = new Float32Array(TRAIL_CAPACITY);
  readonly trailZ = new Float32Array(TRAIL_CAPACITY);
  readonly trailYaw = new Float32Array(TRAIL_CAPACITY);
  readonly trailColor = new Float32Array(TRAIL_CAPACITY * 3);
  trailCount = 0;
  /** Bumped whenever the trail changed, so the mesh knows to copy it. */
  trailVersion = 0;
  readonly puffs: Puff[] = Array.from({ length: PUFFS }, () => ({ active: false, x: 0, z: 0, t: 0 }));
  readonly emojis: Emoji[] = Array.from({ length: EMOJIS }, () => ({ active: false, x: 0, z: 0, t: 0 }));
  /** How many vehicles have left (the barriers read it). */
  exited = 0;
  /** The vehicle that wears the crown (the one the equipped skin is for). */
  player = -1;
  /** Seconds since the shine over the paint began, or -1. */
  shine = -1;
  /** A halo round a vehicle: the hint, the help of the first levels, or the vehicle a touch has just selected (tester mode). */
  hint: { vehicle: number } | null = null;
  /** Seconds left before a flash of the halo ends (0 = no flash). */
  private flashLeft = 0;
  onEvent: ((event: SceneEvent) => void) | null = null;

  private taps = 0;
  private puffNext = 0;
  private emojiNext = 0;

  constructor(level: Level, trailOverride?: { vehicle: number; color: string } | null) {
    this.level = level;
    // The vehicle that wears the crown (and the equipped skin) is drawn from the level alone: the same one on a restart.
    this.player = level.vehicles.length > 0 ? createRng(level.seed).int(0, level.vehicles.length - 1) : -1;
    this.actors = level.vehicles.map((v) => {
      const cells = vehicleCells(v);
      const [r0, c0] = cells[0];
      const [r1, c1] = cells[cells.length - 1];
      const [dr, dc] = DELTA[v.dir];
      const x = (cellX(level, c0) + cellX(level, c1)) / 2;
      const z = (cellZ(level, r0) + cellZ(level, r1)) / 2;
      const color = new THREE.Color(VEHICLE_PALETTE[v.color % VEHICLE_PALETTE.length]);
      return {
        id: v.id,
        len: v.len,
        horizontal: isHorizontal(v),
        baseX: x,
        baseZ: z,
        baseYaw: yawOf(dc, dr),
        fx: dc,
        fz: dr,
        mx: 0,
        mz: 0,
        // A vehicle whose arrow points to its rear reverses out: it never turns round.
        reverse: !!v.back,
        x,
        z,
        yaw: yawOf(dc, dr),
        roll: 0,
        pitch: 0,
        squash: 0,
        steer: 0,
        spin: 0,
        hidden: false,
        leaving: false,
        order: 0,
        busy: false,
        mode: Mode.Idle,
        next: Mode.Idle,
        t: 0,
        // The way out is computed now, with the level: nothing is computed when the vehicle is tapped.
        route: buildRoute(level, x, z, travelDir(v)),
        routeIndex: 0,
        distance: 0,
        speed: 0,
        hx: 0,
        hz: 0,
        lastYaw: 0,
        laid: 0,
        reach: 0,
        hitDir: 0,
        other: -1,
        color,
        trail: color.clone(),
      };
    });
    if (trailOverride) this.setTrailColor(trailOverride.vehicle, trailOverride.color);
  }

  /** The vehicle that wears the crown leaves a trail of the equipped paint colour. */
  setTrailColor(vehicle: number, hex: string) {
    this.player = vehicle;
    this.actors[vehicle]?.trail.set(hex);
  }

  isBusy(vehicle: number): boolean {
    return this.actors[vehicle]?.busy ?? false;
  }

  /** Shows the halo round a vehicle for a moment (the tester mode flashes the vehicle a touch selected). */
  flash(vehicle: number, seconds: number) {
    this.hint = { vehicle };
    this.flashLeft = seconds;
  }

  /** True while anything is moving or shining: the scene only has to update its meshes then. */
  get active(): boolean {
    if (this.shine >= 0) return true;
    for (let i = 0; i < this.actors.length; i++) if (this.actors[i].busy || this.actors[i].squash > 0.001) return true;
    for (let i = 0; i < this.puffs.length; i++) if (this.puffs[i].active) return true;
    for (let i = 0; i < this.emojis.length; i++) if (this.emojis[i].active) return true;
    return this.flashLeft > 0;
  }

  /**
   * Starts the answer to a tap the rules have just settled. The vehicle presses down at once (the next frame shows it), then
   * either drives out along its route or goes up to what is in the way and comes back.
   */
  play(result: TapResult) {
    if (result.kind === 'ignored') return;
    const a = this.actors[result.vehicle];
    if (!a || a.busy) return;
    a.busy = true;
    a.mode = Mode.Press;
    a.t = 0;
    if (result.kind === 'exit') {
      this.exited++;
      a.leaving = true;
      a.order = ++this.taps;
      a.next = Mode.Exit;
      a.laid = 0;
      a.distance = 0;
      a.speed = 0;
      a.routeIndex = 0;
      a.yaw = a.baseYaw;
      this.onEvent?.('exit');
    } else {
      const [dr, dc] = DELTA[result.dir];
      a.next = Mode.Bump;
      a.reach = result.steps + BUMP_GAP;
      a.hitDir = result.dir === 'R' ? 0 : result.dir === 'L' ? 1 : result.dir === 'D' ? 2 : 3;
      a.mx = dc;
      a.mz = dr;
      a.other = result.blocker.type === 'vehicle' ? result.blocker.id : -1;
    }
  }

  private puff(x: number, z: number) {
    const p = this.puffs[this.puffNext++ % PUFFS];
    p.active = true;
    p.x = x;
    p.z = z;
    p.t = 0;
  }

  private showEmoji(x: number, z: number) {
    const e = this.emojis[this.emojiNext++ % EMOJIS];
    e.active = true;
    e.x = x;
    e.z = z;
    e.t = 0;
  }

  private lay(a: Actor, x: number, z: number, yaw: number) {
    if (this.trailCount >= TRAIL_CAPACITY) return;
    const i = this.trailCount++;
    this.trailX[i] = x;
    this.trailZ[i] = z;
    this.trailYaw[i] = yaw;
    this.trailColor[i * 3] = a.trail.r;
    this.trailColor[i * 3 + 1] = a.trail.g;
    this.trailColor[i * 3 + 2] = a.trail.b;
    this.trailVersion++;
  }

  /** The level is empty: a wave of shine runs over the paint. */
  startShine() {
    this.shine = 0;
  }

  /** The brightness (0..1) of mark `i` at this moment of the shine. */
  shineAt(i: number): number {
    if (this.shine < 0 || this.trailCount === 0) return 0;
    const front = (this.shine / SHINE_S) * 1.5;
    const d = Math.abs(front - i / this.trailCount - 0.1);
    return Math.max(0, 1 - d * 5);
  }

  update(dtRaw: number) {
    const dt = Math.min(dtRaw, 0.05);
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      // The suspension comes back up by itself.
      if (a.mode !== Mode.Press && a.squash > 0) a.squash = Math.max(0, a.squash - dt * 7);
      switch (a.mode) {
        case Mode.Press:
          this.updatePress(a, dt);
          break;
        case Mode.Exit:
          this.updateExit(a, dt);
          break;
        case Mode.Bump:
          this.updateBump(a, dt);
          break;
        default:
          break;
      }
    }
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!p.active) continue;
      p.t += dt;
      if (p.t > 0.7) p.active = false;
    }
    for (let i = 0; i < this.emojis.length; i++) {
      const e = this.emojis[i];
      if (!e.active) continue;
      e.t += dt;
      if (e.t > 1.0) e.active = false;
    }
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) {
        this.flashLeft = 0;
        this.hint = null;
      }
    }
    if (this.shine >= 0) {
      this.shine += dt;
      this.trailVersion++;
      if (this.shine > SHINE_S) {
        this.shine = -1;
        this.trailVersion++;
      }
    }
  }

  /** The first instants of a tap: the vehicle sinks on its suspension. Nothing moves yet. */
  private updatePress(a: Actor, dt: number) {
    a.t += dt;
    a.squash = clamp(a.t / PRESS_S, 0, 1);
    if (a.t < PRESS_S) return;
    // A vehicle that would run into one that was sent out before it waits (pressed down, engine running) until the way is clear.
    if (a.next === Mode.Exit && this.wouldCollide(a)) return;
    a.mode = a.next;
    a.t = 0;
    if (a.mode === Mode.Exit) {
      // A little smoke at the back as it sets off.
      const [dr, dc] = a.reverse ? [-a.fz, -a.fx] : [a.fz, a.fx];
      this.puff(a.x - dc * (a.len * 0.45), a.z - dr * (a.len * 0.45));
      a.lastYaw = a.baseYaw;
    }
  }

  private updateExit(a: Actor, dt: number) {
    a.t += dt;
    const route = a.route;
    // Slow down behind a vehicle that is ahead on the road, and keep the gap.
    let follow = TOP_SPEED;
    for (let i = 0; i < this.actors.length; i++) {
      const o = this.actors[i];
      if (o === a || o.mode !== Mode.Exit || o.hidden) continue;
      // Only a vehicle that goes the same way and is in front of this one makes it slow down (the junction and the start of an exit have
      // their own rules): vehicles that meet head on or across would otherwise wait for each other for ever.
      if (a.hx * o.hx + a.hz * o.hz <= 0.5) continue;
      const dx = o.x - a.x;
      const dz = o.z - a.z;
      const ahead = dx * a.hx + dz * a.hz;
      if (ahead <= 0) continue;
      const dist = Math.hypot(dx, dz);
      if (Math.abs(dx * a.hz - dz * a.hx) > 0.9) continue;
      const need = roadGap(a, o);
      // The speed from which it can still stop behind the one in front: that one's speed plus what the room left allows.
      follow = Math.min(follow, o.speed + Math.sqrt(Math.max(0, 2 * BRAKE * 0.5 * (dist - need))));
      // Too close already (it came in on the road in front of this one): go slower than it, until the room is back.
      if (dist < need) follow = Math.min(follow, o.speed * clamp((dist - need * 0.35) / (need * 0.65), 0, 1));
    }
    // Where its way crosses or meets the way of a vehicle that was sent out before it, it gives way.
    const target = this.givingWay(a, follow);
    a.speed = a.speed < target ? Math.min(target, a.speed + ACCEL * dt) : Math.max(target, a.speed - BRAKE * dt);
    a.distance = Math.min(route.length, a.distance + a.speed * dt);
    a.routeIndex = sampleRoute(route, a.distance, pose, a.routeIndex);
    a.x = pose.x;
    a.z = pose.z;
    a.hx = pose.hx;
    a.hz = pose.hz;
    // The vehicle faces where it goes, or the opposite when it reverses: it does not turn round. The arrow of its roof follows.
    a.yaw = pose.yaw + (a.reverse ? Math.PI : 0);
    // The front wheels turn into the bend: the change of heading over the distance driven.
    let dyaw = pose.yaw - a.lastYaw;
    if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const driven = a.speed * dt;
    const wanted = driven > 1e-5 ? clamp(Math.atan(((dyaw / driven) * 0.9) * (a.reverse ? -1 : 1)), -0.6, 0.6) : 0;
    a.steer += (wanted - a.steer) * Math.min(1, dt * 14);
    a.lastYaw = pose.yaw;
    a.spin += (a.reverse ? -driven : driven) / WHEEL_R;
    // The nose lifts a little as it pulls away.
    a.pitch = -0.05 * Math.min(1, a.t * 4) * Math.max(0, 1 - a.t / 0.9);
    while (a.laid + TRAIL_STEP <= Math.min(a.distance, Math.min(route.length, TRAIL_RANGE))) {
      a.laid += TRAIL_STEP;
      sampleRoute(route, a.laid, pose, Math.max(0, a.routeIndex - 8));
      this.lay(a, pose.x, pose.z, pose.yaw);
    }
    if (a.distance >= route.length - 1e-4) {
      a.hidden = true;
      a.busy = false;
      a.mode = Mode.Idle;
      a.speed = 0;
      if (this.exited >= this.level.vehicles.length && !this.anyLeaving()) this.startShine();
    }
  }

  /**
   * The speed this vehicle may have, at most `wanted`, so that it never comes within the gap of a vehicle sent out before it whose way
   * crosses or meets its own (head on, across, or merging): the youngest always gives way, so no two ever wait for each other. The two
   * are followed along their routes for the next half second, the older one at the speed it has.
   */
  private givingWay(a: Actor, wanted: number): number {
    for (let c = 0; c < 4; c++) {
      const v = wanted * (c === 0 ? 1 : c === 1 ? 0.6 : c === 2 ? 0.3 : 0);
      if (v <= 0.01) return 0;
      let clear = true;
      for (let i = 0; i < this.actors.length && clear; i++) {
        const o = this.actors[i];
        if (o === a || !o.leaving || o.hidden || o.mode !== Mode.Exit || o.order >= a.order) continue;
        // Same way: the one behind slows down by itself (above), whatever their ages.
        if (a.hx * o.hx + a.hz * o.hz > 0.5) continue;
        const need = roadGap(a, o) * 1.0;
        for (let k = 1; k <= 10; k++) {
          const t = k * 0.1;
          sampleRoute(a.route, Math.min(a.route.length, a.distance + brakeDistance(a.speed, v, t)), posePast, a.routeIndex);
          sampleRoute(o.route, Math.min(o.route.length, o.distance + o.speed * t), poseAhead, o.routeIndex);
          if (Math.hypot(posePast.x - poseAhead.x, posePast.z - poseAhead.z) < need) {
            clear = false;
            break;
          }
        }
      }
      if (clear) return v;
    }
    return 0;
  }

  /**
   * Would this vehicle, setting off now, come within the gap of a vehicle that left before it? Both are followed along their routes for
   * the next second and a half or so: the one that left first goes on at the speed it has, this one sets off from rest.
   */
  private wouldCollide(a: Actor): boolean {
    for (let i = 0; i < this.actors.length; i++) {
      const o = this.actors[i];
      if (o === a || !o.leaving || o.hidden || o.order >= a.order) continue;
      const need = roadGap(a, o) * 1.0;
      for (let k = 1; k <= 20; k++) {
        const t = k * 0.08;
        const da = Math.min(a.route.length, fromRest(t));
        // The other vehicle: still in its press, it sets off like this one; on its way, it keeps its speed.
        const moving = o.mode === Mode.Exit;
        const dOther = Math.min(o.route.length, moving ? o.distance + withSpeed(o.speed, t) : fromRest(Math.max(0, t - Math.max(0, PRESS_S - o.t))));
        if (dOther >= o.route.length - 0.05) continue;
        sampleRoute(a.route, da, posePast, 0);
        sampleRoute(o.route, dOther, poseAhead, moving ? o.routeIndex : 0);
        if (Math.hypot(posePast.x - poseAhead.x, posePast.z - poseAhead.z) < need) return true;
      }
    }
    return false;
  }

  private anyLeaving(): boolean {
    for (let i = 0; i < this.actors.length; i++) if (this.actors[i].mode === Mode.Exit || this.actors[i].mode === Mode.Press) return true;
    return false;
  }

  private updateBump(a: Actor, dt: number) {
    a.t += dt;
    const tGo = Math.max(0.14, Math.sqrt((2 * a.reach) / 14));
    const tHit = tGo + IMPACT_S;
    const tHold = tHit + HOLD_S;
    const tEnd = tHold + RETURN_S;
    let offset: number;
    let decay = 0;
    if (a.t < tGo) {
      const k = a.t / tGo;
      offset = a.reach * k * k;
    } else if (a.t < tHit) {
      if (a.t - dt < tGo) this.hit(a);
      const k = (a.t - tGo) / IMPACT_S;
      decay = 1 - k;
      offset = a.reach - 0.1 * Math.sin(Math.min(1, k * 2) * Math.PI) * decay;
    } else if (a.t < tHold) {
      offset = a.reach;
    } else if (a.t < tEnd) {
      const k = (a.t - tHold) / RETURN_S;
      const e = k * k * (3 - 2 * k);
      offset = a.reach * (1 - e);
    } else {
      offset = 0;
    }
    a.x = a.baseX + a.mx * offset;
    a.z = a.baseZ + a.mz * offset;
    a.yaw = a.baseYaw;
    // Nose-down and a tremble while the hit rings out.
    a.pitch = 0.1 * decay;
    a.roll = Math.sin(a.t * 70) * 0.05 * decay;
    // The wheels turn while it drives (and the other way as it backs).
    const moving = a.t < tGo ? 1 : a.t >= tHold ? -1 : 0;
    a.spin += (moving * 6 * dt) / WHEEL_R;
    if (a.other >= 0) this.rattle(this.actors[a.other], decay, a);
    if (a.t >= tEnd) {
      a.mode = Mode.Idle;
      a.busy = false;
      a.x = a.baseX;
      a.z = a.baseZ;
      a.pitch = 0;
      a.roll = 0;
      if (a.other >= 0) {
        const o = this.actors[a.other];
        if (o.mode === Mode.Idle) {
          o.roll = 0;
          o.pitch = 0;
          o.x = o.baseX;
          o.z = o.baseZ;
        }
      }
    }
  }

  /** The vehicle that was hit shakes and gives a little. */
  private rattle(o: Actor, decay: number, by: Actor) {
    if (!o || o.mode !== Mode.Idle || o.hidden) return;
    o.roll = Math.sin(by.t * 80) * 0.06 * decay;
    o.pitch = 0.03 * decay;
    o.x = o.baseX + by.mx * 0.06 * decay;
    o.z = o.baseZ + by.mz * 0.06 * decay;
  }

  private hit(a: Actor) {
    this.onEvent?.('bump');
    this.onEvent?.('horn');
    // The emoji floats above the driver, a little behind the middle of the vehicle.
    this.showEmoji(a.x, a.z);
  }
}
