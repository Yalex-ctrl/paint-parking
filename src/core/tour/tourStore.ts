import { useSyncExternalStore } from 'react';

/**
 * The state of the guided tour: running or not, and who to tell when it ends. The tour lives above every screen (see
 * components/GuidedTour), so the game, the shop, the gallery… only read `useTourRunning()` to pause themselves.
 */
type Listener = () => void;
let running = false;
let endCount = 0;
let lastEnd: TourEnd | null = null;
const listeners = new Set<Listener>();
const endListeners = new Set<(end: TourEnd) => void>();

/** How a tour ended: to the end (and the player pressed "Jouer"), or skipped. */
export type TourEnd = { completed: boolean };

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const isTourRunning = (): boolean => running;

export function startTour(): void {
  if (running) return;
  running = true;
  emit();
}

export function endTour(end: TourEnd): void {
  if (!running) return;
  running = false;
  endCount++;
  lastEnd = end;
  emit();
  endListeners.forEach((l) => l(end));
}

export const onTourEnd = (l: (end: TourEnd) => void): (() => void) => {
  endListeners.add(l);
  return () => endListeners.delete(l);
};

export const tourEndCount = () => endCount;
export const lastTourEnd = () => lastEnd;

/** Re-renders when the tour starts or stops. */
export function useTourRunning(): boolean {
  return useSyncExternalStore(subscribe, isTourRunning, isTourRunning);
}
