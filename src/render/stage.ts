import type { Level } from '../game/types';
import type { ParkingScene } from './ParkingScene';
import type { Stage } from './ParkingCanvas';

/**
 * The lot to keep mounted below the current one for the transition. When the switch is made, the prepared level BECOMES the current
 * one while the screen still remembers it as "the next": mounting it twice would give two lots the same key, so it is not the next
 * any more as soon as it is the current one (or when it is the same level).
 */
export function nextStage(current: { level: Level; scene: ParkingScene }, prepared: { level: Level; scene: ParkingScene } | null, daily: boolean): Stage | null {
  if (!prepared || daily) return null;
  if (prepared.scene === current.scene || prepared.scene.uid === current.scene.uid) return null;
  return { level: prepared.level, scene: prepared.scene };
}
