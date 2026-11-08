import type { Profile } from '../../game/economy';
import { dayKeyOf } from '../../game/dates';
import { streakStatus } from '../../game/daily';
import { levelPoint, mapCoinsLeft } from '../../game/mapLayout';
import type { Progress } from '../../storage/progress';
import type { MapShared } from './mapState';

/**
 * The imperative side of the map screen: every change to the shared scene state goes through these functions, so the
 * screen's components (which React tracks) never write into it directly.
 */

/** Where the camera rests for a level: the level sits in the lower part of the screen, with the next ones above it. */
export const restZ = (level: number) => levelPoint(level).z - 5;

export function loadProgressInto(shared: MapShared, p: Progress) {
  shared.stars = p.stars;
  shared.pathVersion++;
  shared.maxZ = 8;
  shared.minZ = levelPoint(p.current + 14).z - 5;
}

export function showCurrent(shared: MapShared, level: number) {
  shared.current = level;
  shared.z = restZ(level);
  shared.velocity = 0;
}

export function mirrorProfile(shared: MapShared, profile: Profile) {
  shared.opened = profile.chestsOpened;
  shared.ball = profile.equipped.ball;
  shared.paint = profile.equipped.paint;
  const today = dayKeyOf(new Date());
  const streak = streakStatus(profile, today);
  shared.streak = streak.streak;
  shared.dailyDone = streak.doneToday;
  shared.coinsLeft = mapCoinsLeft(profile, today);
}

/** The level just finished gets its stars, the ball hops to the next one. Times are in seconds (performance clock). */
export function scheduleHop(shared: MapShared, from: number, to: number, starsAt: number, hopAt: number, duration: number) {
  shared.current = from;
  shared.z = restZ(from);
  shared.starDrop = { id: from, at: starsAt };
  shared.hop = { from, to, start: hopAt, duration };
}

export function finishHop(shared: MapShared, to: number, at: number) {
  shared.current = to;
  shared.hop = null;
  shared.pathVersion++; // the stretch that was just walked takes its colour
  shared.lockPop = { id: to, at };
}

export function beginDrag(shared: MapShared) {
  shared.dragging = true;
  shared.velocity = 0;
}
export function dragBy(shared: MapShared, dy: number) {
  shared.z += dy * shared.worldPerPx;
}
export function endDrag(shared: MapShared, velocityY: number) {
  shared.dragging = false;
  shared.velocity = velocityY * shared.worldPerPx;
}
export function releaseDrag(shared: MapShared) {
  shared.dragging = false;
}
/** Camera driven by code (the "back to my level" glide): it takes over from the finger and the inertia. */
export function driveCamera(shared: MapShared, z: number) {
  shared.dragging = true;
  shared.velocity = 0;
  shared.z = z;
}

export function markCoinCaught(shared: MapShared, at: number) {
  shared.dyn.coin.caughtAt = at;
}

/** How far (in levels) the camera is from the current level; positive = above it on the map. */
export const distanceFromCurrent = (shared: MapShared, levelAtZ: (z: number) => number) => levelAtZ(shared.z + 5) - shared.current;
export const isHopping = (shared: MapShared) => shared.hop !== null;

/** Eases the camera to a level over a short time, taking over from the finger until it arrives. */
export class GlideDriver {
  private timer: ReturnType<typeof setInterval> | null = null;

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  to(shared: MapShared, level: number, ms = 650) {
    this.stop();
    const target = restZ(level);
    const from = shared.z;
    const t0 = performance.now();
    driveCamera(shared, from);
    this.timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = k * k * (3 - 2 * k);
      driveCamera(shared, from + (target - from) * e);
      if (k >= 1) {
        releaseDrag(shared);
        this.stop();
      }
    }, 16);
  }
}

export function bindSigns(shared: MapShared, fn: MapShared['onSign']) {
  shared.onSign = fn;
}
export const pick = (shared: MapShared, x: number, y: number) => shared.pickAt(x, y);

export function bindLabels(shared: MapShared, fn: MapShared['onLabel']) {
  shared.onLabel = fn;
}
