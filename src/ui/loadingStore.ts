import { useSyncExternalStore } from 'react';

import { LOADING } from '../config/app';

/**
 * State of the loading screen, shared by the whole app. Every navigation starts it for the screen being opened; that screen says
 * when it is ready (its first 3D frame, or its mount for the screens without 3D); the screen then leaves, once the minimum time has
 * passed. At launch it also waits for the preloading (fonts, models, sounds).
 */
export type LoadingState = {
  covered: boolean;
  kind: 'launch' | 'transition';
  startedAt: number;
  /** The route being opened ("/map"...); only its own ready signal counts. */
  expected: string;
  routeReady: boolean;
  /** Launch only: the fonts, the models and the sounds are loaded. */
  launchReady: boolean;
  /** Launch only: share (0-1) of the preloading done. */
  launchProgress: number;
};

let state: LoadingState = { covered: true, kind: 'launch', startedAt: Date.now(), expected: '/', routeReady: false, launchReady: false, launchProgress: 0.1 };
const listeners = new Set<() => void>();
const set = (patch: Partial<LoadingState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const getLoading = () => state;
export const subscribeLoading = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useLoading = () => useSyncExternalStore(subscribeLoading, getLoading, getLoading);

/** A navigation to `route` began: the loading screen comes in (unless it is already there for the same route). */
export function startLoading(route: string) {
  if (state.covered && state.expected === route) return;
  // Still starting up (the app opened straight on another screen): it stays the launch loading, just for the new route.
  if (state.covered && state.kind === 'launch') {
    set({ expected: route, routeReady: false });
    return;
  }
  set({ covered: true, kind: 'transition', startedAt: Date.now(), expected: route, routeReady: false });
}

/** The screen `route` has drawn what it needs (first 3D frame, or mounted). */
export function markReady(route: string) {
  if (route === state.expected && !state.routeReady) set({ routeReady: true });
}

export const setLaunchProgress = (p: number) => set({ launchProgress: Math.max(state.launchProgress, Math.min(1, p)) });
export const setLaunchReady = () => set({ launchReady: true, launchProgress: 1 });

/** The loading screen has finished fading out. */
export function endLoading() {
  set({ covered: false });
}

/** Minimum time (ms) the loading screen stays for the current wait. */
export const minDuration = (s: LoadingState = state) => (s.kind === 'launch' ? LOADING.launchMinMs : LOADING.transitionMinMs);

/**
 * When the loading screen should start to fade, given what is known: null while something is still loading, else the moment
 * (ms, same clock as `startedAt`). Pure (tested).
 */
export function leaveAt(s: Pick<LoadingState, 'kind' | 'startedAt' | 'routeReady' | 'launchReady'>, readyAt: number | null): number | null {
  const ready = s.routeReady && (s.kind === 'transition' || s.launchReady);
  if (!ready || readyAt === null) return null;
  return Math.max(readyAt, s.startedAt + (s.kind === 'launch' ? LOADING.launchMinMs : LOADING.transitionMinMs));
}
