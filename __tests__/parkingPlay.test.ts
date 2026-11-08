import * as THREE from 'three';

import { applyTap, compile, createState } from '../src/game/engine';
import { nextHint } from '../src/game/guide';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { LEVELS } from '../src/game/levels';
import { vehicleCells, type Level } from '../src/game/types';
import { fitCamera } from '../src/render/cameraFit';
import { cellX, cellZ } from '../src/render/coords';
import { decorKey, planDecor } from '../src/render/decorPlan';
import { ParkingScene } from '../src/render/ParkingScene';
import { pickVehicle, screenToGround } from '../src/render/pick';
import { nextStage } from '../src/render/stage';

/** The pixel where a finger would land on the roof of a vehicle. */
function fingerOn(camera: THREE.Camera, level: Level, id: number, w: number, h: number) {
  const cells = vehicleCells(level.vehicles[id]);
  const x = cells.reduce((s, [, c]) => s + cellX(level, c), 0) / cells.length;
  const z = cells.reduce((s, [r]) => s + cellZ(level, r), 0) / cells.length;
  const p = new THREE.Vector3(x, 0.55, z).project(camera);
  return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
}

/**
 * What the screen does with a touch, without the screen: the pixel goes through the camera onto the ground, then to a vehicle, then
 * the rules and the scene (the same chain as GameScreen.vehicleAt / act).
 */
function play(level: Level, w: number, h: number) {
  const camera = new THREE.PerspectiveCamera();
  fitCamera(camera, level, w, h, { top: h * 0.23, bottom: h * 0.15 });
  const board = compile(level);
  const state = createState(board);
  const scene = new ParkingScene(level);
  const touch = (x: number, y: number) => {
    const ground = screenToGround(camera, w, h, x, y);
    const id = ground ? pickVehicle(level, state, ground.x, ground.z) : -1;
    if (id < 0 || scene.isBusy(id)) return null;
    const result = applyTap(board, state, id);
    scene.play(result);
    return result;
  };
  return { camera, board, state, scene, touch };
}

type Game = ReturnType<typeof play>;

/** Would a tap on this vehicle make it leave right now? (tried on a copy of the state) */
function wouldLeave(g: Game, id: number): boolean {
  const copy = { ...g.state, occ: g.state.occ.slice(), gone: g.state.gone.slice() };
  return applyTap(g.board, copy, id).kind === 'exit';
}

describe('playing a level by taps only (the touch goes all the way: pixel, ground, vehicle, rules, scene)', () => {
  for (const id of [1, 5, 15, 30]) {
    it(`level ${id} is finished by taps on the vehicles the help points at, with no collision`, () => {
      const level = LEVELS[id - 1];
      const g = play(level, 390, 844);
      let guard = 0;
      while (!g.state.finished && guard++ < 100) {
        const hint = nextHint(g.board, g.state)!;
        const px = fingerOn(g.camera, level, hint.vehicle, 390, 844);
        expect(g.touch(px.x, px.y)).toMatchObject({ kind: 'exit', vehicle: hint.vehicle });
        // The scene moves on a little between two taps.
        for (let t = 0; t < 8; t++) g.scene.update(1 / 60);
      }
      expect(g.state.finished).toBe(true);
      expect(g.state.collisions).toBe(0);
      expect(g.state.moves).toBe(level.optimal);
      for (let t = 0; t < 400; t++) g.scene.update(1 / 60);
      expect(g.scene.actors.every((a) => a.hidden)).toBe(true);
      expect(g.scene.shine >= 0 || g.scene.trailCount > 0).toBe(true);
    });
  }

  it('every level and every challenge can be finished by taps on an iPhone SE too', () => {
    for (const level of [...LEVELS, ...DAILY_LEVELS]) {
      const g = play(level, 320, 568);
      for (const id of level.solution) {
        const px = fingerOn(g.camera, level, id, 320, 568);
        expect({ level: level.id, id, kind: g.touch(px.x, px.y)?.kind }).toEqual({ level: level.id, id, kind: 'exit' });
      }
      expect({ level: level.id, finished: g.state.finished, collisions: g.state.collisions }).toEqual({ level: level.id, finished: true, collisions: 0 });
    }
  });

  it('a tap on a blocked vehicle is a collision: one move, the vehicle goes up to the obstacle and comes back', () => {
    const level = LEVELS[29];
    const g = play(level, 390, 844);
    const blocked = level.vehicles.find((v) => !wouldLeave(g, v.id))!;
    const px = fingerOn(g.camera, level, blocked.id, 390, 844);
    expect(g.touch(px.x, px.y)?.kind).toBe('bump');
    expect(g.state.collisions).toBe(1);
    expect(g.state.moves).toBe(1);
    expect(g.scene.isBusy(blocked.id)).toBe(true);
    for (let t = 0; t < 240; t++) g.scene.update(1 / 60);
    const a = g.scene.actors[blocked.id];
    expect(a.busy).toBe(false);
    expect(a.hidden).toBe(false);
    expect([a.x, a.z]).toEqual([a.baseX, a.baseZ]);
  });

  it('taps follow each other very fast on different vehicles (a burst of exits); a tap on a vehicle that is still moving is ignored', () => {
    const level = LEVELS[29];
    const g = play(level, 390, 844);
    const free = level.solution.slice(0, 4);
    // Four different vehicles in four frames.
    const results = free.map((id) => {
      const px = fingerOn(g.camera, level, id, 390, 844);
      const r = g.touch(px.x, px.y);
      g.scene.update(1 / 60);
      return r;
    });
    expect(results.map((r) => r?.kind)).toEqual(['exit', 'exit', 'exit', 'exit']);
    expect(g.state.moves).toBe(4);
    // The same vehicle again while it is leaving, or already gone: nothing happens, no move counted.
    const again = fingerOn(g.camera, level, free[0], 390, 844);
    expect(g.touch(again.x, again.y)).toBeNull();
    expect(g.state.moves).toBe(4);
  });

  it('a tap that misses every vehicle does nothing', () => {
    const g = play(LEVELS[0], 390, 844);
    expect(g.touch(5, 5)).toBeNull();
    expect(g.state.moves).toBe(0);
  });
});

describe('no two children share a React key', () => {
  it('the scenery: every piece of every level has its own key', () => {
    for (const level of [...LEVELS, ...DAILY_LEVELS]) {
      const byModel = new Map<string, number>();
      for (const p of planDecor(level)) byModel.set(p.name, (byModel.get(p.name) ?? 0) + 1);
      const keys: string[] = [];
      for (const [name, count] of byModel) for (let part = 0; part < 6; part++) keys.push(decorKey(name, part, count));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('the lot to come is never mounted a second time when it has become the current one', () => {
    const a = new ParkingScene(LEVELS[0]);
    const b = new ParkingScene(LEVELS[1]);
    expect(a.uid).not.toBe(b.uid);
    expect(nextStage({ level: LEVELS[0], scene: a }, { level: LEVELS[1], scene: b }, false)?.scene.uid).toBe(b.uid);
    // The moment of the switch: the prepared level is the current one, and still remembered as the next.
    expect(nextStage({ level: LEVELS[1], scene: b }, { level: LEVELS[1], scene: b }, false)).toBeNull();
    // A restart makes another scene of the same level: another key.
    expect(new ParkingScene(LEVELS[0]).uid).not.toBe(a.uid);
    expect(nextStage({ level: LEVELS[0], scene: a }, null, false)).toBeNull();
    expect(nextStage({ level: LEVELS[0], scene: a }, { level: LEVELS[1], scene: b }, true)).toBeNull();
  });

  it('the keys of the canvas are built from stable ids (no index of a list that changes)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const canvas = fs.readFileSync(path.join(__dirname, '../src/render/ParkingCanvas.tsx'), 'utf8');
    expect(canvas).toContain('key={scene.uid}');
    expect(canvas).toContain('key={next.scene.uid}');
    expect(canvas).toContain('key={decorKey(');
    expect(canvas).not.toMatch(/key=\{i\} level=/);
  });
});
