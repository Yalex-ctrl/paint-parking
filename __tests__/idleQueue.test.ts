import { flushIdleQueue, holdIdle, idleQueueLength, isIdleHeld, releaseIdle, resetIdleQueue, runWhenIdle } from '../src/core/services/idleQueue';
import { describeFrame, traceEnd, traceFrame, traceHistory, traceReset, traceStart, traceWork, traced, tracing } from '../src/core/render/transitionTrace';
import { createRng } from '../src/core/rng';

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

});

describe('random numbers used by the generators are reproducible', () => {
  it('the same seed gives the same sequence', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect([a.next(), a.int(0, 9)]).toEqual([b.next(), b.int(0, 9)]);
  });
});
