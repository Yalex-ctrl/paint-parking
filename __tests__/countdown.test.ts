jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import fs from 'fs';
import path from 'path';

import { MONETIZATION } from '../src/core/config/monetization';
import { formatDuration, msUntilMidnight } from '../src/core/duration';
import { applyProduct, defaultProfile } from '../src/core/economy';
import { freshLives, grantInfinite, viewOf } from '../src/core/lives';
import { claimFreeCoins, nextGiftIn, secondsToNextChest } from '../src/core/rewards';
import i18n from '../src/core/i18n';

const MIN = 60_000;
const HOUR = 3_600_000;
const src = (f: string) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');

describe('the countdown formats', () => {
  it('is 12:34 under an hour, 3 h 20 under a day, 2 j 5 h beyond', () => {
    expect(formatDuration(12 * MIN + 34_000)).toBe('12:34');
    expect(formatDuration(59 * MIN + 59_000)).toBe('59:59');
    expect(formatDuration(7_200)).toBe('00:08'); // rounded up to the second
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(-5000)).toBe('00:00');
    expect(formatDuration(3 * HOUR + 20 * MIN)).toBe('3 h 20');
    expect(formatDuration(3 * HOUR + 5 * MIN)).toBe('3 h 05');
    expect(formatDuration(HOUR)).toBe('1 h 00');
    expect(formatDuration(23 * HOUR + 59 * MIN)).toBe('23 h 59');
    expect(formatDuration(2 * 24 * HOUR + 5 * HOUR + 10 * MIN)).toBe('2 j 5 h');
    expect(formatDuration(23 * 24 * HOUR)).toBe('23 j 0 h');
  });

  it('is written with the units of the language on screen', async () => {
    await i18n.changeLanguage('en');
    expect(formatDuration(2 * 24 * HOUR + 5 * HOUR)).toBe('2 d 5 h');
    await i18n.changeLanguage('fr');
  });

  it('the time to midnight is whole and at most a day', () => {
    const at = new Date(2026, 5, 1, 21, 30, 0).getTime();
    expect(msUntilMidnight(at)).toBe(2.5 * HOUR);
    expect(msUntilMidnight(new Date(2026, 5, 1, 0, 0, 0).getTime())).toBe(24 * HOUR);
  });

  it('is computed from a saved time, not from a timer that counts down: it is right after the app was away', () => {
    const component = src('core/ui/Countdown.tsx');
    expect(component).toContain('until - now');
    expect(component).toContain('Date.now()');
    expect(component).toContain("AppState.addEventListener('change'");
    // it only ticks while the screen is in front and the app is active
    expect(component).toContain('useIsFocused');
    expect(component).toMatch(/running = active && focused && appActive/);
    expect(component).toContain("fontVariant: ['tabular-nums']");
  });
});

describe('the lives', () => {
  it('count down from the saved times: closing the app and coming back later gives the right time', () => {
    const t0 = 1_000_000_000;
    const lives = { ...freshLives(), count: 2, since: t0 };
    expect(viewOf(lives, t0 + 10 * MIN).nextInMs).toBe(20 * MIN);
    // the app is closed and opened again 45 minutes later: one life is back, the next one is 15 minutes away
    const later = viewOf(lives, t0 + 45 * MIN);
    expect(later.count).toBe(3);
    expect(later.nextInMs).toBe(15 * MIN);
    expect(viewOf(lives, t0 + 120 * MIN).full).toBe(true);
  });

  it('unlimited lives of 1 hour and of 24 hours add up', () => {
    const now = 2_000_000_000;
    let p = defaultProfile();
    const day = MONETIZATION.lives.infiniteDay;
    const hour = MONETIZATION.lives.infiniteHour;
    expect(hour).toMatchObject({ id: 'paintparking_infinite_lives_1h', priceEur: 0.99, hours: 1 });
    expect(day).toMatchObject({ id: 'paintparking_infinite_lives_24h', priceEur: 2.99, hours: 24 });
    p = { ...p, lives: grantInfinite(p.lives, hour.hours, now) };
    expect(viewOf(p.lives, now).infiniteLeftMs).toBe(HOUR);
    p = { ...p, lives: grantInfinite(p.lives, day.hours, now) };
    expect(viewOf(p.lives, now).infiniteLeftMs).toBe(25 * HOUR);
    p = { ...p, lives: grantInfinite(p.lives, hour.hours, now) };
    expect(viewOf(p.lives, now).infiniteLeftMs).toBe(26 * HOUR);
    // and it runs down with the clock, also after the app was away
    expect(viewOf(p.lives, now + 6 * HOUR).infiniteLeftMs).toBe(20 * HOUR);
    expect(viewOf(p.lives, now + 6 * HOUR).infinite).toBe(true);
    expect(viewOf(p.lives, now + 27 * HOUR).infinite).toBe(false);
  });

  it('the purchases give them, and they are no longer sold for coins', () => {
    const bought = applyProduct(defaultProfile(), 'paintparking_infinite_lives_1h')!;
    expect(bought.lives.infiniteUntil).toBeGreaterThan(Date.now() + 59 * MIN);
    const both = applyProduct(bought, 'paintparking_infinite_lives_24h')!;
    expect(both.lives.infiniteUntil).toBeGreaterThan(Date.now() + 24 * HOUR + 59 * MIN);
    expect((MONETIZATION.lives as Record<string, unknown>).infiniteHourCoins).toBeUndefined();
    expect(src('core/storage/lives.ts')).not.toContain('infiniteHourWithCoins');
  });
});

describe('the gains use the values of the config as they are', () => {
  it('free coins give 15, exactly', () => {
    expect(MONETIZATION.rewards.freeCoins.coins).toBe(15);
    const got = claimFreeCoins(defaultProfile(), Date.now())!;
    expect(got.coins).toBe(15);
  });

  it('the multiplier is 1, and neither the gifts, the wheel, the chests of play time, the VIP bonus nor the purchases read it', () => {
    expect(MONETIZATION.coinEarnMultiplier).toBe(1);
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && fs.readFileSync(p, 'utf8').includes('coinEarnMultiplier')) users.push(path.relative(path.join(__dirname, '../src'), p).replace(/\\/g, '/'));
      }
    };
    walk(path.join(__dirname, '../src'));
    expect(users.sort()).toEqual(['core/config/monetization.ts', 'core/economy.ts', 'core/tour.ts']);
    expect(src('core/rewards.ts')).not.toContain('earnPlayed');
    expect(src('core/rewards.ts')).not.toContain('scaledEarning');
    expect(src('core/vip.ts')).not.toContain('earnPlayed');
  });
});

describe('the label of the gifts button', () => {
  it('gives the time before the nearest gift: the free coins, or midnight', () => {
    const now = new Date(2026, 5, 1, 12, 0, 0).getTime();
    const p = defaultProfile();
    expect(nextGiftIn(p, now)).toBe(12 * HOUR);
    const taken = claimFreeCoins(p, now)!;
    expect(nextGiftIn(taken, now)).toBe(30 * MIN);
    expect(nextGiftIn(taken, now + 29 * MIN)).toBe(MIN);
  });

  it('the chests of play time say how many minutes of play are left', () => {
    const r = { ...defaultProfile().rewards, playSeconds: 6 * 60 };
    expect(secondsToNextChest(r)).toBe(4 * 60);
    expect(secondsToNextChest({ ...r, playSeconds: 31 * 60 })).toBeNull();
  });
});

describe('the countdowns are placed where the brief asks', () => {
  it('lives, daily reward, wheel, free coins, ad unlock, play chests, ad bonus, daily challenge, starter pack, VIP, step bar, gifts', () => {
    expect(src('core/ui/LivesPill.tsx')).toContain('formatDuration');
    expect(src('core/components/NoLivesCard.tsx')).toContain('formatDuration');
    const gifts = src('app/gifts.tsx');
    for (const key of ['gifts.nextRewardIn', 'gifts.freeSpinIn', 'gifts.nextAdIn', 'gifts.moreMinutes', 'gifts.endsIn']) expect(gifts).toContain(key);
    expect(src('core/components/FreeCoins.tsx')).toContain('formatDuration');
    expect(src('app/daily.tsx')).toContain("t('daily.newIn')");
    expect(src('core/components/Modals.tsx')).toContain("t('shop.expiresIn'");
    expect(src('core/components/ShopOffers.tsx')).toContain('offers.expiresPrefix');
    expect(src('app/vip-account.tsx')).toContain("t('vip.account.renewsIn')");
    expect(src('core/components/StepBar.tsx')).toContain("t('hud.levelsLeft'");
    expect(src('core/components/LevelHud.tsx')).toContain('<GiftCaption');
  });
});
