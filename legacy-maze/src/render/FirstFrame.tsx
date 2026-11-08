import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';

/** Frames to let go by before calling a scene "drawn": the first ones may still be empty while the models are uploaded. */
const SETTLE_FRAMES = 4;

/**
 * Put inside a Canvas: calls `onReady` once, after the scene has actually drawn a few frames. The screen keeps a curtain over
 * the canvas until then, so the player never sees an empty violet scene.
 */
export function FirstFrame({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  const callback = useRef(onReady);
  useEffect(() => {
    callback.current = onReady;
  }, [onReady]);
  useFrame(() => {
    if (done.current) return;
    frames.current++;
    if (frames.current >= SETTLE_FRAMES) {
      done.current = true;
      callback.current?.();
    }
  });
  return null;
}
