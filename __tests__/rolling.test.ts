import { readFileSync } from 'fs';
import { join } from 'path';

import { ACCEL_SECONDS, arcHeading, arcPoint, CRUISE_SPEED, rolledDistance, rollSpeed, START_SPEED, TURN_R } from '../src/render/rolling';

const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');

describe('the speed of the ball', () => {
  it('accelerates for about 80 ms with an ease-out, then stays constant', () => {
    expect(ACCEL_SECONDS).toBeCloseTo(0.08, 5);
    expect(rollSpeed(0)).toBe(START_SPEED);
    expect(rollSpeed(ACCEL_SECONDS)).toBe(CRUISE_SPEED);
    let prev = 0;
    let prevGain = Infinity;
    for (let t = 0.005; t <= ACCEL_SECONDS + 1e-9; t += 0.005) {
      const v = rollSpeed(t);
      expect(v).toBeGreaterThanOrEqual(prev); // it only speeds up
      const gain = v - rollSpeed(t - 0.005);
      expect(gain).toBeLessThanOrEqual(prevGain + 1e-9); // ease-out: the gain shrinks
      prevGain = gain;
      prev = v;
    }
    for (const t of [0.1, 0.3, 1, 5]) expect(rollSpeed(t)).toBe(CRUISE_SPEED);
  });

  it('the position is the integral of the speed, whatever the frame rate', () => {
    const at = (fps: number, seconds: number) => {
      let t = 0;
      let d = 0;
      const dt = 1 / fps;
      while (t < seconds - 1e-9) {
        d += rolledDistance(t + dt) - rolledDistance(t);
        t += dt;
      }
      return d;
    };
    // the same distance at 30, 60, 120 and 240 fps (and a jerky frame rate)
    const ref = rolledDistance(0.5);
    for (const fps of [20, 30, 60, 120, 240]) expect(at(fps, 0.5)).toBeCloseTo(ref, 6);
    let t = 0;
    let d = 0;
    for (const dt of [0.016, 0.05, 0.008, 0.033, 0.016, 0.016, 0.1, 0.021, 0.04, 0.2]) {
      d += rolledDistance(t + dt) - rolledDistance(t);
      t += dt;
    }
    expect(d).toBeCloseTo(rolledDistance(t), 6);
    // and it matches the speed: a numerical integral of rollSpeed
    let num = 0;
    for (let k = 0; k < 20000; k++) num += rollSpeed((k + 0.5) * 0.00005) * 0.00005;
    expect(rolledDistance(1)).toBeCloseTo(num, 3);
  });

  it('there is no jump: the distance rolled only grows, with no step between two frames', () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 1 / 240) {
      const d = rolledDistance(t);
      expect(d - prev).toBeLessThan(CRUISE_SPEED / 240 + 1e-9);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('the arc of a bend', () => {
  // coming in going right (+x), going out downwards (+z), through the tile centred on (0, 0)
  const inX = 1;
  const inZ = 0;
  const outX = 0;
  const outZ = 1;
  const cx = -inX * TURN_R + outX * TURN_R;
  const cz = -inZ * TURN_R + outZ * TURN_R;

  it('joins the two straight runs: it starts half a tile before the middle and ends half a tile after it', () => {
    const start = arcPoint(cx, cz, inX, inZ, outX, outZ, 0);
    const end = arcPoint(cx, cz, inX, inZ, outX, outZ, 1);
    expect(start.x).toBeCloseTo(-0.5, 9);
    expect(start.z).toBeCloseTo(0, 9);
    expect(end.x).toBeCloseTo(0, 9);
    expect(end.z).toBeCloseTo(0.5, 9);
  });

  it('is a circle of constant radius, and the heading turns continuously from the way in to the way out', () => {
    let prev = arcPoint(cx, cz, inX, inZ, outX, outZ, 0);
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const p = arcPoint(cx, cz, inX, inZ, outX, outZ, u);
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeCloseTo(TURN_R, 9);
      const h = arcHeading(inX, inZ, outX, outZ, u);
      expect(Math.hypot(h.x, h.z)).toBeCloseTo(1, 9);
      // the heading is along the path
      const step = { x: p.x - prev.x, z: p.z - prev.z };
      if (u > 0.06) expect(step.x * h.x + step.z * h.z).toBeGreaterThan(0);
      prev = p;
    }
    expect(arcHeading(inX, inZ, outX, outZ, 0)).toEqual({ x: 1, z: 0 });
    const last = arcHeading(inX, inZ, outX, outZ, 1);
    expect(last.x).toBeCloseTo(0, 9);
    expect(last.z).toBeCloseTo(1, 9);
  });
});

describe('the ball is always a perfect sphere', () => {
  it('nothing in the scene ever sets the scale of the ball: not rolling, not at a wall, not through a bend or a portal, not on the bridge', () => {
    const ball = read('render/Ball.tsx');
    expect(ball).not.toMatch(/\.scale\b/);
    expect(ball).not.toMatch(/scale=/);
    expect(ball).not.toMatch(/SQUASH|STRETCH|easeOutBack/);
    const director = read('render/Director.tsx');
    expect(director).not.toMatch(/ball\.group\.scale|bus\.ball\.group\.scale/);
    expect(director).not.toMatch(/landSquash/);
    // the ball body is drawn in a group that carries the position, and the roll turns the body inside it
    expect(ball).toMatch(/<group ref=\{group\}[\s\S]*<mesh ref=\{body\}/);
    expect(ball).toMatch(/len \/ BALL_R/);
  });

  it('the shop preview and the map ball use a bigger sphere, not a scaled one', () => {
    const shop = read('render/ShopPreview.tsx');
    expect(shop).not.toMatch(/<group ref=\{ballGroup\}[^>]*scale/);
    expect(shop).toContain('radius={PREVIEW_R}');
    const map = read('render/map/mapObjects.tsx');
    expect(map).not.toMatch(/sx \*|sy \*/);
  });

  it('the impact is felt through the splash, the vibration and the sound, and nothing shakes', () => {
    const ball = read('render/Ball.tsx');
    expect(ball).toContain('particles.impact(');
    // nothing shakes the camera or the walls
    expect(ball).not.toContain('shake(');
    expect(read('render/Director.tsx')).not.toMatch(/shake/i);
    expect(read('render/bus.ts')).not.toMatch(/shake/i);
    expect(ball).toContain("bus.onEvent?.('impact'");
  });
});
