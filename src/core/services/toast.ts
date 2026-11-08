import { useSyncExternalStore } from 'react';

/** A small message that comes up for a moment and goes away by itself (never a pop-up that blocks). */
export type Toast = { id: number; message: string };

let current: Toast | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function showToast(message: string, ms = 3200): void {
  current = { id: ++counter, message };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, ms);
  emit();
}

export const currentToast = (): Toast | null => current;
export const useToast = (): Toast | null => useSyncExternalStore(subscribe, currentToast, currentToast);

export function clearToastForTests(): void {
  current = null;
  if (timer) clearTimeout(timer);
}
