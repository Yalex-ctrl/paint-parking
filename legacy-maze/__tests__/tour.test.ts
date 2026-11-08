import { t } from '../src/core/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

import { defaultProfile, normalizeProfile } from '../src/core/economy';
import { LEVELS } from '../src/game/levels';
import { moveLimit, starsFor } from '../src/game/scoring';
import { finishTour, postponeTour, shouldOfferTour, TOUR_AFTER_LEVEL, TOUR_GIFT_COINS } from '../src/core/tour';
import { itemsOfKind } from '../src/core/shopItems';
import { bubbleSlot } from '../src/render/bubbleSlot';
import { ARROW, placeBubble } from '../src/core/tour/placement';
import { tourSteps, TOUR_SCREENS, TOUR_STEPS } from '../src/core/tour/steps';
import { freshProfileKeepingPurchases } from '../src/core/storage/reset';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');

describe('when the tour is offered', () => {
  it('after level 5, once; never in a daily challenge, never on another level', () => {
    const p = defaultProfile();
    expect(TOUR_AFTER_LEVEL).toBe(5);
    for (const id of [1, 2, 3, 4]) expect(shouldOfferTour(p, id, false)).toBe(false);
    expect(shouldOfferTour(p, 5, true)).toBe(false);
    expect(shouldOfferTour(p, 5, false)).toBe(true);
    // an offer that was missed (never made, never put off) is made at the next level won
    for (const id of [6, 7, 50]) expect(shouldOfferTour(p, id, false)).toBe(true);
  });

  it('"Plus tard" puts it off once: it comes back after level 6, then never again', () => {
    let p = postponeTour(defaultProfile());
    expect(shouldOfferTour(p, 5, false)).toBe(false); // replaying level 5 does not offer it again
    expect(shouldOfferTour(p, 6, false)).toBe(true);
    p = postponeTour(p);
    for (const id of [5, 6, 7, 12]) expect(shouldOfferTour(p, id, false)).toBe(false);
    expect(postponeTour(postponeTour(postponeTour(p))).tourPostponedCount).toBeLessThanOrEqual(2);
  });

  it('once finished, it is not offered again', () => {
    const p = finishTour(defaultProfile()).profile;
    for (const id of [5, 6]) expect(shouldOfferTour(p, id, false)).toBe(false);
  });
});

describe('the gift at the end', () => {
  it('is 50 coins, given once, and not divided by the earning multiplier', () => {
    const p = defaultProfile();
    const first = finishTour(p);
    expect(first.gift).toBe(50);
    expect(first.profile.coins).toBe(p.coins + 50);
    expect(first.profile.tourCompleted).toBe(true);
    const again = finishTour(first.profile);
    expect(again.gift).toBe(0);
    expect(again.profile.coins).toBe(first.profile.coins);
  });
});

describe('the save', () => {
  it('keeps tourCompleted and tourPostponedCount, and "Remettre à zéro" clears them', () => {
    let p = postponeTour(defaultProfile());
    p = { ...p, tourCompleted: true };
    const reloaded = normalizeProfile(JSON.parse(JSON.stringify(p)));
    expect(reloaded.tourCompleted).toBe(true);
    expect(reloaded.tourPostponedCount).toBe(1);
    const fresh = freshProfileKeepingPurchases(p);
    expect(fresh.tourCompleted).toBe(false);
    expect(fresh.tourPostponedCount).toBe(0);
  });

  it('an old save that had seen the welcome screen does not get the tour', () => {
    const old = normalizeProfile({ version: 2, welcomeSeen: true } as never);
    expect(old.tourCompleted).toBe(true);
    expect(normalizeProfile({ version: 2 } as never).tourCompleted).toBe(false);
    expect(normalizeProfile({ version: 2, tourPostponedCount: 99 } as never).tourPostponedCount).toBe(2);
  });

  it('"Remettre à zéro" gives back 5 lives and the tour', () => {
    const emptied = { ...defaultProfile(), tourCompleted: true, lives: { ...defaultProfile().lives, count: 0, since: 1, infiniteUntil: 5 } };
    const fresh = freshProfileKeepingPurchases(emptied);
    expect(fresh.lives.count).toBe(5);
    expect(fresh.lives.infiniteUntil).toBe(0);
    expect(fresh.tourCompleted).toBe(false);
  });
});

describe('the steps', () => {
  const counts = { balls: itemsOfKind('ball').length, paints: itemsOfKind('paint').length };
  const ids = (lives: boolean, moveLimit: boolean, vip = false) => tourSteps({ lives, moveLimit, vip }, counts).map((s) => s.id);
  const list = () => tourSteps({ lives: true, moveLimit: true }, counts);

  it('are in the order of the brief', () => {
    expect(ids(true, true)).toEqual([
      'steps', 'moves', 'lives', 'streak', 'coins', 'shop-balls', 'shop-paints', 'shop-offers', 'offers-free', 'offers-packs', 'offers-lives', 'offers-piggy', 'offers-vip',
      'daily', 'daily-calendar', 'gallery', 'gifts', 'piggy', 'hint',
    ]);
  });

  it('leave out the lives steps (the heart of the header, and the offer of lives) when lives are off', () => {
    expect(ids(false, true)).not.toContain('lives');
    expect(ids(false, true)).not.toContain('offers-lives');
    expect(ids(false, true)).toHaveLength(ids(true, true).length - 2);
  });

  it('leave out the VIP pass for a subscriber, and show it to everyone else', () => {
    expect(ids(true, true, true)).not.toContain('offers-vip');
    expect(ids(true, true, false)).toContain('offers-vip');
    expect(ids(true, true, true)).toHaveLength(ids(true, true, false).length - 1);
  });

  it('press the tab of the offers first, then present the offers one after the other, all in the shop', () => {
    const offers = list().filter((s) => s.id.startsWith('offers-') || s.id === 'shop-offers');
    expect(offers[0].pressFirst).toBe(true);
    expect(list().filter((s) => s.screen === 'shop').map((s) => s.id).slice(0, 3)).toEqual(['shop-balls', 'shop-paints', 'shop-offers']);
    expect(offers.every((s) => s.screen === 'shop')).toBe(true);
  });

  it('put the bubble of the gallery above the picture, so that its arrow is not on the name under it', () => {
    expect(list().find((s) => s.id === 'gallery')!.side).toBe('above');
  });

  it('warn about the limit only when the move limit is on', () => {
    const text = (limit: boolean) => tourSteps({ lives: true, moveLimit: limit }, counts).find((s) => s.id === 'moves')!.text;
    expect(text(true)).toContain('limité');
    expect(text(false)).not.toContain('limité');
  });

  it('say how many balls and paints there really are', () => {
    const shop = tourSteps({ lives: true, moveLimit: true }, counts).filter((s) => s.screen === 'shop').map((s) => s.text);
    expect(shop[0]).toContain(`${counts.balls}`);
    expect(shop[1]).toContain(`${counts.paints}`);
    expect(counts.balls).toBeGreaterThanOrEqual(40);
    expect(counts.paints).toBeGreaterThanOrEqual(30);
    for (const s of tourSteps({ lives: true, moveLimit: true }, counts)) expect(s.text).not.toMatch(/[{}]/);
  });

  it('open only the screens the tour knows, each through a button of the level', () => {
    for (const s of TOUR_STEPS) if (s.screen) expect(TOUR_SCREENS[s.screen].route).toMatch(/^\//);
    expect(Object.values(TOUR_SCREENS).map((x) => x.from)).toEqual(['shop', 'daily', 'gallery', 'gifts']);
  });

  it('keep the steps of a screen together (one opening, one closing)', () => {
    const list = tourSteps({ lives: true, moveLimit: true }, counts);
    const seen: string[] = [];
    for (const s of list) {
      const key = s.screen ?? '';
      if (seen[seen.length - 1] !== key) seen.push(key);
    }
    expect(new Set(seen.filter(Boolean)).size).toBe(seen.filter(Boolean).length);
  });
});

describe('nothing real happens during the tour', () => {
  it('the tour never spends coins, loses a life, shows an ad or uses a hint', () => {
    const tour = read('components/GuidedTour.tsx');
    for (const forbidden of ['spendCoins', 'spendLife', 'loseLife', 'payHint', 'ads.', 'purchases', 'earnPlayed', 'earnCoins']) expect(tour).not.toContain(forbidden);
    // it swallows every touch above the screens
    expect(tour).toMatch(/StyleSheet\.absoluteFill\}\s*onPress/);
    // the game is blocked while it runs
    expect(read('screens/GameScreen.tsx')).toMatch(/blockedRef = useLatestRef\([^)]*tourRunning/);
  });

  it('the only coins are the gift of finishTour, once', () => {
    expect(read('components/GuidedTour.tsx')).toMatch(/finishTour\(getProfile\(\)\)/);
  });

  it('is mounted at the root, above every screen', () => {
    expect(read('app/_layout.tsx')).toContain('<GuidedTourHost />');
  });
});

describe('the bubble stays on the screen', () => {
  const screens = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ];
  const bubble = { width: 300, height: 130 };

  it('wherever the element is (corners, edges, middle), on every size of phone', () => {
    for (const screen of screens) {
      const safe = { top: screen.height > 700 ? 54 : 20, bottom: screen.height > 700 ? 34 : 0 };
      for (const fx of [0, 0.5, 1]) {
        for (const fy of [0.02, 0.2, 0.5, 0.8, 0.97]) {
          const target = { x: fx * (screen.width - 44), y: fy * (screen.height - 44), width: 44, height: 44 };
          // the bubble is never wider than the screen minus its margins (see GuidedTour)
          const bubble = { width: Math.min(300, screen.width - 32), height: 130 };
          const p = placeBubble(target, bubble, screen, safe);
          expect(p.x).toBeGreaterThanOrEqual(16 - 0.001);
          expect(p.x + bubble.width).toBeLessThanOrEqual(screen.width - 16 + 0.001);
          expect(p.y).toBeGreaterThanOrEqual(safe.top + 16 - 0.001);
          expect(p.y + bubble.height).toBeLessThanOrEqual(screen.height - safe.bottom - 16 + 0.001);
          expect(p.arrow.x).toBeGreaterThan(0);
          expect(p.arrow.y).toBeGreaterThan(0);
        }
      }
    }
  });

  it('goes under an element near the top, above one near the bottom, and does not cover the element', () => {
    const screen = screens[2];
    const safe = { top: 54, bottom: 34 };
    const top = placeBubble({ x: 300, y: 60, width: 44, height: 44 }, bubble, screen, safe);
    expect(top.side).toBe('below');
    expect(top.y).toBeGreaterThanOrEqual(104 + ARROW - 1);
    const bottom = placeBubble({ x: 100, y: 740, width: 150, height: 52 }, bubble, screen, safe);
    expect(bottom.side).toBe('above');
    expect(bottom.y + bubble.height).toBeLessThanOrEqual(740);
  });

  it('uses the sides when there is no room above or below', () => {
    const screen = { width: 390, height: 300 };
    const p = placeBubble({ x: 10, y: 100, width: 40, height: 40 }, { width: 200, height: 150 }, screen, { top: 0, bottom: 0 });
    expect(p.side).toBe('right');
    expect(p.x).toBeGreaterThanOrEqual(50);
  });
});

describe('bubbles of the level', () => {
  const frame = { top: 190, bottom: 744 };
  it('go above the board when there is room, under it otherwise, never over the board', () => {
    expect(bubbleSlot({ top: 330, bottom: 600 }, frame, 44)).toBe(330 - 44 - 8);
    // no room above: under the board
    const below = bubbleSlot({ top: 192, bottom: 520 }, frame, 44);
    expect(below).toBe(520 + 8);
    // a full board leaves no room: the bubble still stays inside the frame
    const full = bubbleSlot({ top: 195, bottom: 740 }, frame, 44);
    expect(full).toBeGreaterThanOrEqual(frame.top);
    expect(full + 44).toBeLessThanOrEqual(frame.bottom);
  });
});

describe('the end of a level', () => {
  it('shows the stars and one number, no card, no calculation, no x2 button', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain('<ResultStars');
    for (const gone of ['<ResultCard', '<StreakRow', '<BonusRow', '<ProgressCard', 'doubleReward', 'PiggyDrop']) expect(game).not.toContain(gone);
    expect(read('components/LevelResult.tsx')).not.toContain('label="×2"');
    // the coins fly to the counter; no floating "+X" over the board
    expect(game).toMatch(/showLabel=\{false\}/);
  });

  it('the "Doubler la récompense" button is only in the pop-up of the end of a step', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain("t('step.double')");
    expect(game.match(/step\.double/g)).toHaveLength(1);
    expect(t('step.double')).toBe('Doubler la récompense');
  });

  it('the world banner is gone from the bottom of the level, and lives in the step pop-up', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).not.toContain('ProgressCard');
    expect(game).toMatch(/<WorldProgressRow/);
  });
});

describe('texts with an outline', () => {
  it('the outline copies fill the same box as the text, shifted by a pixel or two', () => {
    const src = read('ui/OutlineText.tsx');
    expect(src).toMatch(/left: dx \* width, right: -dx \* width, top: dy \* width, bottom: -dy \* width/);
    expect(src).toMatch(/hug: \{ alignSelf: 'center'/);
  });
});

describe('header captions', () => {
  it('Défi, Boutique, Galerie and Tirelire, in Nunito 800 at 10 px, and the red dot stays', () => {
    const hud = read('components/LevelHud.tsx');
    for (const key of ['daily', 'shop', 'gallery', 'piggy']) expect(hud).toContain(`label={t('hud.${key}')}`);
    expect(['daily', 'shop', 'gallery', 'piggy'].map((k) => t(`hud.${k}`))).toEqual(['Défi', 'Boutique', 'Galerie', 'Tirelire']);
    expect(hud).toMatch(/fontSize: 10[\s\S]*fonts\.label/);
    expect(hud).toContain('styles.dot');
  });
});

describe('the cancel link of the hint pop-up', () => {
  it('is white at 80 %, bigger, with a touch area of at least 44 px', () => {
    const src = read('components/Modals.tsx');
    expect(src).toMatch(/cancel: \{ color: 'rgba\(255, 255, 255, 0\.8\)'/);
    expect(src).toMatch(/cancelHit: \{ minHeight: 44/);
  });
});

describe('every stored level can be finished within its move limit', () => {
  it('playing the minimum earns 3 stars, and playing up to the limit still finishes', () => {
    for (const l of LEVELS) {
      const opt = l.solution.length;
      const limit = moveLimit(l.id, opt);
      if (limit === null) continue;
      expect(limit).toBeGreaterThanOrEqual(opt);
      expect(starsFor(opt, opt)).toBe(3);
      expect(starsFor(limit, opt)).toBeGreaterThanOrEqual(1);
    }
  });
});
