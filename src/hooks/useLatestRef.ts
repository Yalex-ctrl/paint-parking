import { useLayoutEffect, useRef, type RefObject } from 'react';

/** A ref that always holds the latest value (written after each render, so event handlers and timers never read an old one). */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
