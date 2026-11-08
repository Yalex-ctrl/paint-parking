import * as THREE from 'three';

import { createState, compile } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import { vehicleCells } from '../src/game/types';
import { CAMERA_TILT_DEG, fitCamera } from '../src/render/cameraFit';
import { cellX, cellZ } from '../src/render/coords';
import { PICK_TOLERANCE, pickVehicle, screenToGround } from '../src/render/pick';
import { WIDTH } from '../src/render/vehicleGeometry';
import { lot } from './helpers';

const margins = { top: 200, bottom: 120 };
const project = (camera: THREE.Camera, w: number, h: number, x: number, y: number, z: number) => {
  const p = new THREE.Vector3(x, y, z).project(camera);
  return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
};

describe('which vehicle a touch is on', () => {
  const level = lot({
    rows: 3,
    cols: 4,
    vehicles: [
      [0, 0, 'R', 2],
      [1, 2, 'D', 2],
    ],
  });
  const state = { gone: new Uint8Array(2) };

  it('a touch on a vehicle takes it', () => {
    // The lot is centred on the origin: place (0, 0) is x in [-2, -1], z in [-1.5, -0.5].
    expect(pickVehicle(level, state, -1.5, -1)).toBe(0);
    expect(pickVehicle(level, state, -0.6, -0.9)).toBe(0);
    expect(pickVehicle(level, state, 0.5, 0.1)).toBe(1);
  });

  it('a touch within 0.3 of the edge of a vehicle takes it too, further away takes nothing', () => {
    expect(PICK_TOLERANCE).toBe(0.3);
    // Just below the first vehicle (it ends at z = -0.5): 0.25 away is inside the tolerance, 0.4 away is not.
    expect(pickVehicle(level, state, -1.5, -0.5 + 0.25)).toBe(0);
    expect(pickVehicle(level, state, -1.5, -0.5 + 0.4)).toBe(-1);
    // An empty place far from everything.
    expect(pickVehicle(level, state, -1.5, 1.3)).toBe(-1);
  });

  it('takes the nearest vehicle when two are within the tolerance, and ignores a vehicle that has left', () => {
    // Between the two vehicles, closer to the second.
    expect(pickVehicle(level, state, 0.1, -0.35)).toBe(1);
    expect(pickVehicle(level, { gone: Uint8Array.from([0, 1]) }, 0.5, 0.1)).toBe(-1);
    expect(pickVehicle(level, { gone: Uint8Array.from([1, 0]) }, -1.5, -1)).toBe(-1);
  });
});

describe('from the screen to the vehicle (what the gesture handler gives, through the camera)', () => {
  it('finds the ground point under a pixel: the exact inverse of the projection', () => {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, LEVELS[10], 390, 844, margins);
    for (const [x, z] of [
      [0, 0],
      [1.5, -2],
      [-2, 3],
    ]) {
      const px = project(camera, 390, 844, x, 0.3, z);
      const ground = screenToGround(camera, 390, 844, px.x, px.y)!;
      expect(ground.x).toBeCloseTo(x, 4);
      expect(ground.z).toBeCloseTo(z, 4);
    }
  });

  it('a touch on the middle of any vehicle of any level picks that vehicle, on a big phone and on an iPhone SE', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const camera = new THREE.PerspectiveCamera();
      for (const level of [LEVELS[0], LEVELS[14], LEVELS[29], LEVELS[49]]) {
        fitCamera(camera, level, w, h, { top: margins.top * (h / 844), bottom: margins.bottom * (h / 844) });
        const state = createState(compile(level));
        for (const v of level.vehicles) {
          const cells = vehicleCells(v);
          const x = cells.reduce((s, [, c]) => s + cellX(level, c), 0) / cells.length;
          const z = cells.reduce((s, [r]) => s + cellZ(level, r), 0) / cells.length;
          // The middle of the roof, as the finger sees it.
          const px = project(camera, w, h, x, 0.55, z);
          const ground = screenToGround(camera, w, h, px.x, px.y)!;
          expect({ level: level.id, v: v.id, picked: pickVehicle(level, state, ground.x, ground.z) }).toEqual({ level: level.id, v: v.id, picked: v.id });
        }
      }
    }
  });
});

describe('the view', () => {
  it('is the tilted 3D view of Paint Maze (55 to 60 degrees to the ground), not a view from above', () => {
    expect(CAMERA_TILT_DEG).toBeGreaterThanOrEqual(55);
    expect(CAMERA_TILT_DEG).toBeLessThanOrEqual(60);
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, LEVELS[20], 390, 844, margins);
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    expect((Math.asin(-look.y) * 180) / Math.PI).toBeCloseTo(CAMERA_TILT_DEG, 3);
  });

  it('a vehicle is 78 % of a place wide and 90 % of its length long: the asphalt shows round it', () => {
    expect(WIDTH).toBeCloseTo(0.78, 5);
  });

  it('the lot fills about 90 % of the width of the screen (the lot itself, sidewalk apart; a tall lot is limited by the height of the free band)', () => {
    for (const level of [LEVELS[0], LEVELS[14], LEVELS[49]]) {
      const camera = new THREE.PerspectiveCamera();
      fitCamera(camera, level, 390, 844, margins);
      const left = project(camera, 390, 844, -level.cols / 2, 0, level.rows / 2);
      const right = project(camera, 390, 844, level.cols / 2, 0, level.rows / 2);
      const share = (right.x - left.x) / 390;
      expect(share).toBeGreaterThan(level.rows >= 8 ? 0.65 : 0.72);
      expect(share).toBeLessThan(0.95);
    }
  });

  it('the arrow on a roof stays readable even in the biggest lot on a small phone (iPhone SE)', () => {
    const level = LEVELS[49];
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, level, 320, 568, { top: 20 + 143 + 24, bottom: 140 });
    // The arrow is 0.88 long (drawn 1.12 times bigger) and 0.5 wide, laid on a roof 0.575 high.
    const a = project(camera, 320, 568, 0, 0.58, 0);
    const length = project(camera, 320, 568, 0.44 * 1.12, 0.58, 0);
    const width = project(camera, 320, 568, 0, 0.58, 0.25 * 1.12);
    const lengthPx = Math.abs(length.x - a.x) * 2;
    const widthPx = Math.abs(width.y - a.y) * 2;
    expect(lengthPx).toBeGreaterThanOrEqual(22);
    expect(widthPx).toBeGreaterThanOrEqual(8);
  });
});
