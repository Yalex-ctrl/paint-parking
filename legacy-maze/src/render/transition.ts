import * as THREE from 'three';

import { DELTA, type Level } from '../game/types';
import { cellX, cellZ } from './coords';

/**
 * Moving from one level to the next. The levels are connected: the exit of one opens onto a short wooden bridge, which
 * ends at the entry of the next. The ball rolls out, across the bridge and in, and stops on its start tile, while the
 * camera glides from one board to the other: no screen in between.
 */

/** Cells of bridge between the two boards (the ring cells of the exit and of the entry are not counted). */
export const BRIDGE_LENGTH = 3;
/** The whole crossing: from leaving the old board to resting on the start tile of the new one. */
export const CROSSING_SECONDS = 1.8;
/** The old board sinks out of the sky during the last part of the crossing, so it never pops out of existence. */
export const SINK_FROM = 0.62;
/** The ball has landed on its start tile: the player can swipe after this long (a short pause, the ball does not move). */
export const LAND_SECONDS = 0.12;

export const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeInOutQuad = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** World-plane direction of a level direction (a step in rows is a step in z). */
export const dirVector = (dir: keyof typeof DELTA, out = new THREE.Vector3()) => out.set(DELTA[dir][1], 0, DELTA[dir][0]);

/** Centre of the exit cell of a level, in the level's own coordinates. */
export const exitCentre = (level: Level) => new THREE.Vector3(cellX(level, level.exit.c), 0, cellZ(level, level.exit.r));

/** Centre of the entry cell of a level, in the level's own coordinates (null when the level has no entry). */
export const entryCentre = (level: Level) => (level.entry ? new THREE.Vector3(cellX(level, level.entry.c), 0, cellZ(level, level.entry.r)) : null);

/**
 * Where the next board sits relative to the current one (both centred on their own origin): the entry of the next board is
 * the exit of the current one, moved on by the bridge, in the direction the ball leaves by.
 */
export function linkOffset(from: Level, to: Level, out = new THREE.Vector3()): THREE.Vector3 {
  const entry = entryCentre(to);
  const d = dirVector(from.exit.dir);
  out.copy(exitCentre(from)).addScaledVector(d, BRIDGE_LENGTH + 1);
  if (entry) out.sub(entry);
  return out;
}

/**
 * While the ball waits on the bridge for the next board to be ready it does not stop dead: it keeps rolling and slows down gently.
 * This is the share of its speed it still has after rolling `coasted` cells since it left the board.
 */
export const coastFactor = (coasted: number) => Math.max(0, 1 - coasted / (BRIDGE_LENGTH * 1.1)) ** 1.5;

/** How far along the crossing (0..1) the ball is at `k`: an ease-out of power `n` (the speed starts at n times the average and falls smoothly to zero). */
export const crossingProgress = (k: number, n = 2) => 1 - Math.pow(1 - clamp01(k), n);

/**
 * The power `n` that makes the crossing start at the speed the ball already had when it left the board (`speed`, cells/s) over a
 * distance `length` in `seconds`: the ball never slows down and speeds up again at the handover.
 */
export const crossingPower = (speed: number, seconds: number, length: number) => Math.min(4, Math.max(1.2, (speed * seconds) / Math.max(0.1, length)));

/**
 * Absolute position of the ball `k` (0..1) of the way across: a straight run from where it left the old board to the start
 * tile of the new one, slowing gently to a stop at the end. `n` is the power of the ease-out (see crossingPower).
 */
export function crossingPath(from: THREE.Vector3, tile: THREE.Vector3, k: number, out = new THREE.Vector3(), n = 2): THREE.Vector3 {
  return out.lerpVectors(from, tile, crossingProgress(k, n));
}

/**
 * How far the camera drifts toward the ball while it rolls inside the last tiles of the board (60 % of its distance from
 * the middle of the board), so that it stays on screen.
 */
export function panOffset(cols: number, rows: number, ballX: number, ballZ: number) {
  const lx = cols / 2 + 2;
  const lz = rows / 2 + 2;
  return { x: THREE.MathUtils.clamp(ballX * 0.6, -lx, lx), z: THREE.MathUtils.clamp(ballZ * 0.6, -lz, lz) };
}
