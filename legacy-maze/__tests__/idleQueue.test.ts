import { flushIdleQueue, holdIdle, idleQueueLength, isIdleHeld, releaseIdle, resetIdleQueue, runWhenIdle } from '../src/core/services/idleQueue';
import { describeFrame, traceEnd, traceFrame, traceHistory, traceReset, traceStart, traceWork, traced, tracing } from '../src/core/render/transitionTrace';
import { setWarmIdle, setWarmPaused } from '../src/render/prepareCache';
import { sharedPaintMaterial } from '../src/render/paintEffects';
import { markTexel, X2_STROKES, distanceToMark, popScale, pulseScale, MARK_SIZE } from '../src/render/x2Mark';
import { createRng } from '../src/core/rng';
import { applyMove, createState } from '../src/game/engine';
import { makeLevel } from './helpers';

describe('work that waits for the ball to have landed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetIdleQueue();
  });
  afterEach(() => {
    resetIdleQueue();
    jest.useRealTimers();
  });

  it('runs when nothing holds it, one piece at a time, never inside the caller', () => {
    const ran: number[] = [];
    runWhenIdle(() => ran.push(1));
    runWhenIdle(() => ran.push(2));
    expect(ran).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(ran).toEqual([1]);
    jest.advanceTimersByTime(30);
    expect(ran).toEqual([1, 2]);
  });

  it('waits while the ball crosses, then runs after it has landed, spread out', () => {
    const ran: string[] = [];
    holdIdle();
    expect(isIdleHeld()).toBe(true);
    runWhenIdle(() => ran.push('save'));
    runWhenIdle(() => ran.push('analytics'));
    runWhenIdle(() => ran.push('free the old board'));
    jest.advanceTimersByTime(5000); // the whole crossing: nothing runs
    expect(ran).toEqual([]);
    expect(idleQueueLength()).toBe(3);
    releaseIdle(350);
    jest.advanceTimersByTime(300);
    expect(ran).toEqual([]); // the new level gets a moment to be on screen first
    jest.advanceTimersByTime(60);
    expect(ran).toEqual(['save']);
    jest.advanceTimersByTime(24);
    expect(ran).toEqual(['save', 'analytics']);
    jest.advanceTimersByTime(24);
    expect(ran).toEqual(['save', 'analytics', 'free the old board']);
  });

  it('a hold that is never released lets go by itself, and a failing job does not stop the others', () => {
    const ran: string[] = [];
    holdIdle();
    runWhenIdle(() => {
      throw new Error('boom');
    });
    runWhenIdle(() => ran.push('after'));
    jest.advanceTimersByTime(8100);
    jest.advanceTimersByTime(100);
    expect(ran).toEqual(['after']);
  });

  it('can be flushed at once (the app goes to the background)', () => {
    const ran: number[] = [];
    holdIdle();
    runWhenIdle(() => ran.push(1));
    runWhenIdle(() => ran.push(2));
    flushIdleQueue();
    expect(ran).toEqual([1, 2]);
  });

  it('the screen holds it from the exit to the landing, and the saves go through it', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
    const game = read('screens/GameScreen.tsx');
    expect(game).toMatch(/holdIdle\(\);\s*setWarmPaused\(true\)/);
    expect(game).toMatch(/releaseIdle\(\);\s*setWarmPaused\(false\)/);
    expect(read('storage/profile.ts')).toContain('runWhenIdle(() => void save())');
    expect(read('storage/progress.ts')).toContain('runWhenIdle(');
    // nothing is awaited in the victory: the progress is read once, in memory
    expect(game).toMatch(/peekProgress\(\) \?\? \(await loadProgress\(\)\)/);
  });
});

describe('the trace of a transition', () => {
  beforeEach(() => traceReset());

  it('records nothing outside a transition, and lists the slow frames with what ran in them', () => {
    traceWork('ignored', 5);
    expect(tracing()).toBe(false);
    traceStart();
    expect(tracing()).toBe(true);
    traceFrame(0.016, { programs: 5, geometries: 10, textures: 4 });
    const t0 = performance.now();
    traced('settleVictory', () => {
      for (let i = 0; i < 1000; i++) Math.sqrt(i);
    });
    traceFrame(0.09, { programs: 6, geometries: 13, textures: 4 });
    const r = traceEnd('test');
    expect(r.frames).toBe(2);
    expect(r.slow).toBe(1);
    expect(r.worst).toBeCloseTo(90, 0);
    expect(tracing()).toBe(false);
    expect(traceHistory()).toHaveLength(1);
    void t0;
  });

  it('describes a frame: its JS work and the GPU work (programs, geometries and textures uploaded)', () => {
    const f = { end: 1000, ms: 80, programs: 1, geometries: 3, textures: 2 };
    const text = describeFrame(4, f, [{ at: 990, name: 'save', ms: 30 }, { at: 100, name: 'earlier', ms: 3 }]);
    expect(text).toContain('frame 4 80 ms');
    expect(text).toContain('save 30.0ms');
    expect(text).not.toContain('earlier');
    expect(text).toContain('+1 shader program(s)');
    expect(text).toContain('+3 geometry(ies) uploaded');
    expect(text).toContain('+2 texture(s) uploaded');
  });

  it('is wired to the frame monitor, the screen render and the profiler', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
    expect(read('render/PerfMonitor.tsx')).toContain('traceFrame(');
    expect(read('screens/GameScreen.tsx')).toContain("traceWork('GameScreen render+commit'");
    expect(read('render/profiler.ts')).toContain('traced(name, fn)');
  });
});

describe('preparation and materials during a transition', () => {
  it('the preparation of the levels ahead is held during the crossing and quick when the screen is idle', () => {
    expect(() => {
      setWarmPaused(true);
      setWarmPaused(false);
      setWarmIdle(true);
      setWarmIdle(false);
    }).not.toThrow();
    const fs = require('fs');
    const path = require('path');
    const cache = fs.readFileSync(path.join(__dirname, '../src/render/prepareCache.ts'), 'utf8');
    expect(cache).toMatch(/if \(running \|\| paused\) return/);
  });

  it('a level never creates a material: the paint material is shared by all the boards', () => {
    const a = sharedPaintMaterial('classic', null);
    const b = sharedPaintMaterial('classic', null);
    expect(a).toBe(b);
    expect(sharedPaintMaterial('rainbow', null)).not.toBe(a);
    const fs = require('fs');
    const path = require('path');
    expect(fs.readFileSync(path.join(__dirname, '../src/render/Board.tsx'), 'utf8')).toContain('sharedPaintMaterial(effect, env)');
  });

  it('the board that was left stays mounted, hidden, for a moment after the landing', () => {
    const fs = require('fs');
    const path = require('path');
    const canvas = fs.readFileSync(path.join(__dirname, '../src/render/GameCanvas.tsx'), 'utf8');
    expect(canvas).toContain('leaving');
    expect(canvas).toMatch(/setTimeout\(\(\) => setTrack/);
  });
});

describe('the big x2 on a tile to cross twice', () => {
  it('is drawn from strokes: white inside, a dark outline, transparent outside, soft edges', () => {
    expect(X2_STROKES.length).toBe(3);
    const centre = X2_STROKES[2][0];
    expect(distanceToMark(centre[0], centre[1])).toBeLessThan(0.001);
    const [r, g, b, a] = markTexel(centre[0], centre[1]);
    expect([r, g, b, a]).toEqual([255, 255, 255, 255]);
    expect(markTexel(0.5, 0.97)[3]).toBe(0); // far from any stroke
    const edge = markTexel(centre[0] + 0.075, centre[1])[3]; // in the outline
    expect(edge).toBeGreaterThan(0);
  });

  it('has one shared texture and one instanced mesh, and pulses slowly', () => {
    expect(MARK_SIZE).toBeGreaterThan(0.55);
    expect(MARK_SIZE).toBeLessThan(0.7); // about 60 % of the tile
    const samples = Array.from({ length: 60 }, (_, i) => pulseScale(i * 0.05));
    expect(Math.min(...samples)).toBeGreaterThan(0.9);
    expect(Math.max(...samples)).toBeLessThan(1.1);
    expect(popScale(0)).toBe(1);
    expect(popScale(0.3)).toBeGreaterThan(1.2);
    expect(popScale(1)).toBe(0);
    const fs = require('fs');
    const path = require('path');
    const f3d = fs.readFileSync(path.join(__dirname, '../src/render/Features3D.tsx'), 'utf8');
    expect(f3d).toContain('instancedMesh');
    expect(f3d).toContain('x2Texture()');
    expect(f3d).not.toContain('function DoubleMark(');
  });

  it('the first pass paints nothing (no tint), the second paints; the level ends when every x2 tile was crossed twice', () => {
    const board = require('fs').readFileSync(require('path').join(__dirname, '../src/render/Board.tsx'), 'utf8');
    expect(board).toMatch(/if \(!isDouble \|\| p\.coat >= 2\) \{/);
    // the logic: a double tile needs two passes before the exit opens
    const level = makeLevel(['#####', '#...#', '#####'], [1, 1], { doubles: [[1, 2]] }, { r: 1, c: 4, dir: 'R' });
    const state = createState(level);
    expect(level.layers).toBe(4); // three tiles, one of them twice
    applyMove(level, state, 'R');
    expect(state.layers).toBe(3); // the x2 tile has been crossed once: not painted yet
    applyMove(level, state, 'L');
    expect(state.layers).toBe(4);
    expect(applyMove(level, state, 'R')!.exited).toBe(true);
  });
});

describe('random numbers used by the generators are reproducible', () => {
  it('the same seed gives the same sequence', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect([a.next(), a.int(0, 9)]).toEqual([b.next(), b.int(0, 9)]);
  });
});
