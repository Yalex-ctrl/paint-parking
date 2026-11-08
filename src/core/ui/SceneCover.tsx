import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

/**
 * A curtain over a whole screen, in the colour of the world: opaque while `covered`, then it fades away to show the scene all at
 * once. It never takes touches.
 */
export function SceneCover({ covered, color, fadeMs = 380 }: { covered: boolean; color: string; fadeMs?: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(covered ? 1 : withTiming(0, { duration: fadeMs }));
  }, [covered, fadeMs, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}
