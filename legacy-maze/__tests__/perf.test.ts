import { defaultProfile } from '../src/core/economy';
import { freshLives, loseLife, grantInfinite } from '../src/core/lives';
import { LEVELS } from '../src/game/levels';
import { planDecor, planDecorSteps } from '../src/core/render/decor/placement';
import { HITCH_MS, perf } from '../src/core/render/perf';
import { prepareLevel, prepareLevelSteps } from '../src/render/prepare';
import { planNotifications, planLivesNotification } from '../src/core/notificationPlan';

const screen = { width: 390, height: 844 };
const margins = { top: 171, bottom: 100 };

describe('preparing the next level in steps', () => {
  it('pauses several times, and gives exactly the same level as doing it at once', () => {
    const level = LEVELS[90];
    const whole = prepareLevel(level, screen, margins, true);
    const steps = prepareLevelSteps(level, screen, margins, true);
    let pauses = 0;
    let result;
    for (;;) {
      const r = steps.next();
      if (r.done) {
        result = r.value;
        break;
      }
      pauses++;
    }
    expect(pauses).toBeGreaterThanOrEqual(4); // camera, scenery, walls, shadows, island: never all in one go
    expect(result.decor.map((d) => [d.model.name, d.x, d.z])).toEqual(whole.decor.map((d) => [d.model.name, d.x, d.z]));
    expect(result.island.getAttribute('position').count).toBe(whole.island.getAttribute('position').count);
    expect(result.cameraPosition.toArray()).toEqual(whole.cameraPosition.toArray());
    whole.dispose();
    result.dispose();
  });

  it('the scenery plan is the same sliced or not', () => {
    const level = LEVELS[70];
    const a = planDecor(level);
    const gen = planDecorSteps(level);
    for (;;) {
      const r = gen.next();
      if (r.done) {
        expect(r.value.map((p) => [p.x, p.z, p.rotY])).toEqual(a.map((p) => [p.x, p.z, p.rotY]));
        break;
      }
    }
  });

  it('draws the ground far from the board in big blocks: well under one quad per cell', () => {
    const level = LEVELS[95];
    const p = prepareLevel(level, screen, margins, false);
    const { r0, r1, c0, c1 } = p.islandSpec;
    const cells = (r1 - r0 + 1) * (c1 - c0 + 1);
    expect(p.island.getAttribute('position').count).toBeLessThan(cells * 4 * 0.7);
    p.dispose();
  });
});

describe('frame measurements', () => {
  it('counts frames, hitches (over 33 ms) and the longest frame per phase', () => {
    perf.reset();
    perf.setPhase('transition');
    perf.frame(0.016, 80);
    perf.frame(0.05, 80);
    perf.frame(0.02, 80);
    const st = perf.phases.transition;
    expect(st.frames).toBe(3);
    expect(st.hitches).toBe(1);
    expect(Math.round(st.worstMs)).toBe(50);
    expect(HITCH_MS).toBeGreaterThan(33);
    expect(perf.calls).toBe(80);
    perf.setPhase('level');
    expect(perf.phases.transition.frames).toBe(0); // the phase starts again from nothing
  });

  it('a slow map never lowers the quality of the game', () => {
    perf.reset();
    for (let i = 0; i < 400; i++) perf.frame(0.05, 100, false);
    expect(perf.quality).toBe(0);
    for (let i = 0; i < 400; i++) perf.frame(0.05, 100, true);
    expect(perf.quality).toBeGreaterThan(0);
    perf.reset();
  });
});

describe('notification when the lives are back', () => {
  const now = new Date(2026, 4, 10, 9, 0, 0);
  it('is planned for the moment the last life returns, and not at all when full or unlimited', () => {
    const p = defaultProfile();
    expect(planLivesNotification(p, now)).toBeNull();
    let lives = freshLives();
    lives = loseLife(loseLife(lives, now.getTime())!, now.getTime())!;
    const plan = planLivesNotification({ ...p, lives }, now)!;
    expect(plan.date.getTime()).toBe(now.getTime() + 2 * 30 * 60_000);
    expect(planLivesNotification({ ...p, lives: grantInfinite(lives, 1, now.getTime()) }, now)).toBeNull();
    expect(planLivesNotification({ ...p, lives, notifications: { enabled: false, asked: true } }, now)).toBeNull();
  });

  it('never two notifications on the same day: the lives one takes the place of the daily reminder', () => {
    const p = defaultProfile();
    const lives = loseLife(freshLives(), now.getTime())!;
    const plans = planNotifications({ ...p, lives }, now);
    const days = plans.map((x) => x.date.toDateString());
    expect(new Set(days).size).toBe(days.length);
    expect(plans.some((x) => x.body.includes('vies'))).toBe(true);
  });
});
