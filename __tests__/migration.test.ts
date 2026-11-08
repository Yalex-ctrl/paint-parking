
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultProfile, PROFILE_VERSION } from '../src/core/economy';
import { KEYS } from '../src/core/storage/keys';
import { loadProfile } from '../src/core/storage/profile';
import { loadProgress } from '../src/core/storage/progress';

describe('save made for the first campaign', () => {
  it('keeps coins and purchases, drops the level progress and what hangs on levels', async () => {
    const old = { ...defaultProfile(), version: 1, coins: 777, owned: ['ball-default', 'ball-extra'], chestsOpened: [1, 2], collectedCoins: { 5: 1 }, bestScores: { 5: 900 } };
    await AsyncStorage.clear();
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(old));
    await AsyncStorage.setItem(KEYS.progressV1, JSON.stringify({ current: 120, stars: { 1: 3 }, moves: { 1: 4 } }));
    await AsyncStorage.setItem(KEYS.progressV2, JSON.stringify({ current: 90, stars: { 1: 3 }, moves: { 1: 4 } }));
    const profile = await loadProfile();
    expect(profile.coins).toBe(777);
    expect(profile.owned).toContain('ball-extra');
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.chestsOpened).toEqual([]);
    expect(profile.collectedCoins).toEqual({});
    expect(profile.bestScores).toEqual({});
    // The first campaign's progress is gone, and the new campaign starts from level 1.
    expect(await AsyncStorage.getItem(KEYS.progressV1)).toBeNull();
    expect(await AsyncStorage.getItem(KEYS.progressV2)).toBeNull();
    expect(await loadProgress()).toEqual({ current: 1, stars: {}, moves: {} });
  });
});

