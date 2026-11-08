import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MONETIZATION } from '../src/config/monetization';
import { applyRemoveAds, applyStarterPack, buyItem, defaultProfile, earnCoins, owns } from '../src/game/economy';
import { completeDaily } from '../src/game/daily';
import { KEPT_KEYS, KEYS, PROGRESS_KEYS } from '../src/storage/keys';
import { getProfile, resetProfileForTests, updateProfile } from '../src/storage/profile';
import { completeLevel, loadProgress } from '../src/storage/progress';
import { replayTutorial, resetProgress } from '../src/storage/reset';
import { loadSettings, saveSettings } from '../src/storage/settings';
import { loadSeenTutorials, markTutorialSeen } from '../src/storage/tutorials';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('storage keys', () => {
  it('no file but keys.ts writes its own AsyncStorage key, so a reset cannot miss one', () => {
    for (const file of sourceFiles(join(__dirname, '../src'))) {
      if (file.endsWith(join('storage', 'keys.ts'))) continue;
      expect({ file, literal: /['"`]paint-parking\//.test(readFileSync(file, 'utf8')) }).toEqual({ file, literal: false });
    }
  });

  it('every key is either wiped by a reset or deliberately kept', () => {
    const all = Object.values(KEYS).sort();
    expect([...PROGRESS_KEYS, ...KEPT_KEYS].sort()).toEqual(all);
  });
});

describe('reset of the progress', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetProfileForTests(defaultProfile());
  });

  /** A player who has done a bit of everything. */
  async function playSomeEverything() {
    await completeLevel(1, 3, 4);
    await completeLevel(2, 2, 6);
    await markTutorialSeen('stop');
    await AsyncStorage.setItem(KEYS.mapSeen, '5');
    await AsyncStorage.setItem(KEYS.oldWallet, JSON.stringify({ coins: 9, collected: {} }));
    updateProfile((p) => earnCoins(p, 5000));
    const bought = buyItem(getProfile(), 'silver');
    if (bought.ok) updateProfile(() => bought.profile);
    updateProfile((p) => completeDaily(p, '2026-04-01').profile);
    updateProfile((p) => ({
      ...p,
      equipped: { ball: 'silver', paint: p.equipped.paint },
      chestsOpened: [1, 2],
      mapCoins: { day: '2026-04-01', count: 7 },
      handSeen: true,
      launches: 12,
      victories: 40,
      dailyReward: { lastClaim: '2026-04-01', day: 3 },
      starter: { offeredAt: 123, purchased: false },
      notifications: { enabled: false, asked: true },
    }));
    await saveSettings({ decor: false, sound: false, music: false, musicVolume: 0.2, sfxVolume: 0.3, showPerf: false, vibrations: false, language: null });
    await AsyncStorage.setItem(KEYS.mockReceipts, JSON.stringify(['paintparking_no_ads']));
  }

  it('brings every piece of progress back to its default, whatever the player did', async () => {
    await playSomeEverything();
    // Sanity: it really was changed.
    expect((await loadProgress()).current).toBe(3);
    expect(getProfile().coins).toBeGreaterThan(0);

    await resetProgress();

    const fresh = defaultProfile();
    expect(getProfile()).toEqual(fresh); // coins, shop, daily, streak, reward, chests, starter timer, tutorial flag...
    expect(await loadProgress()).toEqual({ current: 1, stars: {}, moves: {} });
    expect(await loadSeenTutorials()).toEqual([]);
    for (const key of PROGRESS_KEYS) {
      // Absent (= default) or, for the profile, exactly the default profile.
      const raw = await AsyncStorage.getItem(key);
      if (key === KEYS.profile) expect(JSON.parse(raw!)).toEqual(fresh);
      else expect(raw).toBeNull();
    }
    expect(getProfile().launches).toBe(0); // the next start is a first launch again
    expect(getProfile().handSeen).toBe(false); // the animated hand comes back
  });

  it('keeps the preferences and the purchases made with real money', async () => {
    await playSomeEverything();
    updateProfile((p) => applyRemoveAds(applyStarterPack(p)));
    await resetProgress();
    const p = getProfile();
    expect(p.adsRemoved).toBe(true);
    expect(p.starter.purchased).toBe(true);
    for (const id of MONETIZATION.products.starterPack.skins) expect(owns(p, id)).toBe(true);
    expect(p.coins).toBe(0); // the pack's coins were spent / are progress
    expect(owns(p, 'silver')).toBe(false); // bought with coins: gone
    // The other preferences stay; the sound switches and volumes are back to their defaults.
    expect(await loadSettings()).toEqual({ decor: false, sound: true, music: true, musicVolume: 0.8, sfxVolume: 0.8, showPerf: false, vibrations: false, language: null });
    expect(await AsyncStorage.getItem(KEYS.mockReceipts)).toBe(JSON.stringify(['paintparking_no_ads']));
  });

  it('a player who never paid gets plain defaults (ads, starter pack)', async () => {
    await playSomeEverything();
    await resetProgress();
    expect(getProfile().adsRemoved).toBe(false);
    expect(getProfile().starter.purchased).toBe(false);
  });
});

describe('replaying the tutorial', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetProfileForTests(defaultProfile());
  });

  it('brings the hand and the explanations back without touching the progress', async () => {
    await completeLevel(1, 3, 4);
    await markTutorialSeen('portal');
    updateProfile((p) => ({ ...earnCoins(p, 30), handSeen: true }));
    await replayTutorial();
    expect(getProfile().handSeen).toBe(false);
    expect(await loadSeenTutorials()).toEqual([]);
    expect(getProfile().coins).toBe(30);
    expect((await loadProgress()).stars[1]).toBe(3);
  });
});
