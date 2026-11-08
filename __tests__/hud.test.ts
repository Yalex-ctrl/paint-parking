import { t } from '../src/core/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

import { defaultProfile } from '../src/core/economy';
import { finishTour, postponeTour } from '../src/core/tour';
import { holdHud, hudCascading, hudVisible, isHudHeld, releaseHud, resetHud, revealHud } from '../src/core/tour/hudStore';

const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');

const ALL = ['menu', 'daily', 'shop', 'gallery', 'piggy', 'noads', 'lives', 'streak', 'coins', 'moves', 'restart', 'hint'];

beforeEach(() => resetHud());

describe('the header of the first five levels', () => {
  it('shows nothing but the title and the bar of the steps while it is minimal', () => {
    for (const id of ALL) expect(hudVisible(true, id)).toBe(false);
    // and everything otherwise
    for (const id of ALL) expect(hudVisible(false, id)).toBe(true);
  });

  it('keeps the header as it is after level 5 while the tour is waiting, then lets each element in as it is presented', () => {
    holdHud();
    expect(isHudHeld()).toBe(true);
    // level 5 is won: the level no longer asks for the minimal header, but the tour has not brought anything in yet
    for (const id of ALL) expect(hudVisible(false, id)).toBe(false);
    revealHud('moves');
    expect(hudVisible(false, 'moves')).toBe(true);
    expect(hudVisible(false, 'coins')).toBe(false);
    revealHud('lives', 'streak', 'coins');
    for (const id of ['lives', 'streak', 'coins']) expect(hudVisible(false, id)).toBe(true);
    expect(hudVisible(false, 'shop')).toBe(false);
  });

  it('at the end of the tour, or when it is skipped or put off, everything is there', () => {
    holdHud();
    releaseHud(false);
    expect(isHudHeld()).toBe(false);
    for (const id of ALL) expect(hudVisible(false, id)).toBe(true);
    // skipped: the pops come one after the other
    holdHud();
    releaseHud(true);
    expect(hudCascading()).toBe(true);
    for (const id of ALL) expect(hudVisible(false, id)).toBe(true);
  });

  it('a reset of the progress starts again from the minimal header', () => {
    holdHud();
    revealHud('shop');
    resetHud();
    expect(isHudHeld()).toBe(false);
    expect(hudVisible(true, 'shop')).toBe(false);
  });
});

describe('the tour and the header work together', () => {
  it('the tour brings each element in before it presents it, and the rest at the end', () => {
    const tour = read('core/components/GuidedTour.tsx');
    expect(tour).toMatch(/revealHud\(s\.target\)/);
    expect(tour).toMatch(/revealHud\(from\)/);
    expect(tour).toMatch(/revealHud\('menu', 'restart', 'hint'\)/);
    expect(tour).toMatch(/releaseHud\(false\)/);
  });

  it('every element of the header goes through HudPop (a pop, 0 to 110 % then 100 %)', () => {
    const hud = read('core/components/LevelHud.tsx');
    for (const id of ['menu', 'daily', 'shop', 'gallery', 'piggy', 'lives', 'streak', 'coins']) expect(hud).toContain(`"${id}"`);
    const pop = read('core/components/HudPop.tsx');
    expect(pop).toMatch(/withTiming\(1\.1, \{ duration: 170 \}\), withTiming\(1,/);
    const game = read('screens/GameScreen.tsx');
    for (const id of ['moves', 'restart', 'hint']) expect(game).toContain(`<HudPop id="${id}"`);
  });

  it('"Plus tard" and "Passer" let the header in; the coins of the first levels were counted all along', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toMatch(/updateProfile\(postponeTour\);[\s\S]*releaseHud\(true\)/);
    // the gain is paid whether it is shown or not
    expect(game).toMatch(/updateProfile\(\(\) => won\.profile\)/);
    expect(game).toMatch(/showGain: !wasMinimal/);
    // the header is minimal for levels 1 to 5 until level 5 has been finished once
    expect(game).toMatch(/const minimal = !!level && !daily && level\.id <= 5 && !\(\(doneStars\[5\] \?\? 0\) > 0\)/);
    expect(postponeTour(defaultProfile()).tourPostponedCount).toBe(1);
    expect(finishTour(defaultProfile()).profile.tourCompleted).toBe(true);
  });

});

describe('the title row of the level header', () => {
  const hud = read('core/components/LevelHud.tsx');
  const lives = read('core/ui/LivesPill.tsx');

  it('has two side columns of the same width, so the title is centred', () => {
    expect(hud).toMatch(/left: \{ width: SIDE,/);
    expect(hud).toMatch(/right: \{ width: SIDE,/);
    expect(hud).toMatch(/leftTight: \{ width: SIDE_TIGHT/);
    expect(hud).toMatch(/rightTight: \{ width: SIDE_TIGHT/);
    expect(hud).toMatch(/center: \{ flex: 1/);
  });

  it('stacks the lives, their countdown and then the streak on the left', () => {
    const left = hud.slice(hud.indexOf('styles.left'), hud.indexOf('styles.center'));
    expect(left.indexOf('<LivesPill')).toBeGreaterThan(-1);
    expect(left.indexOf('<StreakFlame')).toBeGreaterThan(left.indexOf('<LivesPill'));
    expect(hud).toMatch(/left: \{[^}]*alignItems: 'flex-start'/);
    expect(hud).toMatch(/right: \{[^}]*alignItems: 'flex-end'/);
  });

  it('shows the lives only when the feature is on, and the countdown only while a life is missing', () => {
    expect(hud).toContain('features.lives &&');
    expect(lives).toContain('!v.vip && !v.infinite && !v.full && v.nextInMs !== null');
    expect(lives).toContain('v.infinite ? <Icon name="infinity"');
  });
});
