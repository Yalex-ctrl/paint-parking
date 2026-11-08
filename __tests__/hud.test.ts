import { t } from '../src/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

import { defaultProfile } from '../src/game/economy';
import { finishTour, postponeTour } from '../src/game/tour';
import { holdHud, hudCascading, hudVisible, isHudHeld, releaseHud, resetHud, revealHud } from '../src/tour/hudStore';

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
    const tour = read('components/GuidedTour.tsx');
    expect(tour).toMatch(/revealHud\(s\.target\)/);
    expect(tour).toMatch(/revealHud\(from\)/);
    expect(tour).toMatch(/revealHud\('menu', 'restart', 'hint'\)/);
    expect(tour).toMatch(/releaseHud\(false\)/);
  });

  it('every element of the header goes through HudPop (a pop, 0 to 110 % then 100 %)', () => {
    const hud = read('components/LevelHud.tsx');
    for (const id of ['menu', 'daily', 'shop', 'gallery', 'piggy', 'lives', 'streak', 'coins']) expect(hud).toContain(`"${id}"`);
    const pop = read('components/HudPop.tsx');
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

  it('the restart button alone appears (with a pulse) when the position is lost, and restarting is free in these levels', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain('force={stuck}');
    expect(game).toContain('<Attention active={stuck}>');
    expect(game).toContain("t('game.tryAgain')");
    expect(t('game.tryAgain')).toBe('Recommence, tu vas y arriver !');
  });
});

describe('a record is only announced when it is beaten', () => {
  it('never at the first pass of a level, only when an existing record is improved', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toMatch(/const newRecord = previousBest !== undefined && s\.moves < previousBest/);
    // the badge sits next to the stars
    expect(read('components/LevelResult.tsx')).toMatch(/newRecord && \([\s\S]*result\.record/);
  });

  it('the pause menu keeps the details: the minimum and the record', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain("t('map.minimum', { count: level.solution.length })");
    expect(game).toContain("t('map.record', { count: record })");
    expect(t('map.minimum', { count: 8 })).toBe('Minimum : 8 coups');
    expect(t('map.record', { count: 9 })).toBe('Record : 9 coups');
  });
});

describe('the transition of a level', () => {
  it('keeps the bottom buttons in place all along (only the title and the moves change on arrival)', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain('const hidingButtons = dailyResult !== null;');
    expect(game).not.toMatch(/hidingButtons = end !== null/);
  });

  it('the shine wave plays once and gives the real colours back before the ball leaves', () => {
    const board = read('render/Board.tsx');
    expect(board).toMatch(/const WAVE_SECONDS = 0\.55/);
    expect(board).toMatch(/if \(bus\.transitioning \|\| bus\.exitFall\) \{[\s\S]*set\(w\.orig\)[\s\S]*wave\.current = null/);
    // a tile painted while the wave runs updates the colours it will give back
    expect(board).toMatch(/running\.orig\[i \* 3\] = tint\.r/);
  });

  it('nothing is allocated per frame during the crossing, and the ball keeps rolling until it is taken over', () => {
    const director = read('render/Director.tsx');
    expect(director).not.toMatch(/new THREE\.Vector3\(\)\)\.distanceTo/);
    expect(director).toContain('f.coasted');
  });

});

import { resultTimings } from '../src/render/resultTimings';
import { CROSSING_SECONDS } from '../src/render/transition';

describe('the result of a level is over before the ball reaches the next board', () => {
  it('the stars, the gain and the coins leaving all end, faded out, within the crossing', () => {
    for (const stars of [1, 2, 3]) {
      const t = resultTimings(stars);
      expect(t.gainAt).toBeLessThan(t.flyAt);
      expect(t.flyAt).toBeLessThan(t.endAt);
      // the fade-out lasts 260 ms after endAt (see ResultStars)
      expect(t.endAt + 260).toBeLessThanOrEqual(CROSSING_SECONDS * 1000);
    }
  });
});

describe('arrow, loading screen and preparation of the levels', () => {
  it('the help arrow is small and plain white, with no dark outline', () => {
    const arrow = read('render/HintArrow.tsx');
    expect(arrow).toMatch(/const LENGTH = 0\.55/);
    expect(arrow).not.toMatch(/1a1130|const dark|const outline|material=\{dark\}/);
  });

  it('the loading screen is a plain colour of the game\'s violet family', () => {
    const theme = read('ui/theme.ts');
    expect(theme).toMatch(/loadingBg: '#2b2161'/);
    const screen = read('ui/LoadingScreen.tsx');
    expect(screen).toContain('colors.loadingBg');
    expect(screen).not.toContain('LinearGradient');
  });

  it('twelve levels are prepared ahead, and much faster while a reward, a pop-up, the menu or the tour is showing', () => {
    const cache = read('render/prepareCache.ts');
    expect(cache).toMatch(/export const AHEAD = 12/);
    expect(cache).toMatch(/IDLE_STEP_GAP_MS = 3/);
    const game = read('screens/GameScreen.tsx');
    expect(game).toMatch(/const idleNow = popup !== null \|\| menuOpen \|\| tourRunning/);
    // The opening of the gate no longer speeds anything up: the window of the bridge is left alone.
    expect(game).toContain('setWarmIdle(idleNow)');
    expect(game).not.toContain('idleNow || gateOpen');
  });
});

import { coastFactor } from '../src/render/transition';

describe('smooth and steady', () => {
  it('the ball that waits on the bridge slows down gently instead of stopping dead', () => {
    expect(coastFactor(0)).toBe(1);
    let prev = 1;
    for (let c = 0.1; c <= 4; c += 0.1) {
      const f = coastFactor(c);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
    expect(coastFactor(10)).toBe(0);
  });

  it('the next level is prepared in calm frames, and at full speed only when the crossing is already waiting for it', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).not.toContain('setGateOpen');
    expect(game).toMatch(/const waiting = bus\.transitionRequested;/);
    expect(game).toMatch(/!waiting && \(busy\.current \|\| bus\.exiting \|\| bus\.transitioning\)/);
    expect(game).toMatch(/waiting \? 3 : STEP_GAP_MS/);
  });

  it('the music belongs to the app: it is wanted all the time, whatever screen is open', () => {
    expect(read('app/_layout.tsx')).toContain("wantMusic(true, 'app')");
  });

  it('there is no "skip the tour" button over the tour', () => {
    const tour = read('components/GuidedTour.tsx');
    expect(tour).not.toContain('Passer la visite');
    expect(tour).not.toMatch(/skipTour/);
  });
});

describe('the title row of the level header', () => {
  const hud = read('components/LevelHud.tsx');
  const lives = read('ui/LivesPill.tsx');

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
