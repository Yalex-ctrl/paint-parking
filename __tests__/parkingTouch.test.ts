import * as THREE from 'three';

import { LEVELS } from '../src/game/levels';
import { CAMERA_TILT_DEG, fitCamera } from '../src/render/cameraFit';
import { cellX, cellZ } from '../src/render/coords';
import { NEAR_POINTS, PICK_GROW, pickAt, rayBox, toCanvas, type Pickable } from '../src/render/pick';
import { ParkingScene } from '../src/render/ParkingScene';
import { WIDTH } from '../src/render/vehicleGeometry';
import { vehicleCells, type Level } from '../src/game/types';

const margins = { top: 200, bottom: 120 };
/** Five levels of different sizes: 4x5, 5x6, 6x7, 7x9 and 8x11 places. */
const FIVE = [LEVELS[0], LEVELS[3], LEVELS[8], LEVELS[24], LEVELS[49]];

function camera(level: Level, w: number, h: number) {
  const cam = new THREE.PerspectiveCamera();
  fitCamera(cam, level, w, h, { top: margins.top * (h / 844), bottom: margins.bottom * (h / 844) });
  return cam;
}

/** The vehicles as the scene has them (the same objects the picking reads on the phone). */
const pickables = (level: Level): Pickable[] => new ParkingScene(level).actors;

/** A point of a vehicle in the world, from fractions (-0.5..0.5) of its length and width, at a height. */
function onVehicle(level: Level, id: number, along: number, across: number, y: number) {
  const v = level.vehicles[id];
  const cells = vehicleCells(v);
  const cx = cells.reduce((s, [, c]) => s + cellX(level, c), 0) / cells.length;
  const cz = cells.reduce((s, [r]) => s + cellZ(level, r), 0) / cells.length;
  const length = v.len * 0.9;
  const horizontal = v.dir === 'L' || v.dir === 'R';
  return new THREE.Vector3(cx + (horizontal ? along * length : across * WIDTH), y, cz + (horizontal ? across * WIDTH : along * length));
}

describe('which vehicle a touch is on (a ray from the camera of the scene against the box of each vehicle)', () => {
  for (const [w, h] of [
    [390, 844],
    [320, 568],
  ]) {
    it(`the middle of the roof of every vehicle of five levels, on a ${w} x ${h} screen, selects that vehicle`, () => {
      for (const level of FIVE) {
        const cam = camera(level, w, h);
        const list = pickables(level);
        for (const v of level.vehicles) {
          const roof = onVehicle(level, v.id, 0, 0, v.len === 3 ? 0.745 : 0.575);
          const px = toCanvas(cam, w, h, roof.x, roof.y, roof.z);
          const picked = pickAt(cam, w, h, px.x, px.y, list);
          expect({ level: level.id, size: `${level.cols}x${level.rows}`, vehicle: v.id, picked: picked.vehicle }).toEqual({ level: level.id, size: `${level.cols}x${level.rows}`, vehicle: v.id, picked: v.id });
        }
      }
    });

    it(`the four corners of every vehicle (15 % from its edges), on a ${w} x ${h} screen, select that vehicle`, () => {
      let tried = 0;
      for (const level of FIVE) {
        const cam = camera(level, w, h);
        const list = pickables(level);
        for (const v of level.vehicles) {
          for (const along of [-0.35, 0.35]) {
            for (const across of [-0.35, 0.35]) {
              const p = onVehicle(level, v.id, along, across, 0.3);
              const px = toCanvas(cam, w, h, p.x, p.y, p.z);
              const picked = pickAt(cam, w, h, px.x, px.y, list);
              tried++;
              expect({ level: level.id, vehicle: v.id, along, across, picked: picked.vehicle }).toEqual({ level: level.id, vehicle: v.id, along, across, picked: v.id });
            }
          }
        }
      }
      expect(tried).toBeGreaterThan(250);
    });
  }

  it('a touch on a roof takes the vehicle, not the empty place a ground projection would find a place or so higher on the screen', () => {
    const level = LEVELS[29];
    const cam = camera(level, 390, 844);
    const list = pickables(level);
    // The roof of a vehicle as the finger sees it: projected to the screen, the point is NOT where the ground under it is.
    const v = level.vehicles[0];
    const roof = onVehicle(level, v.id, 0, 0, 0.575);
    const roofPx = toCanvas(cam, 390, 844, roof.x, roof.y, roof.z);
    const groundPx = toCanvas(cam, 390, 844, roof.x, 0, roof.z);
    expect(roofPx.y).toBeLessThan(groundPx.y - 8);
    expect(pickAt(cam, 390, 844, roofPx.x, roofPx.y, list).vehicle).toBe(v.id);
  });

  it('the nearest vehicle to the camera wins when two boxes are on the line of sight', () => {
    const list: Pickable[] = [
      { id: 0, x: 0, z: 0, yaw: 0, len: 2, hidden: false },
      { id: 1, x: 0, z: 0.3, yaw: 0, len: 2, hidden: false },
    ];
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    cam.position.set(0, 6, 6);
    cam.lookAt(0, 0.3, 0.15);
    cam.updateMatrixWorld(true);
    const px = toCanvas(cam, 400, 400, 0, 0.3, 0.15);
    // Both boxes contain the point; the one with the larger z is nearer to a camera at z = 6.
    expect(pickAt(cam, 400, 400, px.x, px.y, list).vehicle).toBe(1);
  });

  it('a vehicle that has left, or is leaving, takes no touch: the one behind it does', () => {
    const list: Pickable[] = [
      { id: 0, x: 0, z: 0, yaw: 0, len: 2, hidden: false, leaving: true },
      { id: 1, x: 0, z: -0.2, yaw: 0, len: 2, hidden: false },
      { id: 2, x: 0, z: 0, yaw: 0, len: 2, hidden: true },
    ];
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    cam.position.set(0, 6, 6);
    cam.lookAt(0, 0.3, 0);
    cam.updateMatrixWorld(true);
    const px = toCanvas(cam, 400, 400, 0, 0.3, 0);
    expect(pickAt(cam, 400, 400, px.x, px.y, list).vehicle).toBe(1);
  });

  it('a touch that misses every box takes the vehicle whose middle is nearest on the screen, if within 40 points, else none', () => {
    expect(NEAR_POINTS).toBe(40);
    const level = LEVELS[29];
    const cam = camera(level, 390, 844);
    const list = pickables(level);
    const v = level.vehicles[5];
    const mid = onVehicle(level, v.id, 0, 0, 0.31);
    const px = toCanvas(cam, 390, 844, mid.x, mid.y, mid.z);
    // Far above the lot: nothing there.
    expect(pickAt(cam, 390, 844, 195, 5, list)).toMatchObject({ vehicle: -1, via: 'none' });
    // Just outside the boxes of every vehicle, near the one at the edge of the lot.
    const edge = level.vehicles.find((x) => x.r === 0 && x.dir !== 'U' && x.dir !== 'D') ?? level.vehicles[0];
    const e = onVehicle(level, edge.id, 0, 0, 0.3);
    const epx = toCanvas(cam, 390, 844, e.x, e.y, e.z - 0.9);
    const near = pickAt(cam, 390, 844, epx.x, epx.y - 20, list);
    expect(['ray', 'near', 'none']).toContain(near.via);
    expect(px.x).toBeGreaterThan(0);
  });

  it('the box is the vehicle 10 % bigger each way, from the ground to the top of the roof', () => {
    expect(PICK_GROW).toBeCloseTo(1.1, 6);
    const car: Pickable = { id: 0, x: 0, z: 0, yaw: 0, len: 2, hidden: false };
    // From above, straight down: inside the grown length and width, outside beyond.
    const down = (x: number, z: number) => rayBox(x, 5, z, 0, -1, 0, car);
    expect(down(0.9 * 1.1 - 0.01, 0)).toBeCloseTo(5 - 0.62 * 1.1, 6);
    expect(down(0.9 * 1.1 + 0.02, 0)).toBe(Infinity);
    expect(down(0, 0.39 * 1.1 - 0.01)).toBeLessThan(Infinity);
    expect(down(0, 0.39 * 1.1 + 0.02)).toBe(Infinity);
    // A vehicle turned a quarter turn: its length runs along z.
    const turned: Pickable = { ...car, yaw: Math.PI / 2 };
    expect(rayBox(0, 5, 0.9, 0, -1, 0, turned)).toBeLessThan(Infinity);
    expect(rayBox(0, 5, 1.3, 0, -1, 0, turned)).toBe(Infinity);
  });
});

describe('the view', () => {
  it('is the tilted 3D view of Paint Maze (55 to 60 degrees to the ground), not a view from above', () => {
    expect(CAMERA_TILT_DEG).toBeGreaterThanOrEqual(55);
    expect(CAMERA_TILT_DEG).toBeLessThanOrEqual(60);
    const cam = camera(LEVELS[20], 390, 844);
    const look = new THREE.Vector3();
    cam.getWorldDirection(look);
    expect((Math.asin(-look.y) * 180) / Math.PI).toBeCloseTo(CAMERA_TILT_DEG, 3);
  });

  it('a vehicle is 78 % of a place wide and 90 % of its length long: the asphalt shows round it', () => {
    expect(WIDTH).toBeCloseTo(0.78, 5);
  });

  it('the lot fills the width of the screen (a tall lot is limited by the height of the free band)', () => {
    for (const level of [LEVELS[0], LEVELS[14], LEVELS[49]]) {
      const cam = camera(level, 390, 844);
      const left = toCanvas(cam, 390, 844, -level.cols / 2, 0, level.rows / 2);
      const right = toCanvas(cam, 390, 844, level.cols / 2, 0, level.rows / 2);
      const share = (right.x - left.x) / 390;
      expect(share).toBeGreaterThan(level.rows >= 8 ? 0.65 : 0.72);
      expect(share).toBeLessThan(0.96);
    }
  });

  it('the arrow on a roof stays readable even in the biggest lot on a small phone (iPhone SE)', () => {
    const level = LEVELS[49];
    const cam = new THREE.PerspectiveCamera();
    fitCamera(cam, level, 320, 568, { top: 20 + 143 + 24, bottom: 140 });
    const a = toCanvas(cam, 320, 568, 0, 0.58, 0);
    const length = toCanvas(cam, 320, 568, 0.44 * 1.12, 0.58, 0);
    const width = toCanvas(cam, 320, 568, 0, 0.58, 0.25 * 1.12);
    expect(Math.abs(length.x - a.x) * 2).toBeGreaterThanOrEqual(22);
    expect(Math.abs(width.y - a.y) * 2).toBeGreaterThanOrEqual(8);
  });
});
