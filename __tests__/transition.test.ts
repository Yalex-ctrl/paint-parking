import * as THREE from 'three';

import levelsJson from '../assets/levels.json';
import type { Level } from '../src/game/types';
import { buildBridgeGeometry } from '../src/render/bridge';
import { BALL_R, GROUND_Y, cellX, cellZ } from '../src/render/coords';
import { insideIsland } from '../src/render/islandLayout';
import { prepareLevel } from '../src/render/prepare';
import { EXIT_SPEED, HANDOFF_DISTANCE } from '../src/render/exitPhysics';
import {
  BRIDGE_LENGTH,
  CROSSING_SECONDS,
  LAND_SECONDS,
  SINK_FROM,
  crossingPath,
  dirVector,
  easeInOutCubic,
  entryCentre,
  exitCentre,
  crossingPower,
  crossingProgress,
  linkOffset,
  panOffset,
} from '../src/render/transition';

const levels = levelsJson as unknown as Level[];
const IDS = [1, 2, 20, 26, 51, 76, 90, 99];
const SCREEN = { width: 390, height: 844, top: 59 + 60 + 52, bottom: 34 + 66 };

describe('crossing from one level to the next', () => {
  it('lasts about a second and a half, with the old board sinking only near the end', () => {
    expect(CROSSING_SECONDS).toBeGreaterThanOrEqual(1.3);
    expect(CROSSING_SECONDS).toBeLessThanOrEqual(1.8);
    expect(SINK_FROM).toBeGreaterThan(0.4);
    expect(SINK_FROM).toBeLessThan(1);
    expect(BRIDGE_LENGTH).toBeGreaterThanOrEqual(2);
    expect(BRIDGE_LENGTH).toBeLessThanOrEqual(3);
    expect(EXIT_SPEED * CROSSING_SECONDS).toBeGreaterThan(BRIDGE_LENGTH); // the ball has time to get across
    expect(HANDOFF_DISTANCE).toBeLessThan(1);
  });

  it('eases smoothly and monotonically', () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const e = easeInOutCubic(k);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('the ball goes straight from the exit of one board to the start tile of the next and stops there', () => {
    const from = new THREE.Vector3(6, BALL_R, -3);
    const tile = new THREE.Vector3(-2, BALL_R, 1);
    expect(crossingPath(from, tile, 0).distanceTo(from)).toBeLessThan(1e-9);
    expect(crossingPath(from, tile, 1).distanceTo(tile)).toBeLessThan(1e-9);
    expect(crossingPath(from, tile, 3).distanceTo(tile)).toBeLessThan(1e-9);
    const line = tile.clone().sub(from);
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const p = crossingPath(from, tile, k);
      const along = p.clone().sub(from).dot(line) / line.lengthSq();
      expect(along).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(p.clone().sub(from).cross(line).length()).toBeLessThan(1e-9); // never leaves the straight line
      prev = along;
    }
  });

  it('the ball starts the crossing at the speed it had leaving the board, and comes to rest without bouncing', () => {
    const length = 5;
    const speed = 13;
    const n = crossingPower(speed, CROSSING_SECONDS, length);
    // initial speed of the crossing (cells/s) = n * length / duration = the speed the ball had (within the clamp)
    expect((n * length) / CROSSING_SECONDS).toBeCloseTo(Math.min(speed, (4 * length) / CROSSING_SECONDS), 5);
    // it never goes backwards and the speed only falls: no bounce, no squash
    let prev = 0;
    let prevStep = Infinity;
    for (let k = 0.02; k <= 1.0001; k += 0.02) {
      const p = crossingProgress(k, n);
      expect(p).toBeGreaterThanOrEqual(prev);
      const step = p - prev;
      expect(step).toBeLessThanOrEqual(prevStep + 1e-9);
      prevStep = step;
      prev = p;
    }
    expect(crossingProgress(1, n)).toBe(1);
    expect(LAND_SECONDS).toBeLessThan(0.3);
  });

  it('the camera drifts toward a ball leaving the board, but never by more than the board plus a margin', () => {
    expect(panOffset(7, 7, 0, 0)).toEqual({ x: 0, z: 0 });
    const p = panOffset(7, 9, 100, -100);
    expect(p.x).toBe(7 / 2 + 2);
    expect(p.z).toBe(-(9 / 2 + 2));
  });
});

describe('boards placed side by side', () => {
  it.each(IDS.map((id) => [id] as const))('level %p -> next: the bridge is straight, BRIDGE_LENGTH cells long, and joins exit to entry', (id) => {
    const cur = levels[id - 1];
    const nxt = levels[id];
    const off = linkOffset(cur, nxt);
    const d = dirVector(cur.exit.dir);
    const entry = entryCentre(nxt)!;
    // The entry of the next board, once placed, sits right after the bridge that leaves the exit of the current one.
    const exitPos = exitCentre(cur);
    const entryPos = entry.clone().add(off);
    expect(entryPos.clone().sub(exitPos).dot(d)).toBeCloseTo(BRIDGE_LENGTH + 1, 9);
    expect(entryPos.clone().sub(exitPos).cross(d).length()).toBeLessThan(1e-9);
    // The next board lies beyond the exit of the current one.
    expect(off.dot(d)).toBeGreaterThan(0);
  });

  it.each(IDS.map((id) => [id] as const))('level %p: the island fills the whole screen, so no edge and no sky show during play', (id) => {
    for (const sc of [SCREEN, { width: 360, height: 740, top: 24 + 60 + 52, bottom: 66 }, { width: 430, height: 932, top: 59 + 60 + 52, bottom: 34 + 100 }]) {
      const p = prepareLevel(levels[id - 1], { width: sc.width, height: sc.height }, { top: sc.top, bottom: sc.bottom }, false);
      const cam = new THREE.PerspectiveCamera(40, sc.width / sc.height, 0.1, 300);
      cam.position.copy(p.cameraPosition);
      cam.quaternion.copy(p.cameraQuaternion);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const { cols, rows } = p.level;
      const { r0, r1, c0, c1 } = p.islandSpec;
      const ray = new THREE.Vector3();
      for (let ix = -1; ix <= 1.0001; ix += 0.25) {
        for (let iy = -1; iy <= 1.0001; iy += 0.25) {
          ray.set(ix, iy, 0.5).unproject(cam).sub(cam.position).normalize();
          expect(ray.y).toBeLessThan(-0.05); // looking down: the horizon is never on screen
          const t = (GROUND_Y - cam.position.y) / ray.y;
          const c = Math.floor(cam.position.x + ray.x * t + cols / 2);
          const r = Math.floor(cam.position.z + ray.z * t + rows / 2);
          // two cells in from the irregular rim at least
          expect(r >= r0 + 2 && r <= r1 - 2 && c >= c0 + 2 && c <= c1 - 2).toBe(true);
        }
      }
      p.dispose();
    }
  });

  it('the ball stays on the island while it rolls inside the board, and on the bridge when it leaves', () => {
    const l = levels[10];
    expect(insideIsland(l, 0, 0, BALL_R)).toBe(true);
    expect(insideIsland(l, 1000, 0, BALL_R)).toBe(false);
  });
});

describe('bridge geometry', () => {
  it.each([
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])('points along (%p, %p) from the outer face of the ring cell', (dx, dz) => {
    const g = buildBridgeGeometry(dx, dz);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    const pos = g.getAttribute('position');
    let near = Infinity;
    let far = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i) * dx + pos.getZ(i) * dz;
      near = Math.min(near, a);
      far = Math.max(far, a);
    }
    expect(near).toBeGreaterThanOrEqual(0.4);
    expect(far).toBeCloseTo(0.5 + BRIDGE_LENGTH + 0.055, 1);
    // flush with the board floor: nothing rises higher than rails and posts
    expect(box.max.y).toBeLessThan(0.5);
    g.dispose();
  });
});

describe('prepared level', () => {
  it.each(IDS.map((id) => [id] as const))('level %p: framing keeps the whole board on screen', (id) => {
    const p = prepareLevel(levels[id - 1], { width: SCREEN.width, height: SCREEN.height }, { top: SCREEN.top, bottom: SCREEN.bottom }, true);
    const cam = new THREE.PerspectiveCamera(40, SCREEN.width / SCREEN.height, 0.1, 300);
    cam.position.copy(p.cameraPosition);
    cam.quaternion.copy(p.cameraQuaternion);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const l = p.level;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const v = new THREE.Vector3((sx * l.cols) / 2, 0, (sz * l.rows) / 2).project(cam);
        expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
      }
    }
    // The start tile and the entry are placed on the board.
    expect(Number.isFinite(cellX(l, l.start[1]))).toBe(true);
    expect(Number.isFinite(cellZ(l, l.start[0]))).toBe(true);
    p.dispose();
  });

  it('keeps the decor of the level it was prepared for, and none when decor is off', () => {
    const on = prepareLevel(levels[80], { width: SCREEN.width, height: SCREEN.height }, { top: SCREEN.top, bottom: SCREEN.bottom }, true);
    const off = prepareLevel(levels[80], { width: SCREEN.width, height: SCREEN.height }, { top: SCREEN.top, bottom: SCREEN.bottom }, false);
    expect(on.decor.length).toBeGreaterThan(0);
    expect(off.decor).toHaveLength(0);
    on.dispose();
    off.dispose();
  });
});
