import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';

import levelsJson from '../assets/levels.json';
import type { Level } from '../src/game/types';
import { CAMERA_TILT_DEG, fitCamera } from '../src/render/cameraFit';
import { topHeight } from '../src/render/heights';
import { BALL_R, BASE_Y, GROUND_Y, WALL_H, cellX, cellZ } from '../src/render/coords';
import { DECOR_MODELS, MAX_DECOR } from '../src/core/render/decor/catalog';
import { convexHull, hullsOverlap, pointInHull, type Point } from '../src/core/render/decor/hull';
import { decorHull, planForCamera, playfieldHulls } from '../src/core/render/decor/planner';
import {
  BOARD_GAP,
  distToBoard,
  exitKeepOut,
  planDecor,
  radiusOf,
} from '../src/core/render/decor/placement';

const levels = levelsJson as unknown as Level[];
const SAMPLE = [1, 10, 20, 25, 40, 50, 60, 75, 90, 100].map((id) => levels[id - 1]);
const SCREENS = [
  { w: 390, h: 844, top: 59 + 60 + 92, bottom: 34 + 66 }, // iPhone 14
  { w: 430, h: 932, top: 59 + 60 + 92, bottom: 34 + 66 }, // iPhone 15 Pro Max
  { w: 360, h: 740, top: 24 + 60 + 92, bottom: 0 + 66 }, // small Android
  { w: 768, h: 1024, top: 20 + 60 + 92, bottom: 20 + 66 }, // tablet
];

describe('hull math', () => {
  const square = (x: number, y: number, s: number): Point[] =>
    convexHull([
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
    ]);
  it('detects overlap, separation and margin', () => {
    expect(hullsOverlap(square(0, 0, 1), square(0.5, 0.5, 1))).toBe(true);
    expect(hullsOverlap(square(0, 0, 1), square(2, 0, 1))).toBe(false);
    expect(hullsOverlap(square(0, 0, 1), square(1.05, 0, 1), 0.1)).toBe(true);
    expect(pointInHull(square(0, 0, 1), [0.5, 0.5])).toBe(true);
    expect(pointInHull(square(0, 0, 1), [1.5, 0.5])).toBe(false);
  });
});

describe('decor assets', () => {
  const modelsSource = readFileSync(join(__dirname, '../src/render/decor/models.ts'), 'utf8');
  it('uses 18 solid pieces; the ones from files exist inside the project and are bundled by name', () => {
    expect(DECOR_MODELS).toHaveLength(18);
    for (const m of DECOR_MODELS.filter((x) => !x.procedural)) {
      expect(existsSync(join(__dirname, '../assets/models', `${m.name}.glb`))).toBe(true);
      expect(modelsSource).toContain(`assets/models/${m.name}.glb`);
    }
    expect(modelsSource).not.toMatch(/Downloads|kenney_nature-kit/i);
  });
  it('registers glb/gltf with Metro', () => {
    const metro = readFileSync(join(__dirname, '../metro.config.js'), 'utf8');
    expect(metro).toContain("'glb'");
    expect(metro).toContain("'gltf'");
  });
});

describe('decor placement rules (camera independent)', () => {
  it('is deterministic per level and differs between levels', () => {
    const sig = (l: Level) => JSON.stringify(planDecor(l).map((p) => [p.model.name, p.x.toFixed(3), p.z.toFixed(3), p.scale.toFixed(3)]));
    expect(sig(levels[40])).toBe(sig(levels[40]));
    expect(sig(levels[40])).not.toBe(sig(levels[41]));
  });

  it.each(SAMPLE.map((l) => [l.id, l] as const))('level %p: outside the board, off the exit lane, tall pieces never in front', (_id, level) => {
    const plan = planDecor(level);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(MAX_DECOR);
    const lane = exitKeepOut(level);
    for (const p of plan) {
      const r = radiusOf(p);
      expect(distToBoard(level, p.x, p.z)).toBeGreaterThanOrEqual(BOARD_GAP + r - 1e-9);
      if (p.model.tall) expect(p.z).toBeLessThanOrEqual(level.rows / 2 - 0.5);
      const inLane = p.x > lane.minX - r && p.x < lane.maxX + r && p.z > lane.minZ - r && p.z < lane.maxZ + r;
      expect(inLane).toBe(false);
    }
  });
});

describe('decor vs. camera', () => {
  it('uses a ~65 degree tilt and keeps the board within ~92% of the width', () => {
    for (const s of SCREENS.slice(0, 3)) {
      for (const level of SAMPLE) {
        const cam = new THREE.PerspectiveCamera();
        fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
        const forward = cam.getWorldDirection(new THREE.Vector3());
        const elevation = THREE.MathUtils.radToDeg(Math.asin(-forward.y)); // view angle above the ground
        expect(elevation).toBeCloseTo(CAMERA_TILT_DEG - (level.camTilt ?? 0), 3);
        const hw = level.cols / 2;
        const hd = level.rows / 2;
        let maxX = 0;
        for (const x of [-hw, hw]) for (const z of [-hd, hd]) maxX = Math.max(maxX, Math.abs(new THREE.Vector3(x, WALL_H, z).project(cam).x));
        expect(maxX).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it.each(SAMPLE.map((l) => [l.id, l] as const))('level %p: no decor covers a cell, the ball or the exit lane on any screen', (_id, level) => {
    for (const s of SCREENS) {
      const cam = new THREE.PerspectiveCamera();
      fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
      const plan = planForCamera(level, cam);
      expect(plan.length).toBeLessThanOrEqual(MAX_DECOR);

      // Independent check: project sample points of every cell (floor, wall top and the ball
      // resting on floor cells) and make sure none falls inside a decor piece's screen hull.
      const points: Point[] = [];
      const V = new THREE.Vector3();
      for (let r = 0; r < level.rows; r++) {
        for (let c = 0; c < level.cols; c++) {
          const x = cellX(level, c);
          const z = cellZ(level, r);
          const ys = level.grid[r][c] === '.' ? [0, BALL_R, BALL_R * 2] : [WALL_H];
          for (const y of ys) for (const [dx, dz] of [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) {
            V.set(x + dx, y, z + dz).project(cam);
            points.push([V.x, V.y]);
          }
        }
      }
      const field = playfieldHulls(cam, level);
      for (const p of plan) {
        const hull = decorHull(cam, p)!;
        expect(points.some((pt) => pointInHull(hull, pt))).toBe(false);
        for (const f of field) expect(hullsOverlap(f, hull, 0)).toBe(false);
        expect(p.z + radiusOf(p)).toBeGreaterThan(GROUND_Y - 100); // sanity: finite placement
      }
    }
  });

  it('centres the board vertically between the header and the buttons', () => {
    for (const s of SCREENS) {
      for (const level of SAMPLE) {
        const cam = new THREE.PerspectiveCamera();
        fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
        let minY = Infinity;
        let maxY = -Infinity;
        const hw = level.cols / 2;
        const hd = level.rows / 2;
        for (const x of [-hw, hw]) {
          for (const z of [-hd, hd]) {
            // the top of the framing is the highest thing of the level (a wall, a platform, a chute)
            for (const y of [BASE_Y, topHeight(level)]) {
              const py = ((1 - new THREE.Vector3(x, y, z).project(cam).y) / 2) * s.h;
              minY = Math.min(minY, py);
              maxY = Math.max(maxY, py);
            }
          }
        }
        const above = minY - s.top;
        const below = s.h - s.bottom - maxY;
        expect(Math.abs(above - below)).toBeLessThan(1.5);
        expect(above).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  it('builds groves: most pieces have a neighbour close by, and both sides get some decor', () => {
    const s = SCREENS[0];
    let lonely = 0;
    let total = 0;
    let left = 0;
    let right = 0;
    let front = 0;
    for (const level of SAMPLE) {
      const cam = new THREE.PerspectiveCamera();
      fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
      const plan = planForCamera(level, cam);
      for (const p of plan) {
        total++;
        if (!plan.some((o) => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 3.2)) lonely++;
        if (p.x < -level.cols / 2) left++;
        if (p.x > level.cols / 2) right++;
        if (p.z > level.rows / 2) {
          front++;
          expect(p.model.tall).toBe(false); // only low pieces in front
        }
      }
    }
    expect(lonely / total).toBeLessThan(0.25);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(front).toBeGreaterThan(0);
  });

  it('keeps the header, the stars band and the buttons clear of decor', () => {
    for (const s of SCREENS) {
      for (const level of SAMPLE) {
        const cam = new THREE.PerspectiveCamera();
        fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
        const safe = { top: 1 - (2 * s.top) / s.h, bottom: -1 + (2 * s.bottom) / s.h };
        for (const p of planForCamera(level, cam, safe)) {
          const hull = decorHull(cam, p)!;
          for (const [, y] of hull) {
            expect(y).toBeLessThanOrEqual(safe.top + 1e-9);
            expect(y).toBeGreaterThanOrEqual(safe.bottom - 1e-9);
          }
        }
      }
    }
  });

  it('is mostly greenery: few stones, no lone pieces', () => {
    const s = SCREENS[0];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const level of SAMPLE) {
      const cam = new THREE.PerspectiveCamera();
      fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
      const plan = planForCamera(level, cam, { top: 1 - (2 * s.top) / s.h, bottom: -1 + (2 * (s.bottom + 28)) / s.h });
      expect(plan.length === 0 || plan.length >= 2).toBe(true); // a grove is never a single piece
      for (const p of plan) {
        counts[p.model.kind] = (counts[p.model.kind] ?? 0) + 1;
        total++;
      }
    }
    const green = (counts.bush ?? 0) + (counts.flower ?? 0) + (counts.grass ?? 0) + (counts.tree ?? 0);
    const rocky = (counts.stone ?? 0) + (counts.wood ?? 0);
    expect(green / total).toBeGreaterThan(0.8);
    expect(rocky / total).toBeLessThan(0.15);
    expect((counts.bush ?? 0) + (counts.flower ?? 0) + (counts.grass ?? 0)).toBeGreaterThan(counts.tree ?? 0); // more plants than trees
  });

  it('puts some decor on screen for typical levels', () => {
    const s = SCREENS[0];
    let total = 0;
    for (const level of SAMPLE) {
      const cam = new THREE.PerspectiveCamera();
      fitCamera(cam, level, s.w, s.h, { top: s.top, bottom: s.bottom });
      total += planForCamera(level, cam, { top: 1 - (2 * s.top) / s.h, bottom: -1 + (2 * s.bottom) / s.h }).length;
    }
    expect(total / SAMPLE.length).toBeGreaterThanOrEqual(4);
  });
});
