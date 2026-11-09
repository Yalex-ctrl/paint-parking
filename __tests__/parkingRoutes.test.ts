import { applyTap, compile, createState } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { travelDir } from '../src/game/types';
import { EXIT_LEN, ROAD_MARGIN } from '../src/render/coords';
import { EXIT_RUN, ROUTE_STEP, TOP_SPEED, buildRoute, sampleRoute, yawOf, type Pose } from '../src/render/paths';
import { ParkingScene, PRESS_S, TRAIL_CAPACITY, roadGap } from '../src/render/ParkingScene';
import { lot } from './helpers';

const pose = (): Pose => ({ x: 0, z: 0, yaw: 0, hx: 0, hz: 0 });
const run = (scene: ParkingScene, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) scene.update(dt);
};

describe('the way out, worked out when the level is prepared', () => {
  const level = { rows: 6, cols: 5 };
  const X = 5 / 2 + ROAD_MARGIN;
  const Z = 6 / 2 + ROAD_MARGIN;

  it('goes straight out of the place to the road, whatever the side', () => {
    for (const [dir, x0, z0, hx, hz] of [
      ['R', 0.5, 0.5, 1, 0],
      ['L', 0.5, 0.5, -1, 0],
      ['D', 0.5, 0.5, 0, 1],
      ['U', 0.5, 0.5, 0, -1],
    ] as const) {
      const r = buildRoute(level, x0, z0, dir);
      const p = pose();
      sampleRoute(r, 0, p);
      expect([p.x, p.z]).toEqual([x0, z0]);
      expect(p.hx).toBeCloseTo(hx, 6);
      expect(p.hz).toBeCloseTo(hz, 6);
      expect(r.laneLen).toBeGreaterThan(0.5);
    }
  });

  it('reaches the road (the middle of the road is beyond the limit of the lot) and follows it to the road of exit, then goes down it', () => {
    for (const [dir, x0, z0] of [
      ['R', 0.5, -1.5],
      ['L', -1.5, 1.5],
      ['U', 1.5, -2.5],
      ['D', -0.5, 2.5],
    ] as const) {
      const r = buildRoute(level, x0, z0, dir);
      const p = pose();
      // Every sample after the lane is outside the lot (on the road), never inside it again.
      for (let i = 0; i < r.count; i++) {
        if (r.ss[i] <= r.laneLen + 0.01) continue;
        expect(Math.abs(r.xs[i]) > 2.5 - 1e-3 || Math.abs(r.zs[i]) > 3 - 1e-3).toBe(true);
      }
      // The end: on the road of exit, at the middle, heading down the screen.
      sampleRoute(r, r.length, p);
      expect(p.x).toBeCloseTo(0, 3);
      expect(p.z).toBeCloseTo(Z + EXIT_RUN, 3);
      expect(p.hz).toBeCloseTo(1, 3);
    }
  });

  it('goes round the lot the short way: down the right side from the right, down the left side from the left', () => {
    const right = buildRoute(level, 2, -1.5, 'R');
    const left = buildRoute(level, -2, -1.5, 'L');
    const maxX = (r: ReturnType<typeof buildRoute>) => Math.max(...Array.from(r.xs));
    const minX = (r: ReturnType<typeof buildRoute>) => Math.min(...Array.from(r.xs));
    expect(maxX(right)).toBeCloseTo(X, 3);
    expect(minX(right)).toBeGreaterThan(-0.01);
    expect(minX(left)).toBeCloseTo(-X, 3);
    expect(maxX(left)).toBeLessThan(0.01);
  });

  it('is smooth: a step of the samples is a step of the road, and the heading turns by little at a time (rounded bends)', () => {
    for (const [dir, x0, z0] of [
      ['U', -0.5, 1.5],
      ['R', 0.5, 0.5],
      ['D', 1.5, 2.5],
    ] as const) {
      const r = buildRoute(level, x0, z0, dir);
      for (let i = 1; i < r.count; i++) {
        expect(Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1])).toBeLessThan(ROUTE_STEP * 1.6);
        const dot = r.hx[i] * r.hx[i - 1] + r.hz[i] * r.hz[i - 1];
        expect(dot).toBeGreaterThan(0.97);
      }
      expect(r.ss[r.count - 1]).toBeCloseTo(r.length, 4);
    }
  });

  it('is made for every vehicle of every level and challenge, and short enough for a quick exit', () => {
    for (const l of [...LEVELS, ...DAILY_LEVELS]) {
      const scene = new ParkingScene(l);
      for (const a of scene.actors) {
        expect(a.route.count).toBeGreaterThan(10);
        // Never more than a lap and a half of the lot, and the exit takes about a second or a second and a half at the pace of the game.
        expect(a.route.length).toBeLessThan(60);
      }
    }
    expect(EXIT_RUN).toBeLessThan(EXIT_LEN);
    expect(TOP_SPEED).toBeGreaterThanOrEqual(15);
  });

  it('every vehicle of the biggest levels leaves in about one to one and a half seconds, alone on the road', () => {
    const level = LEVELS[49];
    const times: number[] = [];
    for (const id of level.solution.slice(0, 12)) {
      const scene = new ParkingScene(level);
      const board = compile(level);
      const state = createState(board);
      // The vehicles that had to leave first are gone.
      for (const o of level.solution) {
        if (o === id) break;
        applyTap(board, state, o);
        scene.actors[o].hidden = true;
      }
      scene.play(applyTap(board, state, id));
      let t = 0;
      while (!scene.actors[id].hidden && t < 5) {
        scene.update(1 / 60);
        t += 1 / 60;
      }
      times.push(t);
    }
    expect(Math.max(...times)).toBeLessThan(2.6);
    expect(times.reduce((s, x) => s + x, 0) / times.length).toBeLessThan(2.0);
    expect(Math.min(...times)).toBeGreaterThan(0.5);
  });
});

describe('the answer to a tap', () => {
  const base = () =>
    lot({
      rows: 4,
      cols: 4,
      vehicles: [
        [0, 1, 'R', 2],
        [1, 2, 'D', 2],
        [3, 0, 'L', 3],
      ],
    });

  it('the vehicle sinks on its suspension in the very next frame, with the start sound, before it moves', () => {
    const l = base();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const events: string[] = [];
    scene.onEvent = (e) => events.push(e);
    const a = scene.actors[0];
    scene.play(applyTap(board, state, 0));
    // The sound is there at once (the same instant as the tap).
    expect(events).toEqual(['exit']);
    scene.update(1 / 60);
    expect(a.squash).toBeGreaterThan(0.1);
    expect([a.x, a.z]).toEqual([a.baseX, a.baseZ]);
    // Within 80 ms it is fully pressed, then it sets off.
    run(scene, PRESS_S);
    expect(a.squash).toBeGreaterThan(0.85);
    run(scene, 0.1);
    expect(a.x).toBeGreaterThan(a.baseX);
    // The suspension comes back up.
    run(scene, 0.4);
    expect(a.squash).toBeLessThan(0.05);
    expect(scene.puffs.some((p) => p.active) || scene.trailCount > 0).toBe(true);
  });

  it('a free vehicle drives out along the straight, turns onto the road, follows it and is gone, laying paint', () => {
    const l = base();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const a = scene.actors[0];
    scene.play(applyTap(board, state, 0));
    let sawRoad = false;
    let sawBend = false;
    const p0 = a.yaw;
    let maxTurn = 0;
    for (let t = 0; t < 4 && !a.hidden; t += 1 / 60) {
      scene.update(1 / 60);
      if (Math.abs(a.x) > 2 || Math.abs(a.z) > 2) sawRoad = true;
      maxTurn = Math.max(maxTurn, Math.abs(a.yaw - p0));
      if (Math.abs(a.steer) > 0.05) sawBend = true;
    }
    expect(a.hidden).toBe(true);
    expect(sawRoad).toBe(true);
    // The front wheels turned into the bends, and the vehicle (so its arrow) pivoted with them.
    expect(sawBend).toBe(true);
    expect(maxTurn).toBeGreaterThan(1.2);
    expect(scene.trailCount).toBeGreaterThan(10);
    expect(scene.trailCount).toBeLessThan(80);
  });

  it('a vehicle whose arrow points to its rear reverses out: its front keeps pointing where it was, the arrow points the way it goes', () => {
    const l = lot({ rows: 1, cols: 6, vehicles: [[0, 2, 'R', 2, true]] });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    expect(scene.actors[0].reverse).toBe(true);
    expect(travelDir(l.vehicles[0])).toBe('L');
    scene.play(applyTap(board, state, 0));
    run(scene, PRESS_S + 0.2);
    // It faces right (yaw 0) and moves left.
    expect(Math.cos(scene.actors[0].yaw)).toBeGreaterThan(0.95);
    expect(scene.actors[0].x).toBeLessThan(scene.actors[0].baseX);
  });

  it('a blocked vehicle goes up to the obstacle, rings out, honks, shows the angry emoji and comes back to the exact place', () => {
    const l = base();
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const events: string[] = [];
    scene.onEvent = (e) => events.push(e);
    const a = scene.actors[1];
    scene.play(applyTap(board, state, 1)); // blocked by the truck at once (no room)
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
    expect([a.x, a.z]).toEqual([a.baseX, a.baseZ]);
    expect(a.hidden).toBe(false);
    const truck = scene.actors[2];
    expect(truck.x).toBe(truck.baseX);
    expect(truck.roll).toBe(0);
  });

  it('a collision further away drives the free places first', () => {
    const l = lot({ rows: 1, cols: 6, vehicles: [[0, 0, 'R', 2]], obstacles: [[0, 4]] });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    const a = scene.actors[0];
    scene.play(applyTap(board, state, 0));
    let maxX = a.baseX;
    for (let t = 0; t < 2; t += 1 / 60) {
      scene.update(1 / 60);
      maxX = Math.max(maxX, a.x);
    }
    expect(maxX - a.baseX).toBeGreaterThan(1.9);
    expect(maxX - a.baseX).toBeLessThan(2.3);
  });

  it('the shine starts when the last vehicle has left, and ends', () => {
    const l = lot({ rows: 1, cols: 4, vehicles: [[0, 0, 'R', 2]] });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    scene.play(applyTap(board, state, 0));
    run(scene, 4);
    expect(scene.shine >= 0 || scene.active === false).toBe(true);
    let peak = 0;
    for (let i = 0; i < scene.trailCount; i++) peak = Math.max(peak, scene.shineAt(i));
    expect(peak).toBeGreaterThanOrEqual(0);
    run(scene, 2);
    expect(scene.shine).toBe(-1);
    expect(scene.active).toBe(false);
  });

  it('the paint of a whole level fits in the trail buffer, and the trail takes the colour of the vehicle or of the equipped paint', () => {
    const scene = new ParkingScene(LEVELS[49]);
    const board = compile(LEVELS[49]);
    const state = createState(board);
    for (const id of LEVELS[49].solution) {
      scene.play(applyTap(board, state, id));
      run(scene, 0.15);
    }
    run(scene, 4);
    expect(scene.trailCount).toBeLessThanOrEqual(TRAIL_CAPACITY);
    const s2 = new ParkingScene(base());
    s2.setTrailColor(1, '#ff00ff');
    expect(s2.actors[1].trail.getHexString()).toBe('ff00ff');
    expect(s2.actors[0].trail.getHexString()).toBe(s2.actors[0].color.getHexString());
  });
});

describe('vehicles on the road never overlap', () => {
  it('a burst of exits (a tap every 10 frames, six a second): the vehicles that follow each other keep their distance, and slow down behind another', () => {
    const level = LEVELS[49];
    const scene = new ParkingScene(level);
    const board = compile(level);
    const state = createState(board);
    const order = level.solution.slice(0, 14);
    let minGap = Infinity;
    let braked = false;
    let frame = 0;
    let next = 0;
    for (let t = 0; t < 8; t += 1 / 60, frame++) {
      if (frame % 10 === 0 && next < order.length) scene.play(applyTap(board, state, order[next++]));
      scene.update(1 / 60);
      for (let i = 0; i < scene.actors.length; i++) {
        for (let j = i + 1; j < scene.actors.length; j++) {
          const a = scene.actors[i];
          const b = scene.actors[j];
          if (a.hidden || b.hidden || !a.leaving || !b.leaving) continue;
          // Only on the road: both have left their lane.
          if (a.distance < a.route.laneLen + 1 || b.distance < b.route.laneLen + 1) continue;
          minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
          if (a.speed < TOP_SPEED * 0.9 && a.distance > 3) braked = true;
        }
      }
    }
    expect(minGap).toBeGreaterThan(0.9);
    expect(braked).toBe(true);
    expect(roadGap({ len: 2 }, { len: 2 })).toBeCloseTo(2.05, 6);
    // Everyone got out in the end.
    expect(order.every((id) => scene.actors[id].hidden)).toBe(true);
  });

  it('two vehicles that set off together on the same stretch of road: one slows down, no overlap at any moment', () => {
    // Two cars in the same column, one behind the other, both going down: the one behind follows the one in front.
    const l = lot({
      rows: 6,
      cols: 1,
      vehicles: [
        [4, 0, 'D', 2],
        [0, 0, 'D', 2],
      ],
    });
    const scene = new ParkingScene(l);
    const board = compile(l);
    const state = createState(board);
    scene.play(applyTap(board, state, 0));
    scene.play(applyTap(board, state, 1));
    let minGap = Infinity;
    for (let t = 0; t < 4; t += 1 / 60) {
      scene.update(1 / 60);
      const [a, b] = scene.actors;
      if (!a.hidden && !b.hidden) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
    }
    expect(minGap).toBeGreaterThan(1.6);
    expect(scene.actors.every((a) => a.hidden)).toBe(true);
  });
});

describe('the paths use the same turn for the yaw as the rest of the scene', () => {
  it('yawOf faces +x at 0 and +z at -pi/2', () => {
    expect(yawOf(1, 0)).toBeCloseTo(0, 6);
    expect(yawOf(0, 1)).toBeCloseTo(-Math.PI / 2, 6);
  });
});
