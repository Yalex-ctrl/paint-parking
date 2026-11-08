import { useEffect, useRef, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { playSfx } from '@/core/services/audio';
import { hudCascading, hudVisible, useHudVersion } from '@/core/tour/hudStore';

const CASCADE_MS = 90;

/**
 * An element of the header (or the bottom buttons) that is only there once the player has met it: hidden while `minimal` (or while
 * the tour is pending) and not revealed, then it comes in with a "pop" (0 to 110 % then 100 %, with a small sound). It only moves by
 * scale and opacity, so the layout around it never changes. Elements already visible when the screen opens do not pop.
 */
export function HudPop({
  id,
  index = 0,
  minimal,
  force = false,
  style,
  children,
}: {
  id: string;
  /** Position in the cascade when everything comes in at once. */
  index?: number;
  minimal: boolean;
  /** Visible whatever the rest says (the restart button of a player who is stuck). */
  force?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  useHudVersion();
  const visible = force || hudVisible(minimal, id);
  const scale = useSharedValue(visible ? 1 : 0);
  const was = useRef(visible);
  useEffect(() => {
    if (visible === was.current) return;
    was.current = visible;
    if (!visible) {
      scale.set(0);
      return;
    }
    const delay = hudCascading() ? index * CASCADE_MS : 0;
    scale.set(withDelay(delay, withSequence(withTiming(1.1, { duration: 170 }), withTiming(1, { duration: 110 }))));
    const sound = setTimeout(() => playSfx('popup_open', 0.5), delay);
    return () => clearTimeout(sound);
  }, [visible, index, scale]);
  const pop = useAnimatedStyle(() => ({ opacity: scale.get() > 0.01 ? 1 : 0, transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[style, pop]}>
      {children}
    </Animated.View>
  );
}
