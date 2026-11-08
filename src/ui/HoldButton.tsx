import { t } from '@/i18n';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { buttonColors, radius, fontSizes } from './theme';

/**
 * A button that only acts when it is held down for `seconds` (a bar fills while the finger stays on it). Letting go early
 * cancels and the bar empties: for actions that cannot be undone.
 */
export function HoldButton({ label, onDone, seconds = 2 }: { label: string; onDone: () => void; seconds?: number }) {
  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const c = buttonColors.danger;
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const start = () => {
    progress.set(withTiming(1, { duration: seconds * 1000, easing: Easing.linear }));
    timer.current = setTimeout(() => {
      timer.current = null;
      onDone();
    }, seconds * 1000);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    progress.set(withTiming(0, { duration: 180 }));
  };

  return (
    <Pressable onPressIn={start} onPressOut={cancel} accessibilityRole="button" accessibilityLabel={`${label} (${t('common.holdFor', { count: seconds })})`}>
      <View style={[styles.edge, { backgroundColor: c.edge }]}>
        <View style={[styles.face, { backgroundColor: c.face }]}>
          <Animated.View style={[styles.fill, { backgroundColor: c.edge }, fill]} />
          <Text style={[styles.label, { color: c.text }]}>{label}</Text>
          <Text style={[styles.hint, { color: c.text }]}>{t('common.holdFor', { count: seconds })}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { borderRadius: radius.xl, paddingBottom: 6 },
  face: { height: 64, borderRadius: radius.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, bottom: 0, opacity: 0.7 },
  label: { fontSize: fontSizes.md, fontWeight: '700' },
  hint: { fontSize: fontSizes.xs, opacity: 0.85 },
});
