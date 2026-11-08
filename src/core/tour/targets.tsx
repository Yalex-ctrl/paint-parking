import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';

/** Where an element is on the screen, in window coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };

type Entry = { ref: RefObject<HostInstance | null>; press?: () => void; reveal?: () => void };
const entries = new Map<string, Entry>();

/**
 * The elements a tutorial can point at. Each one declares itself with a ref under an id; its place on the screen is only
 * measured when a step needs it (measureInWindow), so the spotlight is right on every screen and every phone.
 */
export function registerTarget(id: string, entry: Entry): () => void {
  entries.set(id, entry);
  return () => {
    if (entries.get(id) === entry) entries.delete(id);
  };
}

/** Registers `ref` under `id` for as long as the component is mounted. `press` shows the press animation of the element. */
export function useTourTarget(id: string | undefined, press?: () => void, reveal?: () => void): RefObject<HostInstance | null> {
  const ref = useRef<HostInstance>(null);
  const hasPress = press !== undefined;
  const hasReveal = reveal !== undefined;
  const pressRef = useRef(press);
  const revealRef = useRef(reveal);
  useEffect(() => {
    pressRef.current = press;
    revealRef.current = reveal;
  });
  useEffect(() => {
    if (!id) return;
    return registerTarget(id, { ref, press: hasPress ? () => pressRef.current?.() : undefined, reveal: hasReveal ? () => revealRef.current?.() : undefined });
  }, [id, hasPress, hasReveal]);
  return ref;
}

/** A transparent wrapper that makes its content a target. `reveal` brings it into view when the tour is about to present it. */
export function Target({ id, children, style, reveal }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle>; reveal?: () => void }) {
  const ref = useTourTarget(id, undefined, reveal);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export const hasTarget = (id: string): boolean => entries.has(id);

/** The measured rectangle of a target, or null when it is not on screen (not mounted, hidden, zero-sized). */
export function measureTarget(id: string): Promise<Rect | null> {
  const view = entries.get(id)?.ref.current;
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 && Number.isFinite(x) && Number.isFinite(y) ? { x, y, width, height } : null);
    });
  });
}

/** Waits (up to `timeoutMs`) for a target to be there and measurable: a screen that has just opened takes a moment to lay out. */
export async function waitForTarget(id: string, timeoutMs = 2500): Promise<Rect | null> {
  const end = Date.now() + timeoutMs;
  let last: Rect | null = null;
  // Two equal measures in a row: the element has stopped moving (the screen has finished sliding in).
  while (Date.now() < end) {
    const r = await measureTarget(id);
    if (r && last && Math.abs(r.x - last.x) < 1 && Math.abs(r.y - last.y) < 1) return r;
    last = r;
    await new Promise((res) => setTimeout(res, 80));
  }
  return last;
}

/** Plays the press animation of a target that has one (a Button3D). False when it has none. */
export function pressTarget(id: string): boolean {
  const press = entries.get(id)?.press;
  if (!press) return false;
  press();
  return true;
}

/** Brings a target into view (scrolls the list that holds it); nothing happens for a target that needs no scrolling. */
export function revealTarget(id: string): boolean {
  const reveal = entries.get(id)?.reveal;
  if (!reveal) return false;
  reveal();
  return true;
}

/** What the hand does for real when it presses a target that is not a way into another screen (it switches the tab of the shop). */
const actions = new Map<string, () => void>();
export function registerTourAction(id: string, fn: () => void): () => void {
  actions.set(id, fn);
  return () => {
    if (actions.get(id) === fn) actions.delete(id);
  };
}
export function runTourAction(id: string): boolean {
  const fn = actions.get(id);
  if (!fn) return false;
  fn();
  return true;
}
