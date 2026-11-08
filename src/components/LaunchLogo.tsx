import { StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Title3D } from '@/ui/Title3D';

/**
 * The logo, at the top of the level when the app opens: it shows for a few seconds, then folds up softly (it shrinks, rises and
 * fades) to leave the room to the header. It folds at once on the first swipe. Only at launch, never between two levels.
 */
export function LaunchLogo({ show, top }: { show: boolean; top: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withTiming(show ? 0 : 1, { duration: show ? 0 : 600, easing: Easing.inOut(Easing.cubic) }));
  }, [show, k]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - k.get(), transform: [{ translateY: -90 * k.get() }, { scale: 0.62 - 0.25 * k.get() }] }));
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <Animated.View style={style}>
        <Title3D />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', height: 150 },
});
