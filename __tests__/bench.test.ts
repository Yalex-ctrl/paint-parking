import { benchFinish, benchFrame, benchIsDone, benchPhase, benchStart, benchTask, benchTimed, benchTransitions } from '../src/core/render/bench';

describe('the bench of the bridge', () => {
  const gpu = { programs: 10, geometries: 20, textures: 5 };

  it('counts the passages, puts each frame in its phase and ranks what made the slow ones slow', () => {
    benchStart(2);
    benchFrame(0.016, gpu);
    for (let t = 0; t < 2; t++) {
      benchPhase('lastTile');
      benchFrame(0.016, gpu);
      benchPhase('exitOpening');
      benchFrame(0.016, gpu);
      benchPhase('ballExit');
      benchFrame(0.016, gpu);
      benchPhase('bridge');
      benchTask('save profile', 12);
      benchFrame(0.031, gpu); // a slow frame with a named task in it
      benchFrame(0.0165, { ...gpu, geometries: 23 });
      benchPhase('arrival');
      benchFrame(0.016, gpu);
      benchPhase('entryClose');
      benchFrame(0.016, gpu);
      benchPhase('idle');
    }
    expect(benchTransitions()).toBe(2);
    expect(benchIsDone(2)).toBe(true);
    const report = benchFinish('test');
    expect(report.frames).toBe(14);
    expect(report.max).toBeCloseTo(31, 0);
    expect(report.slow).toBe(2);
    const md = report.markdown;
    expect(md).toContain('# Bridge bench: test');
    expect(md).toMatch(/\| bridge \|/);
    expect(md).toContain('save profile');
    expect(md).toContain('NOT met'); // 31 ms is over the goal of 25 ms
    // a rise in the shader programs would be reported
    expect(md).toContain('constant during every passage');
  });

  it('reports a shader program that appears in the middle of a passage', () => {
    benchStart(1);
    benchFrame(0.016, gpu);
    benchPhase('lastTile');
    benchFrame(0.016, gpu);
    benchPhase('bridge');
    benchFrame(0.02, { ...gpu, programs: 11 });
    benchPhase('idle');
    const report = benchFinish('programs');
    expect(report.markdown).toMatch(/ROSE 1 time/);
  });

  it('records nothing, and costs nothing, when no bench is running', () => {
    expect(benchTimed('x', () => 7)).toBe(7);
    benchPhase('lastTile');
    expect(benchTransitions()).toBe(1); // the one of the last bench: nothing new was counted
  });
});
