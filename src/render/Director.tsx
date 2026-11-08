import { benchPhase } from './bench';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber/native';

import { CAMERA_TILT_DEG } from './cameraFit';
import { perf } from './perf';
import type { SceneBus } from './bus';
import { BALL_R, cellX, cellZ } from './coords';
import type { DecalPool, ParticlePool } from './ParticlePool';
import type { PreparedLevel } from './prepare';
import type { BoardSurface } from './surface';
import {
  BRIDGE_LENGTH,
  CROSSING_SECONDS,
  LAND_SECONDS,
  SINK_FROM,
  clamp01,
  crossingPath,
  coastFactor,
  crossingPower,
  easeInOutCubic,
  linkOffset,
  panOffset,
} from './transition';

type Props = {
  bus: SceneBus;
  pool: ParticlePool;
  /** Mounted boards by key, to show/hide/move them without waiting for React. */
  groups: MutableRefObject<Map<string, THREE.Group>>;
  current: PreparedLevel;
  currentKey: string;
  next: PreparedLevel | null;
  nextKey: string;
};

type Run = {
  t: number;
  /** Where the next board sits (its origin) while the two are linked. */
  offset: THREE.Vector3;
  poseOld: THREE.Vector3;
  poseNew: THREE.Vector3;
  /** The orientation of the camera on the old board and on the new one (levels with platforms look a few degrees lower). */
  quatOld: THREE.Quaternion;
  quatNew: THREE.Quaternion;
  /** Where the ball was handed over (the exit tile of the old board) and where it must stop (the start tile of the new one). */
  from: THREE.Vector3;
  tile: THREE.Vector3;
  /** Time (s) since landing; null while the ball is still on its way. */
  landed: number | null;
  oldKey: string;
  nextKey: string;
  next: PreparedLevel;
  /** Distance of the crossing, to roll the ball by the right angle. */
  length: number;
  /** Power of the ease-out of the crossing: it starts at the speed the ball had leaving the board. */
  power: number;
};

/** The phase "entryClose" of the bench lasts this long after the ball has landed (milliseconds). */
const ENTRY_CLOSE_MS = 600;
const ABS = new THREE.Vector3();
const PREV = new THREE.Vector3();
const SPIN = new THREE.Quaternion();
const AXIS = new THREE.Vector3();

/**
 * Runs the camera drift and the crossing from one level to the next:
 *  1. as the ball rolls into the last tiles the camera drifts after it;
 *  2. the ball leaves the old board by its exit: it rolls across the bridge and through the entry of the next board while
 *     the camera glides after it (1.5 s, one continuous move), the old board sinking out of the sky at the end;
 *  3. the ball settles on the start tile; everything is moved back to the origin in one frame (nobody sees it) and the new
 *     level is playable.
 * Positions are written straight to three.js objects, never through React state.
 */
const CAMERA_TILT = (CAMERA_TILT_DEG * Math.PI) / 180;

export function Director({ bus, pool, groups, current, currentKey, next, nextKey }: Props) {
  const camera = useThree((s) => s.camera);
  const run = useRef<Run | null>(null);
  const stub = useRef<{ t: number; from: THREE.Vector3; to: THREE.Vector3 } | null>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);

    // The ball is rolling out of the board: keep it in view.
    if (bus.exiting && !run.current) {
      const pan = panOffset(current.level.cols, current.level.rows, bus.ballX, bus.ballZ);
      // Frame-rate independent smoothing: the same glide at any frame rate.
      const k = 1 - Math.exp(-5 * dt);
      camera.position.x += (current.cameraPosition.x + pan.x - camera.position.x) * k;
      camera.position.z += (current.cameraPosition.z + pan.z - camera.position.z) * k;
    }

    // The ball has left the board and the next level is not on its way yet (the result is being saved, the next board is being
    // finished): it keeps rolling on the bridge at the speed it had, so it never stops and starts again.
    if (!run.current && !stub.current && bus.exitFall && bus.ball && !bus.exitOnly) {
      const f = bus.exitFall;
      const sp = Math.hypot(f.vx, f.vz);
      const slow = coastFactor(f.coasted);
      if (sp > 1e-3 && slow > 0.02) {
        const d = sp * slow * dt;
        f.x += (f.vx / sp) * d;
        f.z += (f.vz / sp) * d;
        f.coasted += d;
        bus.ball.group.position.set(f.x, BALL_R, f.z);
        AXIS.set(f.vz / sp, 0, -f.vx / sp);
        SPIN.setFromAxisAngle(AXIS, d / BALL_R);
        bus.ball.body.quaternion.premultiply(SPIN);
      }
    }

    if (!run.current && bus.transitionRequested && next && bus.exitFall && bus.ball) {
      const nextGroup = groups.current.get(nextKey);
      // The next board mounts in stages in the background: the crossing waits (a frame or two) until all of it is there.
      if (nextGroup && nextGroup.userData.ready) {
        bus.transitionRequested = false;
        nextGroup.visible = true;
        const f = bus.exitFall;
        const offset = linkOffset(current.level, next.level);
        const tile = new THREE.Vector3(cellX(next.level, next.level.start[1]), BALL_R, cellZ(next.level, next.level.start[0])).add(offset);
        const from = new THREE.Vector3(f.x, BALL_R, f.z);
        const r: Run = {
          t: 0,
          offset,
          poseOld: camera.position.clone(),
          poseNew: next.cameraPosition.clone().add(offset),
          quatOld: camera.quaternion.clone(),
          quatNew: next.cameraQuaternion.clone(),
          from,
          tile,
          landed: null,
          oldKey: currentKey,
          nextKey,
          next,
          length: from.distanceTo(tile),
          power: crossingPower(Math.hypot(f.vx, f.vz) * coastFactor(f.coasted), CROSSING_SECONDS, from.distanceTo(tile)),
        };
        // The new board's entry gate opens for the ball.
        bus.arrivalKey = nextKey;
        run.current = r;
        bus.exiting = false;
        perf.setPhase('transition');
        benchPhase('bridge');
        bus.onTransitionStart?.();
      }
    }

    const r = run.current;
    if (r && bus.ball) {
      r.t += dt;
      const ball = bus.ball;
      if (r.landed === null) {
        const k = clamp01(r.t / CROSSING_SECONDS);
        camera.position.lerpVectors(r.poseOld, r.poseNew, easeInOutCubic(k));
        camera.quaternion.slerpQuaternions(r.quatOld, r.quatNew, easeInOutCubic(k));
        // A little zoom out along the way (same tilt), back to the tight framing on the new board.
        const back = Math.sin(k * Math.PI) * 0.12 * current.dist;
        camera.position.y += back * Math.sin(CAMERA_TILT);
        camera.position.z += back * Math.cos(CAMERA_TILT);
        crossingPath(r.from, r.tile, k, ABS, r.power);
        ball.group.position.copy(ABS);
        // Rolling: the spin follows the distance covered.
        const covered = PREV.copy(ABS).sub(r.from).length();
        const dirx = (r.tile.x - r.from.x) / Math.max(1e-6, r.length);
        const dirz = (r.tile.z - r.from.z) / Math.max(1e-6, r.length);
        AXIS.set(dirz, 0, -dirx);
        SPIN.setFromAxisAngle(AXIS, (covered - (ball.body.userData.covered ?? 0)) / BALL_R);
        ball.body.userData.covered = covered;
        ball.body.quaternion.premultiply(SPIN);

        // The old board sinks out of the sky as the new one comes in.
        const oldGroup = groups.current.get(r.oldKey);
        if (oldGroup) {
          const sink = clamp01((k - SINK_FROM) / (1 - SINK_FROM));
          oldGroup.position.y = -sink * 6;
          oldGroup.scale.setScalar(1 - 0.35 * sink);
        }

        if (r.t >= CROSSING_SECONDS) {
          // Landing. Put everything back to the origin in one go: the new board becomes the scene.
          const newGroup = groups.current.get(r.nextKey);
          if (oldGroup) oldGroup.visible = false;
          if (newGroup) newGroup.position.set(0, 0, 0);
          camera.position.copy(r.next.cameraPosition);
          camera.quaternion.copy(r.next.cameraQuaternion);
          const ud = newGroup?.userData as { surface?: BoardSurface; decals?: DecalPool } | undefined;
          bus.activeKey = r.nextKey;
          bus.arrivalKey = '';
          if (ud?.surface) bus.surface = ud.surface;
          if (ud?.decals) bus.decals = ud.decals;
          const sx = cellX(r.next.level, r.next.level.start[1]);
          const sz = cellZ(r.next.level, r.next.level.start[0]);
          ball.group.visible = true;
          ball.group.position.set(sx, BALL_R, sz);
          ball.body.userData.covered = 0;
          bus.ballX = sx;
          bus.ballZ = sz;
          bus.exitFall = null;
          pool.setPaintColor(r.next.level.color);
          bus.onEvent?.('landed');
          r.landed = 0;
          benchPhase('arrival');
        }
      } else {
        // The ball is in place: it only waits a moment (its shape never changes) before the player can swipe.
        r.landed += dt;
        if (r.landed >= LAND_SECONDS) {
          ball.group.position.y = BALL_R;
          run.current = null;
          bus.transitioning = false;
          perf.setPhase('level');
          // The entry gate of the new board closes behind the ball: the last phase of the passage, then the game is at rest.
          benchPhase('entryClose');
          setTimeout(() => benchPhase('idle'), ENTRY_CLOSE_MS);
          bus.onTransitionDone?.();
        }
      }
    }

    // No next level: the ball rolls along the short bridge and drops away.
    if (!run.current && !stub.current && bus.exitOnly && bus.exitFall && bus.ball) {
      const f = bus.exitFall;
      const len = Math.hypot(f.vx, f.vz) || 1;
      const from = new THREE.Vector3(f.x, BALL_R, f.z);
      stub.current = { t: 0, from, to: from.clone().add(new THREE.Vector3((f.vx / len) * (BRIDGE_LENGTH + 0.4), 0, (f.vz / len) * (BRIDGE_LENGTH + 0.4))) };
      bus.exitOnly = false;
    }
    const sb = stub.current;
    if (sb && bus.ball) {
      sb.t += dt;
      const k = clamp01(sb.t / 1.0);
      bus.ball.group.position.lerpVectors(sb.from, sb.to, 1 - (1 - k) * (1 - k));
      // At the end of the stub it drops out of sight (it goes down, it does not shrink).
      bus.ball.group.position.y = BALL_R - 1.6 * clamp01((k - 0.7) / 0.3) ** 2;
      if (k >= 1) {
        bus.ball.group.visible = false;
        bus.exitFall = null;
        stub.current = null;
      }
    }
  });

  return null;
}
