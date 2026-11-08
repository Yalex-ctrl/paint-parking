import { useCommitTimer } from '../render/useCommitTimer';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/ui/theme';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const COLORS = [colors.gold, colors.red, colors.greenLight, '#4cc9f0', '#c77dff', colors.text];

function Piece({ x, delay, color, drift, spin, height }: { x: number; delay: number; color: string; drift: number; spin: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1700, easing: Easing.in(Easing.quad) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value * t.value,
    transform: [{ translateY: -20 + t.value * height }, { translateX: drift * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.piece, { left: x, backgroundColor: color }, style]} />;
}

/** A burst of paper confetti falling over a region of the given size. Touches pass through. */
export function Confetti({ width, height, count = 36, palette }: { width: number; height: number; count?: number; palette?: string[] }) {
  useCommitTimer('Confetti');
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: ((i * 37) % 100) / 100 * width,
        delay: (i % 9) * 70,
        color: (palette && palette.length > 0 ? palette : COLORS)[i % (palette && palette.length > 0 ? palette.length : COLORS.length)],
        drift: ((i * 53) % 80) - 40,
        spin: 180 + ((i * 29) % 360),
      })),
    [count, width, palette],
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, width: 9, height: 14, borderRadius: 2 },
});
