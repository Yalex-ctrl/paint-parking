import { benchTimed } from '../render/bench';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { PROFILE_VERSION, defaultProfile, earnCoins, normalizeProfile, type Profile } from '../economy';

/**
 * The profile store: one in-memory copy of the player's profile (coins, shop, streak, ...) that every
 * screen reads and changes through `updateProfile`, saved to AsyncStorage a moment after each change.
 * The rules themselves live in game/economy.ts and game/daily.ts (pure and tested).
 */
import { runWhenIdle } from '../services/idleQueue';
import { KEYS } from './keys';

const KEY = KEYS.profile;
const OLD_WALLET_KEY = KEYS.oldWallet; // earlier versions kept coins there

let current: Profile = defaultProfile();
let loaded = false;
let loading: Promise<Profile> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

async function save() {
  saveTimer = null;
  try {
    await AsyncStorage.setItem(KEY, benchTimed('save profile (stringify)', () => JSON.stringify(current)));
  } catch {
    // The in-memory profile stays right for this session.
  }
}

/** Reads the saved profile (once). Safe to call from several places. */
export function loadProfile(): Promise<Profile> {
  if (loaded) return Promise.resolve(current);
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      // Whatever was saved for the first campaign's levels is dropped, even when the profile itself is kept.
      await AsyncStorage.multiRemove([KEYS.progressV1, KEYS.progressV2]);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Profile>;
        current = normalizeProfile(parsed);
        if ((parsed.version ?? 1) < PROFILE_VERSION) {
          await AsyncStorage.multiRemove([KEYS.tutorials, KEYS.mapSeen]);
          await AsyncStorage.setItem(KEY, JSON.stringify(current));
        }
      } else {
        // First run of this version: bring over the coins of the old wallet, if any.
        const old = await AsyncStorage.getItem(OLD_WALLET_KEY);
        if (old) {
          const w = JSON.parse(old) as { coins?: number; collected?: Record<number, number> };
          current = { ...earnCoins(defaultProfile(), w.coins ?? 0), collectedCoins: w.collected ?? {} };
        }
      }
    } catch {
      current = defaultProfile();
    }
    loaded = true;
    notify();
    return current;
  })();
  return loading;
}

export const isProfileLoaded = () => loaded;
export const getProfile = (): Profile => current;

/** Changes the profile (a pure function of the old one), notifies the screens and schedules a save. */
export function updateProfile(change: (p: Profile) => Profile): Profile {
  const next = change(current);
  if (next === current) return current;
  current = next;
  notify();
  if (saveTimer) clearTimeout(saveTimer);
  // The write is queued for when the game is quiet: never in the middle of a crossing between two levels.
  saveTimer = setTimeout(() => runWhenIdle(() => void save()), 250);
  return current;
}

/** Replaces the whole profile (used by the reset of the progress). */
export function replaceProfile(p: Profile) {
  updateProfile(() => p);
}

/** Writes right now (call before the app can be closed). */
export async function flushProfile() {
  if (saveTimer) clearTimeout(saveTimer);
  await save();
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The profile as React state: the component re-renders whenever it changes. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribeProfile, getProfile, getProfile);
}

/** For tests and the dev tools. */
export function resetProfileForTests(p: Profile = defaultProfile()) {
  current = p;
  loaded = true;
  loading = Promise.resolve(p);
  notify();
}
