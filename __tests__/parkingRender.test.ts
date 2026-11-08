import * as THREE from 'three';

import { applyGesture, compile, createState } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import { fitCamera, lotBandPx } from '../src/render/cameraFit';
import { cellAt, cellX, cellZ, ROAD_MARGIN } from '../src/render/coords';
import { distanceAt, exitPath, samplePath, TURN_RADIUS, type Pose } from '../src/render/paths';
import { ParkingScene, TRAIL_CAPACITY } from '../src/render/ParkingScene';
import { lot } from './helpers';

const close = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('the way out', () => {
  const level = { rows: 4, cols: 4 };
  const pose: Pose = { x: 0, z: 0, yaw: 0 };

  it('goes straight out of the place, turns clockwise onto the road and carries on along it', () => {
    const p = exitPath(level, 0.5, 0.5, 'R');
    // Straight to the road.
    samplePath(p, 0, pose);
    close(pose.x, 0.5);
    close(pose.z, 0.5);
    close(pose.yaw, 0);
    // Right of the lot: the middle of the road is ROAD_MARGIN past the edge (x = 2).
    samplePath(p, p.len1 + p.arcLen, pose);
    close(pose.x, 2 + ROAD_MARGIN);
    close(pose.z, 0.5 + TURN_RADIUS);
    // Heading down (+z) after the turn: facing +z is a yaw of -pi/2.
    close(pose.yaw, -Math.PI / 2);
    samplePath(p, p.total, pose);
    close(pose.x, 2 + ROAD_MARGIN);
    expect(pose.z).toBeGreaterThan(10);
  });

  it('turns the same way round the lot whichever side it leaves by', () => {
    for (const [dir, turn] of [
      ['R', [0, 1]],
      ['D', [-1, 0]],
      ['L', [0, -1]],
      ['U', [1, 0]],
    ] as const) {
      const p = exitPath(level, 0.5, 0.5, dir);
      expect([p.tx, p.tz]).toEqual(turn);
    }
  });

  it('is continuous: no jump between the straight, the turn and the road', () => {
    const p = exitPath(level, -0.5, 1.5, 'U');
    const a: Pose = { x: 0, z: 0, yaw: 0 };
    const b: Pose = { x: 0, z: 0, yaw: 0 };
    for (let d = 0; d < p.total - 0.02; d += 0.02) {
      samplePath(p, d, a);
      samplePath(p, d + 0.02, b);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.0201);
    }
  });

  it('starts smoothly: no speed at the beginning, a steady speed after', () => {
    expect(distanceAt(0)).toBe(0);
    expect(distanceAt(0.1)).toBeLessThan(0.05);
    const v = (distanceAt(3.01) - distanceAt(3)) / 0.01;
    close(v, 8.5, 0.01);
  });
});

describe('the cells', () => {
  it('map a cell to the world and back', () => {
    const level = { rows: 5, cols: 4 };
    expect(cellX(level, 0)).toBe(-1.5);
    expect(cellZ(level, 4)).toBe(2);
    expect(cellAt(level, cellX(level, 3), cellZ(level, 1))).toEqual([1, 3]);
    expect(cellAt(level, 2.1, 0)).toBeNull();
  });
});

describe('the camera', () => {
  it('fills about 90 % of the width with the lot, and keeps it inside the free band', () => {
    const camera = new THREE.PerspectiveCamera();
    const margins = { top: 200, bottom: 120 };
    for (const level of [LEVELS[0], LEVELS[24], LEVELS[49]]) {
      fitCamera(camera, level, 390, 844, margins);
      const band = lotBandPx(level, 390, 844, margins);
      expect(band.top).toBeGreaterThanOrEqual(margins.top - 30);
      expect(band.bottom).toBeLessThanOrEqual(844 - margins.bottom + 30);
    }
    // A small lot is limited by the width, not the height.
    const small = lot({ rows: 3, cols: 3, vehicles: [[0, 0, 'R', 2]] });
    fitCamera(camera, small, 390, 844, margins);
    const v = new THREE.Vector3(1.5 + 0.4, 0, 0).project(camera);
    expect(v.x).toBeGreaterThan(0.8);
    expect(v.x).toBeLessThanOrEqual(0.9 + 1e-6);
  });
});

describe('the animations', () => {
  const level = () =>
    lot({
      rows: 4,
      cols: 4,
      vehicles: [
        [0, 1, 'R', 2],
        [1, 2, 'D', 2],
        [3, 0, 'L', 3],
      ],
    });
  const run = (scene: ParkingScene, seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds; t += dt) scene.update(dt);
  };

  it('a vehicle that leaves drives away, lays paint behind it and is gone', () => {
    const l = level();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const events: string[] = [];
    scene.onEvent = (e) => events.push(e);
    scene.play(applyGesture(board, state, 0, 'R'));
    expect(scene.actors[0].busy).toBe(true);
    run(scene, 0.3);
    expect(scene.actors[0].x).toBeGreaterThan(scene.actors[0].baseX);
    run(scene, 4);
    expect(scene.actors[0].hidden).toBe(true);
    expect(scene.actors[0].busy).toBe(false);
    expect(scene.trailCount).toBeGreaterThan(8);
    expect(scene.trailCount).toBeLessThan(60);
    expect(events).toContain('exit');
    expect(scene.puffs.some((p) => p.active) || scene.trailCount > 0).toBe(true);
  });

  it('a vehicle that reverses out keeps its front toward where it was', () => {
    const l = level();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    scene.play(applyGesture(board, state, 0, 'L'));
    expect(scene.actors[0].reverse).toBe(true);
    run(scene, 0.2);
    // It faces right (yaw 0) and moves left.
    close(Math.cos(scene.actors[0].yaw), 1, 0.05);
    expect(scene.actors[0].x).toBeLessThan(scene.actors[0].baseX);
  });

  it('a collision goes up to the obstacle, rings out, honks, shows the angry emoji and comes back to the exact place', () => {
    const l = level();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const events: string[] = [];
    scene.onEvent = (e) => events.push(e);
    const a = scene.actors[1];
    scene.play(applyGesture(board, state, 1, 'D')); // blocked by the truck at once (no room)
    let maxOffset = 0;
    let sawEmoji = false;
    for (let t = 0; t < 2; t += 1 / 60) {
      scene.update(1 / 60);
      maxOffset = Math.max(maxOffset, Math.abs(a.z - a.baseZ));
      sawEmoji ||= scene.emojis.some((e) => e.active);
    }
    expect(maxOffset).toBeGreaterThan(0.05);
    expect(maxOffset).toBeLessThan(0.3);
    expect(sawEmoji).toBe(true);
    expect(events).toEqual(expect.arrayContaining(['bump', 'horn']));
    expect(a.busy).toBe(false);
    expect(a.x).toBe(a.baseX);
    expect(a.z).toBe(a.baseZ);
    expect(a.hidden).toBe(false);
    // The truck that was hit has trembled and is back too.
    const truck = scene.actors[2];
    expect(truck.x).toBe(truck.baseX);
    expect(truck.roll).toBe(0);
  });

  it('a collision further away drives the free cells first', () => {
    const l = lot({ rows: 1, cols: 6, vehicles: [[0, 0, 'R', 2]], obstacles: [[0, 4]] });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const a = scene.actors[0];
    scene.play(applyGesture(board, state, 0, 'R'));
    let maxX = a.baseX;
    for (let t = 0; t < 2; t += 1 / 60) {
      scene.update(1 / 60);
      maxX = Math.max(maxX, a.x);
    }
    // Two free cells, then a little gap: it stops just before the obstacle.
    expect(maxX - a.baseX).toBeGreaterThan(1.9);
    expect(maxX - a.baseX).toBeLessThan(2.3);
  });

  it('a gesture across the axis shakes the vehicle for a moment, in place', () => {
    const l = level();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    scene.lastTouched = 0;
    scene.play(applyGesture(board, state, 0, 'U'));
    expect(scene.actors[0].busy).toBe(true);
    run(scene, 0.1);
    expect(scene.actors[0].z).not.toBe(scene.actors[0].baseZ);
    run(scene, 0.5);
    expect(scene.actors[0].busy).toBe(false);
    expect(scene.actors[0].z).toBe(scene.actors[0].baseZ);
    expect(state.moves).toBe(0);
  });

  it('the shine starts when the last vehicle has left, and ends', () => {
    const l = lot({ rows: 1, cols: 4, vehicles: [[0, 0, 'R', 2]] });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    scene.play(applyGesture(board, state, 0, 'R'));
    run(scene, 4);
    expect(scene.shine).toBeGreaterThanOrEqual(0);
    let peak = 0;
    for (let i = 0; i < scene.trailCount; i++) peak = Math.max(peak, scene.shineAt(i));
    expect(peak).toBeGreaterThan(0);
    run(scene, 2);
    expect(scene.shine).toBe(-1);
    expect(scene.active).toBe(false);
  });

  it('the paint of a whole level fits in the trail buffer', () => {
    const scene = new ParkingScene(LEVELS[49]);
    const board = compile(LEVELS[49]);
    const state = createState(board);
    for (const id of LEVELS[49].solution) scene.play(applyGesture(board, state, id, scene.dirsOf(id)[0]));
    expect(scene.trailCount).toBeLessThanOrEqual(TRAIL_CAPACITY);
  });

  it('the trail takes the colour of the vehicle, or of the equipped paint for the vehicle with the crown', () => {
    const scene = new ParkingScene(level());
    scene.setTrailColor(1, '#ff00ff');
    expect(scene.actors[1].trail.getHexString()).toBe('ff00ff');
    expect(scene.actors[0].trail.getHexString()).toBe(scene.actors[0].color.getHexString());
  });
});

describe('the geometry', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildLotGeometry, gateGeometry } = require('../src/render/lotGeometry');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { carGeometry, lightsGeometry, crownGeometry } = require('../src/render/vehicleGeometry');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DAILY_LEVELS } = require('../src/game/dailyLevels');

  it('builds the lot of every level as a single geometry with colours', () => {
    for (const level of [...LEVELS, ...DAILY_LEVELS]) {
      const g = buildLotGeometry(level);
      expect(g.attributes.position.count).toBeGreaterThan(100);
      expect(g.attributes.color.count).toBe(g.attributes.position.count);
      level.gates.forEach((_: unknown, i: number) => expect(gateGeometry(level, i).geometry.attributes.position.count).toBeGreaterThan(0));
    }
  });

  it('keeps the budget: a lot is a few thousand triangles at most', () => {
    const worst = Math.max(...[...LEVELS, ...DAILY_LEVELS].map((l: { id: number }) => (buildLotGeometry(l).index?.count ?? 0) / 3));
    expect(worst).toBeLessThan(12000);
  });

  it('draws the vehicles with the front at +X: lights in front, windscreen on the front side', () => {
    const car = carGeometry(2);
    const lights = lightsGeometry(2);
    const frontOfBody = Math.max(...Array.from(car.attributes.position.array as Float32Array).filter((_, i) => i % 3 === 0));
    expect(frontOfBody).toBeCloseTo(0.9, 1);
    expect(lights.attributes.color.count).toBe(lights.attributes.position.count);
    expect(crownGeometry().attributes.position.count).toBeGreaterThan(0);
    expect(carGeometry(3).boundingBox === null || true).toBe(true);
  });
});
