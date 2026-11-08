import * as THREE from 'three';

import { createRng } from '../core/rng';
import { DELTA } from '../core/grid';
import type { Level, Obstacle } from '../game/types';
import { ASPHALT_Y, cellX, cellZ, ROAD_MARGIN, ROAD_W, SIDEWALK, SLAB_H } from './coords';
import { box, cylinder, flatShape, merge, sphere } from './geo';
import { LOT_COLORS as C } from './palette';
import { yawOf } from './paths';

/**
 * The lot, as one geometry: the wooden plate, the sidewalk, the road with its dashed line, the places (asphalt, slightly varied)
 * with their white lines, the grass of the missing parts of the shape, the obstacles, the painted arrows of the one-way lanes.
 * The barriers move, so they are made apart (see `gateGeometry`).
 */
export function buildLotGeometry(level: Level): THREE.BufferGeometry {
  const { rows, cols } = level;
  const parts: THREE.BufferGeometry[] = [];
  const hw = cols / 2;
  const hd = rows / 2;
  const rng = createRng(level.seed ^ 0x9e3779b9);

  // The plate: lot + sidewalk + road, a little margin of wood at the edge.
  const outerW = hw + SIDEWALK + ROAD_W + 0.25;
  const outerD = hd + SIDEWALK + ROAD_W + 0.25;
  parts.push(box(outerW * 2, SLAB_H, outerD * 2, 0, -SLAB_H / 2, 0, C.wood));

  // The road: four strips round the sidewalk, darker asphalt (the strips overlap at the corners, which is fine).
  const roadIn = ROAD_MARGIN - ROAD_W / 2;
  const roadOut = ROAD_MARGIN + ROAD_W / 2;
  const roadY = 0.012;
  parts.push(box((hw + roadOut) * 2, 0.024, roadOut - roadIn, 0, roadY / 2 + 0.006, -(hd + (roadIn + roadOut) / 2), C.road));
  parts.push(box((hw + roadOut) * 2, 0.024, roadOut - roadIn, 0, roadY / 2 + 0.006, hd + (roadIn + roadOut) / 2, C.road));
  parts.push(box(roadOut - roadIn, 0.024, (hd + roadIn) * 2, -(hw + (roadIn + roadOut) / 2), roadY / 2 + 0.006, 0, C.road));
  parts.push(box(roadOut - roadIn, 0.024, (hd + roadIn) * 2, hw + (roadIn + roadOut) / 2, roadY / 2 + 0.006, 0, C.road));
  // The dashed line down the middle of the road.
  const mid = ROAD_MARGIN;
  for (let x = -hw - mid + 0.2; x < hw + mid; x += 0.9) {
    parts.push(box(0.45, 0.01, 0.07, x + 0.22, 0.03, -(hd + mid), C.roadDash));
    parts.push(box(0.45, 0.01, 0.07, x + 0.22, 0.03, hd + mid, C.roadDash));
  }
  for (let z = -hd - mid + 0.2; z < hd + mid; z += 0.9) {
    parts.push(box(0.07, 0.01, 0.45, -(hw + mid), 0.03, z + 0.22, C.roadDash));
    parts.push(box(0.07, 0.01, 0.45, hw + mid, 0.03, z + 0.22, C.roadDash));
  }

  // The sidewalk: a raised ring of light wood round the lot.
  const swY = 0.05;
  parts.push(box((hw + SIDEWALK) * 2, 0.1, SIDEWALK, 0, swY, -(hd + SIDEWALK / 2), C.sidewalk));
  parts.push(box((hw + SIDEWALK) * 2, 0.1, SIDEWALK, 0, swY, hd + SIDEWALK / 2, C.sidewalk));
  parts.push(box(SIDEWALK, 0.1, hd * 2, -(hw + SIDEWALK / 2), swY, 0, C.sidewalk));
  parts.push(box(SIDEWALK, 0.1, hd * 2, hw + SIDEWALK / 2, swY, 0, C.sidewalk));

  // The way out: the road goes on past the corner of the lot, straight away from it, across the grass (it is seen above the lot).
  const exitX = hw + mid;
  parts.push(box(roadOut - roadIn, 0.4, 40, exitX, 0.024 - 0.2, -(hd + mid) - 20, C.road));
  for (let z = -(hd + mid) - 1; z > -(hd + mid) - 40; z -= 0.9) parts.push(box(0.07, 0.01, 0.45, exitX, 0.03, z, C.roadDash));

  const isVoid = new Set(level.voids.map(([r, c]) => r * cols + c));
  // The places: each cell a slab of grey-violet asphalt, two shades chosen at random so it is not flat.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cellX(level, c);
      const z = cellZ(level, r);
      if (isVoid.has(r * cols + c)) {
        parts.push(box(1, 0.1, 1, x, 0.05, z, C.grassVoid));
        continue;
      }
      parts.push(box(0.995, 0.04, 0.995, x, ASPHALT_Y / 2 + 0.01, z, rng.next() < 0.5 ? C.asphalt : C.asphaltAlt));
    }
  }
  // White lines between the places: along every border between two places of the lot.
  const LINE_Y = ASPHALT_Y + 0.025;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isVoid.has(r * cols + c)) continue;
      if (c + 1 < cols && !isVoid.has(r * cols + c + 1)) parts.push(box(0.04, 0.012, 0.8, cellX(level, c) + 0.5, LINE_Y, cellZ(level, r), C.line));
      if (r + 1 < rows && !isVoid.has((r + 1) * cols + c)) parts.push(box(0.8, 0.012, 0.04, cellX(level, c), LINE_Y, cellZ(level, r) + 0.5, C.line));
    }
  }

  for (const o of level.obstacles) addObstacle(parts, level, o);

  for (const w of level.oneWays) {
    // A painted arrow on a place: a vehicle may only drive over it the way it shows.
    const { r, c } = w;
    const [dr, dc] = DELTA[w.dir];
    parts.push(
      flatShape(
        [
          [-0.34, -0.1],
          [0.04, -0.1],
          [0.04, -0.26],
          [0.38, 0],
          [0.04, 0.26],
          [0.04, 0.1],
          [-0.34, 0.1],
        ],
        cellX(level, c),
        ASPHALT_Y + 0.04,
        cellZ(level, r),
        yawOf(dc, dr),
        C.arrow,
      ),
    );
  }
  return merge(parts);
}

function addObstacle(parts: THREE.BufferGeometry[], level: Level, o: Obstacle) {
  const x = cellX(level, o.c);
  const z = cellZ(level, o.r);
  const y = ASPHALT_Y + 0.02;
  if (o.kind === 'post') {
    parts.push(box(0.34, 0.5, 0.34, x, y + 0.25, z, C.post));
    parts.push(box(0.36, 0.08, 0.36, x, y + 0.52, z, C.postTop));
  } else if (o.kind === 'planter') {
    parts.push(cylinder(0.3, 0.22, 0.34, x, y, z, C.pot));
    parts.push(sphere(0.3, x, y + 0.62, z, C.leaf));
    parts.push(sphere(0.2, x + 0.1, y + 0.9, z - 0.05, C.leaf));
  } else {
    parts.push(cylinder(0.16, 0.18, 0.52, x, y, z, C.bollardB));
    parts.push(cylinder(0.165, 0.165, 0.12, x, y + 0.18, z, C.bollardA));
    parts.push(sphere(0.16, x, y + 0.52, z, C.bollardB));
  }
}

/** The barrier of a gate: two posts and an arm striped red and white, along the edge, over the lanes it covers. */
export function gateGeometry(level: Level, index: number): { geometry: THREE.BufferGeometry; x: number; y: number; z: number; yaw: number } {
  const g = level.gates[index];
  const horizontal = g.side === 'L' || g.side === 'R';
  const from = g.from;
  const to = g.to;
  const span = to - from + 1;
  // The middle of the barrier, on the sidewalk, right outside the lot on that side.
  const edge = (horizontal ? level.cols : level.rows) / 2 + SIDEWALK / 2;
  const sign = g.side === 'R' || g.side === 'D' ? 1 : -1;
  const lane = (from + to) / 2;
  const x = horizontal ? sign * edge : cellX(level, lane);
  const z = horizontal ? cellZ(level, lane) : sign * edge;
  const parts: THREE.BufferGeometry[] = [];
  // Built along X (the arm runs the length of the lanes), the group is then turned.
  const len = span * 0.98;
  parts.push(box(0.14, 0.5, 0.14, -len / 2, 0.25, 0, C.post));
  parts.push(box(0.14, 0.5, 0.14, len / 2, 0.25, 0, C.post));
  const stripes = Math.max(4, Math.round(len * 3));
  for (let i = 0; i < stripes; i++) {
    const w = len / stripes;
    parts.push(box(w, 0.1, 0.1, -len / 2 + w * (i + 0.5), 0.46, 0, i % 2 === 0 ? C.gate : C.gateStripe));
  }
  return { geometry: merge(parts), x, y: 0.1, z, yaw: horizontal ? Math.PI / 2 : 0 };
}
