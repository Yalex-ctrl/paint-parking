import { LEVELS } from '../src/game/levels';
import { DEMO_MAX_SIDE, DEMO_POOL, pickDemoLevels } from '../src/game/demoLevels';
import { LOADING_FADE_MS, LOADING_MIN_SHOWN_MS, LOADING_SHOW_AFTER_MS, TIPS, loadingTimeline, pickTip, tipText } from '../src/core/loadingRules';

describe('loading screen rules', () => {
  it('shows nothing but the cover for a short wait', () => {
    expect(loadingTimeline(80)).toEqual({ showAt: null, fadeAt: 80 });
    expect(loadingTimeline(LOADING_SHOW_AFTER_MS - 1).showAt).toBeNull();
  });

  it('shows the content after 150 ms, keeps it at least 400 ms, then fades', () => {
    expect(loadingTimeline(200)).toEqual({ showAt: 150, fadeAt: 150 + LOADING_MIN_SHOWN_MS }); // ready too soon after it appeared
    expect(loadingTimeline(1200)).toEqual({ showAt: 150, fadeAt: 1200 });
    expect(loadingTimeline(150).fadeAt - 150).toBeGreaterThanOrEqual(LOADING_MIN_SHOWN_MS);
    expect(LOADING_FADE_MS).toBeGreaterThan(0);
  });

  it('has tips, picked at random', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(8);
    expect(pickTip(() => 0)).toBe(tipText(TIPS[0]));
    expect(TIPS.map(tipText)).toContain(pickTip());
  });
});

describe('levels played by the home screen', () => {
  it('only the ones the player has finished, and small', () => {
    const current = 120;
    const demos = pickDemoLevels(LEVELS, current, () => 0.3);
    expect(demos.length).toBeGreaterThan(0);
    expect(demos.length).toBeLessThanOrEqual(DEMO_POOL);
    for (const l of demos) {
      expect(l.id).toBeLessThan(current);
      expect(l.cols - 2).toBeLessThanOrEqual(DEMO_MAX_SIDE);
      expect(l.rows - 2).toBeLessThanOrEqual(DEMO_MAX_SIDE);
    }
  });

  it('a new player gets levels 1 to 10', () => {
    for (const current of [1, 2]) {
      const demos = pickDemoLevels(LEVELS, current, () => 0.5);
      expect(demos.length).toBeGreaterThan(0);
      for (const l of demos) expect(l.id).toBeLessThanOrEqual(10);
    }
  });

  it('changes from one visit to the next', () => {
    const a = pickDemoLevels(LEVELS, 200, () => 0.1).map((l) => l.id);
    const b = pickDemoLevels(LEVELS, 200, () => 0.9).map((l) => l.id);
    expect(a).not.toEqual(b);
  });
});

import { LOADING } from '../src/core/config/app';
import { endLoading, getLoading, leaveAt, markReady, startLoading } from '../src/core/ui/loadingStore';

describe('loading screen between screens', () => {
  it('stays 2.5 s at launch and 1.5 s between screens at least, and waits for the screen to be ready', () => {
    expect(LOADING.launchMinMs).toBe(2500);
    expect(LOADING.transitionMinMs).toBe(1500);
    expect(LOADING.fadeMs).toBe(300);
    const launch = { kind: 'launch' as const, startedAt: 0, routeReady: true, launchReady: true };
    expect(leaveAt({ ...launch, routeReady: false }, null)).toBeNull(); // the screen is not ready
    expect(leaveAt({ ...launch, launchReady: false }, 100)).toBeNull(); // the preloading is not finished
    expect(leaveAt(launch, 400)).toBe(2500); // ready fast: it still stays 2.5 s
    expect(leaveAt(launch, 4000)).toBe(4000); // slow: it leaves as soon as ready
    const move = { kind: 'transition' as const, startedAt: 10_000, routeReady: true, launchReady: false };
    expect(leaveAt(move, 10_200)).toBe(11_500);
    expect(leaveAt(move, 13_000)).toBe(13_000);
  });

  it('every navigation starts it for the screen being opened, and only that screen can end the wait', () => {
    endLoading();
    startLoading('/shop');
    expect(getLoading().covered).toBe(true);
    expect(getLoading().expected).toBe('/shop');
    markReady('/map'); // another screen: ignored
    expect(getLoading().routeReady).toBe(false);
    markReady('/shop');
    expect(getLoading().routeReady).toBe(true);
    endLoading();
    expect(getLoading().covered).toBe(false);
  });
});

import { levelPoint, STEP } from '../src/game/mapLayout';
import { themeForLevel } from '../src/core/worlds';
import { planMapDecor } from '../src/render/map/mapDecor';
import { AHEAD } from '../src/render/prepareCache';

describe('map scenery', () => {
  it('only trees, rocks, bushes, cacti and dunes, in groves, never on the path', () => {
    for (const world of [0, 1, 2, 3, 4]) {
      const theme = themeForLevel(world * 25 + 1);
      const plan = planMapDecor(world, theme);
      expect(plan.length).toBeGreaterThan(8);
      for (const p of plan) {
        expect(['tree', 'stone', 'bush', 'cactus', 'dune']).toContain(p.model.kind);
        expect(p.model.name).not.toBe('stone_smallA');
        const path = levelPoint(1 - p.z / STEP);
        expect(Math.abs(p.x - path.x)).toBeGreaterThan(1.7);
      }
    }
  });

  it('prepares the level and the 12 after it', () => {
    expect(AHEAD).toBe(12);
  });
});
