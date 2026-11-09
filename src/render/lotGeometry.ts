import * as THREE from 'three';

import { createRng } from '../core/rng';
import { DELTA } from '../core/grid';
import type { Level, Obstacle } from '../game/types';
import { ASPHALT_Y, cellX, cellZ, EXIT_LEN, ROAD_GAP, ROAD_MARGIN, ROAD_W } from './coords';
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

  // The road goes round the lot (four strips, dark asphalt) and its middle is marked by a dashed yellow line. There is no border:
  // the lot is open on the road all round.
  const roadIn = ROAD_GAP;
  const roadOut = ROAD_GAP + ROAD_W;
  const roadMid = ROAD_MARGIN;
  const roadTop = 0.024;
  const roadBox = (w: number, d: number, x: number, z: number) => box(w, roadTop + 0.1, d, x, (roadTop - 0.1) / 2, z, C.road);
  parts.push(roadBox((hw + roadOut) * 2, ROAD_W, 0, -(hd + roadMid)));
  parts.push(roadBox((hw + roadOut) * 2, ROAD_W, 0, hd + roadMid));
  parts.push(roadBox(ROAD_W, (hd + roadIn) * 2, -(hw + roadMid), 0));
  parts.push(roadBox(ROAD_W, (hd + roadIn) * 2, hw + roadMid, 0));
  for (let x = -hw - roadMid + 0.2; x < hw + roadMid; x += 0.9) {
    parts.push(box(0.45, 0.01, 0.07, x + 0.22, 0.03, -(hd + roadMid), C.roadDash));
    parts.push(box(0.45, 0.01, 0.07, x + 0.22, 0.03, hd + roadMid, C.roadDash));
  }
  for (let z = -hd - roadMid + 0.2; z < hd + roadMid; z += 0.9) {
    parts.push(box(0.07, 0.01, 0.45, -(hw + roadMid), 0.03, z + 0.22, C.roadDash));
    parts.push(box(0.07, 0.01, 0.45, hw + roadMid, 0.03, z + 0.22, C.roadDash));
  }

  // The road of exit: from the middle of the bottom road, straight down the screen toward the next parking, well visible.
  parts.push(roadBox(ROAD_W, EXIT_LEN, 0, hd + roadMid + EXIT_LEN / 2));
  for (let z = hd + roadMid + 0.5; z < hd + roadMid + EXIT_LEN - 0.3; z += 0.9) parts.push(box(0.07, 0.01, 0.45, 0, 0.03, z, C.roadDash));

  // The limit of the lot: one thin continuous white line on the ground (nothing stands up that could stop a vehicle), and a small
  // kerb at each of the four corners, for the look only.
  const edgeY = ASPHALT_Y + 0.03;
  parts.push(box(hw * 2 + 0.08, 0.012, 0.07, 0, edgeY, -hd, C.line));
  parts.push(box(hw * 2 + 0.08, 0.012, 0.07, 0, edgeY, hd, C.line));
  parts.push(box(0.07, 0.012, hd * 2, -hw, edgeY, 0, C.line));
  parts.push(box(0.07, 0.012, hd * 2, hw, edgeY, 0, C.line));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.3, 0.16, 0.3, sx * (hw + 0.08), 0.08, sz * (hd + 0.08), C.sidewalk));
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
  // The middle of the barrier, on the limit of the lot on that side.
  const edge = (horizontal ? level.cols : level.rows) / 2 + ROAD_GAP / 2;
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
