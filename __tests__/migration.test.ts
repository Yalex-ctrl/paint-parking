import * as THREE from 'three';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultProfile, PROFILE_VERSION } from '../src/game/economy';
import { levelPaintColor } from '../src/game/mapLayout';
import { KEYS } from '../src/storage/keys';
import { loadProfile } from '../src/storage/profile';
import { loadProgress } from '../src/storage/progress';
import { RIBBON_SLICES, pathRibbon, recolorRibbon } from '../src/render/map/mapGeometry';

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

describe('path on the map', () => {
  it('a stretch takes the colour of its level once finished, and is grey before', () => {
    const grey = new THREE.Color('#8d89a3');
    const g = pathRibbon(1, 6, 0.8, grey, grey);
    recolorRibbon(g, 1, (id) => id <= 2);
    const color = g.getAttribute('color') as THREE.BufferAttribute;
    const at = (level: number) => {
      const i = ((level - 1) * RIBBON_SLICES + 2) * 2; // a vertex in the middle of that level's stretch
      return new THREE.Color(color.getX(i), color.getY(i), color.getZ(i));
    };
    const painted = new THREE.Color(levelPaintColor(1, undefined));
    expect(at(1).getHex()).toBe(painted.getHex());
    expect(at(2).getHex()).not.toBe(at(3).getHex());
    // unfinished stretches are grey (low saturation) and never take the level colour
    const hsl = { h: 0, s: 0, l: 0 };
    at(4).getHSL(hsl);
    expect(hsl.s).toBeLessThan(0.25);
    g.dispose();
  });
});
