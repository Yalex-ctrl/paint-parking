import { useSyncExternalStore } from 'react';

import { MONETIZATION } from './monetization';
import { testerTools } from './tester';

/**
 * The two game rules that can be switched off (lives, move limit): the values of config/monetization.ts, unless the dev menu has
 * flipped one (no rebuild needed). Every screen reads them from here, never from the config directly.
 */
type Overrides = { lives?: boolean; moveLimit?: boolean; openLevels?: boolean; freeCamera?: boolean };
let overrides: Overrides = {};
const listeners = new Set<() => void>();

export const livesOn = (): boolean => overrides.lives ?? MONETIZATION.features.lives;
export const moveLimitOn = (): boolean => overrides.moveLimit ?? MONETIZATION.features.moveLimit;
/** Developer mode: every level of the map can be played, whatever the progress (on by default where the tester tools are; "Outils de test" can turn it off). */
/** Developer tool: turn round the board with two fingers (off unless the dev menu turns it on; never in a release build). */
export const freeCameraOn = (): boolean => testerTools() && (overrides.freeCamera ?? false);
export const openLevelsOn = (): boolean => testerTools() && (overrides.openLevels ?? true);

export function setFeatureOverride(patch: Overrides) {
  overrides = { ...overrides, ...patch };
  cachedSnapshot = `${livesOn() ? 1 : 0}${moveLimitOn() ? 1 : 0}${openLevelsOn() ? 1 : 0}${freeCameraOn() ? 1 : 0}`;
  listeners.forEach((l) => l());
}

let cachedSnapshot = `${livesOn() ? 1 : 0}${moveLimitOn() ? 1 : 0}${openLevelsOn() ? 1 : 0}${freeCameraOn() ? 1 : 0}`;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => cachedSnapshot;

/** Re-renders when a rule is flipped. */
export function useFeatures(): { lives: boolean; moveLimit: boolean; freeCamera: boolean } {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { lives: livesOn(), moveLimit: moveLimitOn(), freeCamera: freeCameraOn() };
}

export function resetFeatureOverrides() {
  overrides = {};
  setFeatureOverride({});
}
