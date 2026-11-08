import { useSyncExternalStore } from 'react';

/**
 * Which parts of the header and of the bottom buttons are on screen while the player is new. In the first five levels only the
 * title and the bar of the steps are there; after level 5 the guided tour brings the rest in one element at a time, each with a
 * little "pop", as it presents it. Everything is visible again once the tour is over, skipped or put off.
 *
 * `held` is true from the moment level 5 is won until the tour has been dealt with; the elements the tour has shown so far are
 * in `revealed`. The screens ask `hudVisible`.
 */
let held = false;
const revealed = new Set<string>();
let version = 0;
/** When everything was let in at once (skipped or put off): the pops are staggered. */
let cascadeAt = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => version;

/** Keeps the header minimal until the tour has been dealt with. */
export function holdHud(): void {
  held = true;
  revealed.clear();
  emit();
}

/** Lets one or more elements in (the tour is presenting them). */
export function revealHud(...ids: string[]): void {
  let changed = false;
  for (const id of ids) {
    if (!revealed.has(id)) {
      revealed.add(id);
      changed = true;
    }
  }
  if (changed) emit();
}

/** The tour is over (or skipped, or put off): everything is in; with `cascade` the pops follow one another. */
export function releaseHud(cascade: boolean): void {
  if (!held) return;
  held = false;
  cascadeAt = cascade ? Date.now() : 0;
  emit();
}

/** Back to the start (a reset of the progress). */
export function resetHud(): void {
  held = false;
  revealed.clear();
  cascadeAt = 0;
  emit();
}

export const isHudHeld = (): boolean => held;
/** True when the elements that have just come in are coming in together, one after the other. */
export const hudCascading = (): boolean => cascadeAt > 0 && Date.now() - cascadeAt < 200;

/** Is the element `id` on screen? `minimal`: the level itself asks for the minimal header (levels 1 to 5, first time). */
export const hudVisible = (minimal: boolean, id: string): boolean => !(minimal || held) || revealed.has(id);

/** Re-renders when the tour lets something in. */
export function useHudVersion(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
