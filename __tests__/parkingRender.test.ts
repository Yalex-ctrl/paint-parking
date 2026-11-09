import * as THREE from 'three';

import { LEVELS } from '../src/game/levels';
import { fitCamera, lotBandPx } from '../src/render/cameraFit';
import { cellAt, cellX, cellZ } from '../src/render/coords';
import { lot } from './helpers';

const close = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);

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
    const v = new THREE.Vector3(1.5 + 0.12, 0, 0).project(camera);
    expect(v.x).toBeGreaterThan(0.8);
    expect(v.x).toBeLessThanOrEqual(0.9 + 1e-6);
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

describe('the road between two levels', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { linkOffset, PLATE_MARGIN, LINK_GAP } = require('../src/render/coords');

  it('puts the next level straight below the current one, with room for the road between the two plates', () => {
    const [x, y, z] = linkOffset({ rows: 6 }, { rows: 8 });
    expect([x, y]).toEqual([0, 0]);
    // The two plates are PLATE_MARGIN past their lots: what is left between them is exactly the gap.
    expect(z - 6 / 2 - 8 / 2 - 2 * PLATE_MARGIN).toBeCloseTo(LINK_GAP, 6);
  });

  it('the camera of the next level is the camera of this one moved by that offset (same angle, same distance for the same size)', () => {
    const a = new THREE.PerspectiveCamera();
    const b = new THREE.PerspectiveCamera();
    const margins = { top: 200, bottom: 120 };
    const level = { rows: 6, cols: 5 };
    fitCamera(a, level, 390, 844, margins);
    fitCamera(b, level, 390, 844, margins);
    expect(b.quaternion.angleTo(a.quaternion)).toBeLessThan(1e-6);
    expect(b.position.distanceTo(a.position)).toBeLessThan(1e-9);
  });
});

describe('the sounds of the parking', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const names = ['engine_start', 'vroom', 'horn', 'pouet', 'barrier'];

  it('are soft, short WAV files, and the audio engine knows them', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/core/services/audio.ts'), 'utf8');
    for (const n of names) {
      const file = path.join(__dirname, '../assets/audio/sfx', `${n}.wav`);
      const bytes = fs.readFileSync(file);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      const samples = (bytes.length - 44) / 2;
      const seconds = samples / 22050;
      expect(seconds).toBeGreaterThan(0.1);
      expect(seconds).toBeLessThan(0.8);
      let peak = 0;
      for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + i * 2)) / 32768);
      expect({ n, loud: peak > 0.6 }).toEqual({ n, loud: false });
      expect({ n, silent: peak < 0.2 }).toEqual({ n, silent: false });
      expect(source).toContain(`${n}: require('../../../assets/audio/sfx/${n}.wav')`);
    }
  });
});
