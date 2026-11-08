import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { MONETIZATION } from '@/core/config/monetization';
import { dayKeyOf } from '@/core/dates';
import { PlayTimer, type PlayContext } from '@/core/playTimer';
import { nextChestFraction, playChests, rolloverRewards } from '@/core/rewards';
import { getProfile, updateProfile } from '@/core/storage/profile';

/**
 * The active play clock of the day, for the chests of the "Cadeaux" panel: it ticks once a second, counts only real play (see
 * game/playTimer.ts), keeps the seconds in memory and writes them to the profile every ten seconds (and when a chest is reached or
 * the app leaves the screen), so the whole interface is not woken up every second. At midnight the day starts again.
 */
const timer = new PlayTimer(MONETIZATION.rewards.playChests.activeWindowSec * 1000);
let ctx: PlayContext = { appActive: true, levelActive: false, blocked: false };
let pending = 0;
let sinceSave = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let bumps = 0;
let seconds = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The screen tells what is going on: a level is in progress, something hides it. */
export function setPlayContext(patch: Partial<PlayContext>): void {
  ctx = { ...ctx, ...patch };
}

/** The player swiped. */
export const notePlaySwipe = (): void => timer.swipe(Date.now());

function persist() {
  if (pending <= 0) return;
  const add = pending;
  pending = 0;
  sinceSave = 0;
  updateProfile((p) => ({ ...p, rewards: { ...p.rewards, playSeconds: p.rewards.playSeconds + add } }));
}

function tick() {
  const now = Date.now();
  // Midnight: the day starts again (the chests of yesterday that were not opened are lost).
  const today = dayKeyOf(new Date(now));
  if (getProfile().rewards.day !== today) {
    pending = 0;
    updateProfile((p) => rolloverRewards(p, today));
    seconds = 0;
    emit();
  }
  const add = timer.tick(now, ctx);
  if (add <= 0) return;
  const before = playChests(getProfile().rewards).filter((c) => c.ready || c.opened).length;
  pending += add;
  seconds = getProfile().rewards.playSeconds + pending;
  // A chest has just been reached: it is written at once, and the icon of the panel jumps.
  const after = playChests({ ...getProfile().rewards, playSeconds: seconds }).filter((c) => c.ready || c.opened).length;
  if (after > before) {
    persist();
    bumps++;
    // Loaded when needed: the clock must not pull the whole sound engine in with it (reset, tests).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./audio').playSfx('chest', 0.35);
  } else if (++sinceSave >= 10) persist();
  emit();
}

/** Starts the clock (once, at the start of the app). */
export function startPlayTime(): void {
  if (interval) return;
  timer.skip(Date.now());
  interval = setInterval(tick, 1000);
  AppState.addEventListener('change', (state) => {
    ctx = { ...ctx, appActive: state === 'active' };
    if (state === 'active') timer.skip(Date.now());
    else persist();
  });
}

export function stopPlayTime(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

/** The fraction (0..1) to the next chest, counting the seconds not written yet. */
export function playProgress(): { fraction: number; bumps: number } {
  const r = getProfile().rewards;
  return { fraction: nextChestFraction({ ...r, playSeconds: r.playSeconds + pending }), bumps };
}

let snapshot = { fraction: 0, bumps: 0 };
const getSnapshot = () => {
  const now = playProgress();
  // A new object only when the picture changes (the gauge redraws a few times a minute, not every second).
  if (Math.abs(now.fraction - snapshot.fraction) > 0.004 || now.bumps !== snapshot.bumps) snapshot = now;
  return snapshot;
};

/** Re-renders (rarely) as the gauge moves. */
export function usePlayProgress(): { fraction: number; bumps: number } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const livePlaySeconds = (): number => getProfile().rewards.playSeconds + pending;
/** "Remettre à zéro" (and the tests): the seconds not written yet are forgotten. */
export function resetPlayTime(): void {
  pending = 0;
  sinceSave = 0;
  bumps = 0;
  seconds = 0;
  snapshot = { fraction: 0, bumps: 0 };
}
void seconds;
