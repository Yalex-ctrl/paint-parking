import { benchTimed } from '../render/bench';
import * as Haptics from 'expo-haptics';

/** Vibrations, behind the player's "Vibrations" setting. Never throws. */
let enabled = true;

export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

export function impact(style: Haptics.ImpactFeedbackStyle) {
  if (enabled) benchTimed('haptic impact', () => Haptics.impactAsync(style).catch(() => {}));
}

export function notify(type: Haptics.NotificationFeedbackType) {
  if (enabled) benchTimed('haptic notify', () => Haptics.notificationAsync(type).catch(() => {}));
}

export { Haptics };
