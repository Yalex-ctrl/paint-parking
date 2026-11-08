import * as THREE from 'three';

import { DELTA, type Dir } from '../core/grid';
import type { GestureResult } from '../game/engine';
import { isHorizontal, vehicleCells, vehicleDirs, type Level } from '../game/types';
import { cellX, cellZ } from './coords';
import { ACCEL, distanceAt, exitPath, samplePath, yawOf, type ExitPath, type Pose } from './paths';
import { VEHICLE_PALETTE } from './palette';
import { createRng } from '../core/rng';

/**
 * Everything that moves in the parking, kept out of React: the scene reads these numbers every frame and nothing is allocated while
 * the game runs (the actors, the trail, the puffs and the emojis are made once per level and reused).
 */
export type SceneEvent = 'exit' | 'bump' | 'horn' | 'shake' | 'gateOpen';

enum Mode {
  Idle,
  Exit,
  Bump,
  Shake,
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
  hidden: boolean;
  busy: boolean;
  mode: Mode;
  t: number;
  path: ExitPath | null;
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
const TRAIL_RANGE = 9;

export const PUFFS = 14;
export const EMOJIS = 4;

export type Puff = { active: boolean; x: number; z: number; t: number };
export type Emoji = { active: boolean; x: number; z: number; t: number };

const BUMP_GAP = 0.1;
const IMPACT_S = 0.24;
const HOLD_S = 0.3;
const RETURN_S = 0.42;
const SHAKE_S = 0.32;
const SHINE_S = 1.5;

const pose: Pose = { x: 0, z: 0, yaw: 0 };

let sceneCount = 0;

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
  /** A hint to show: the vehicle and the way it should go. */
  hint: { vehicle: number; dir: Dir } | null = null;
  onEvent: ((event: SceneEvent) => void) | null = null;

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
        reverse: false,
        x,
        z,
        yaw: yawOf(dc, dr),
        roll: 0,
        pitch: 0,
        hidden: false,
        busy: false,
        mode: Mode.Idle,
        t: 0,
        path: null,
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

  /** True while anything is moving or shining: the scene only has to update its meshes then. */
  get active(): boolean {
    if (this.shine >= 0) return true;
    for (let i = 0; i < this.actors.length; i++) if (this.actors[i].busy) return true;
    for (let i = 0; i < this.puffs.length; i++) if (this.puffs[i].active) return true;
    for (let i = 0; i < this.emojis.length; i++) if (this.emojis[i].active) return true;
    return false;
  }

  /** Starts the animation of a gesture the rules have just settled. */
  play(result: GestureResult) {
    if (result.kind === 'ignored') {
      if (result.reason === 'offAxis') this.offAxis(this.lastTouched);
      return;
    }
    const a = this.actors[result.vehicle];
    if (!a || a.busy) return;
    if (result.kind === 'exit') {
      this.exited++;
      a.mode = Mode.Exit;
      a.busy = true;
      a.t = 0;
      a.laid = 0;
      const [dr, dc] = DELTA[result.dir];
      a.path = exitPath(this.level, a.x, a.z, result.dir);
      // Driving against its front, the vehicle reverses out: it does not turn round.
      a.reverse = dc * a.fx + dr * a.fz < 0;
      a.yaw = a.baseYaw;
      this.puff(a.x - dc * (a.len / 2), a.z - dr * (a.len / 2));
      this.onEvent?.('exit');
    } else {
      a.mode = Mode.Bump;
      a.busy = true;
      a.t = 0;
      const [dr, dc] = DELTA[result.dir];
      a.reach = result.steps + BUMP_GAP;
      a.hitDir = result.dir === 'R' ? 0 : result.dir === 'L' ? 1 : result.dir === 'D' ? 2 : 3;
      a.mx = dc;
      a.mz = dr;
      a.other = result.blocker.type === 'vehicle' ? result.blocker.id : -1;
    }
  }

  /** Remembered so a gesture along the wrong axis can shake the vehicle that was touched. */
  lastTouched = -1;

  offAxis(vehicle: number) {
    const a = this.actors[vehicle];
    if (!a || a.busy) return;
    a.mode = Mode.Shake;
    a.busy = true;
    a.t = 0;
    this.onEvent?.('shake');
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
      switch (a.mode) {
        case Mode.Exit:
          this.updateExit(a, dt);
          break;
        case Mode.Bump:
          this.updateBump(a, dt);
          break;
        case Mode.Shake:
          this.updateShake(a, dt);
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
    if (this.shine >= 0) {
      this.shine += dt;
      this.trailVersion++;
      if (this.shine > SHINE_S) {
        this.shine = -1;
        this.trailVersion++;
      }
    }
  }

  private updateExit(a: Actor, dt: number) {
    a.t += dt;
    const path = a.path!;
    const d = Math.min(distanceAt(a.t), path.total);
    samplePath(path, d, pose);
    a.x = pose.x;
    a.z = pose.z;
    a.yaw = pose.yaw + (a.reverse ? Math.PI : 0);
    // The nose lifts a little as it pulls away.
    a.pitch = -0.05 * Math.min(1, a.t * 3) * Math.max(0, 1 - a.t / 1.2);
    const range = Math.min(path.total, path.len1 + path.arcLen + TRAIL_RANGE);
    while (a.laid + TRAIL_STEP <= Math.min(d, range)) {
      a.laid += TRAIL_STEP;
      samplePath(path, a.laid, pose);
      this.lay(a, pose.x, pose.z, pose.yaw);
    }
    if (d >= path.total) {
      a.hidden = true;
      a.busy = false;
      a.mode = Mode.Idle;
      if (this.exited >= this.level.vehicles.length) this.startShine();
    }
  }

  private updateBump(a: Actor, dt: number) {
    a.t += dt;
    const tGo = Math.max(0.14, Math.sqrt((2 * a.reach) / (ACCEL * 2)));
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

  private updateShake(a: Actor, dt: number) {
    a.t += dt;
    const k = Math.min(1, a.t / SHAKE_S);
    const decay = 1 - k;
    const side = Math.sin(a.t * 55) * 0.07 * decay;
    // Sideways, across the axis of the vehicle.
    a.x = a.baseX + (a.horizontal ? 0 : side);
    a.z = a.baseZ + (a.horizontal ? side : 0);
    a.roll = Math.sin(a.t * 55) * 0.05 * decay;
    if (a.t >= SHAKE_S) {
      a.mode = Mode.Idle;
      a.busy = false;
      a.x = a.baseX;
      a.z = a.baseZ;
      a.roll = 0;
    }
  }

  /** The directions a vehicle can be asked to go (for the hint arrow). */
  dirsOf(vehicle: number): [Dir, Dir] {
    return vehicleDirs(this.level.vehicles[vehicle]);
  }
}
