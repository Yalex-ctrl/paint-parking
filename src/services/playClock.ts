import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { KEYS } from '@/storage/keys';

/**
 * The play clock: counts the seconds the app is on screen (never the seconds it is in the background), so the ad rules are about
 * time actually played. It remembers when the last ad ended and when the last failure or purchase happened, in play seconds. It is
 * saved every ten seconds and when the app goes away.
 */
type Saved = { total: number; lastAdAt: number | null; lastEventAt: number | null };

let total = 0;
let session = 0;
let lastAdAt: number | null = null;
let lastEventAt: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
let sinceSave = 0;

const save = () => {
  const data: Saved = { total, lastAdAt, lastEventAt };
  AsyncStorage.setItem(KEYS.playClock, JSON.stringify(data)).catch(() => {});
};

const tick = () => {
  if (AppState.currentState !== 'active') return;
  total += 1;
  session += 1;
  if (++sinceSave >= 10) {
    sinceSave = 0;
    save();
  }
};

/** Starts counting (once, at the start of the app). */
export async function startPlayClock(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const raw = await AsyncStorage.getItem(KEYS.playClock);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      total = Math.max(0, Number(s.total) || 0);
      lastAdAt = typeof s.lastAdAt === 'number' ? s.lastAdAt : null;
      lastEventAt = typeof s.lastEventAt === 'number' ? s.lastEventAt : null;
    }
  } catch {
    // A fresh clock.
  }
  timer = setInterval(tick, 1000);
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') save();
  });
}

export function stopPlayClock(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

/** An ad (rewarded or not) has just ended: the next interstitial is at least five minutes of play away. */
export const noteAdEnded = (): void => {
  lastAdAt = total;
  save();
};

/** A failure or a purchase has just happened: no interstitial right after. */
export const noteEvent = (): void => {
  lastEventAt = total;
};

/** What the ad rules need. */
export const playContext = () => ({ sessionSeconds: session, playSeconds: total, lastAdAt, lastEventAt });

/** For tests. */
export function resetPlayClockForTests(): void {
  total = 0;
  session = 0;
  lastAdAt = null;
  lastEventAt = null;
  sinceSave = 0;
  started = false;
}
export const _setPlayClockForTests = (s: { total: number; session: number }) => {
  total = s.total;
  session = s.session;
};
