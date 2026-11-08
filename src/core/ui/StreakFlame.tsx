import { t } from '../i18n';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { multiplierOf, tierOf } from '@/core/streak';
import { Icon } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

/** Flame colour by tier: orange, red, violet, and the blue flame of the top tier (x3). */
export const FLAME_COLORS = ['#ff9f1c', '#ff4d4d', '#a855f7', '#38bdf8'] as const;

/**
 * The win streak: a flame with the number. It grows and changes colour with the tier, and pops when a tier is reached.
 * Dimmed at 0.
 */
export function StreakFlame({ streak, compact = false, height = 36, boost = 0, tight = false }: { streak: number; compact?: boolean; height?: number; boost?: number; tight?: boolean }) {
  const tier = tierOf(streak);
  const color = streak <= 0 ? colors.textMuted : FLAME_COLORS[tier];
  const size = (tight ? 15 : compact ? 20 : 24) + tier * (tight ? 2 : 3);
  const pop = useSharedValue(1);
  const lastTier = useRef(tier);
  useEffect(() => {
    if (tier > lastTier.current) pop.set(withSequence(withTiming(1.6, { duration: 180 }), withTiming(1, { duration: 320 })));
    lastTier.current = tier;
  }, [tier, pop]);
  // The streak has just multiplied the gain of a level: the flame swells and wiggles (no text).
  const wiggle = useSharedValue(0);
  const lastBoost = useRef(boost);
  useEffect(() => {
    if (boost !== lastBoost.current && boost > 0) {
      pop.set(withSequence(withTiming(1.5, { duration: 160 }), withTiming(1.15, { duration: 160 }), withTiming(1, { duration: 220 })));
      wiggle.set(withSequence(withTiming(1, { duration: 80 }), withTiming(-1, { duration: 140 }), withTiming(1, { duration: 140 }), withTiming(0, { duration: 80 })));
    }
    lastBoost.current = boost;
  }, [boost, pop, wiggle]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }, { rotate: `${wiggle.get() * 10}deg` }] }));
  return (
    <Animated.View style={[styles.pill, tight ? styles.pillTight : null, { height, borderRadius: height / 2 }, style]}>
      <Icon name="fire" size={size} color={color} />
      <Text style={[styles.count, tight ? styles.countTight : null, { color: streak <= 0 ? colors.textMuted : colors.text }]}>{streak}</Text>
      {tier > 0 && <Text style={[styles.mult, tight ? styles.multTight : null, { color }]}>×{multiplierOf(streak)}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 36, borderRadius: 18, backgroundColor: 'rgba(18, 12, 34, 0.62)' },
  pillTight: { gap: 2, paddingHorizontal: 5 },
  countTight: { fontSize: fontSizes.sm },
  multTight: { fontSize: 10 },
  count: { fontSize: fontSizes.md, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mult: { fontSize: fontSizes.xs, fontWeight: '800' },
});

/** Used by tests and the end screen: the label of a streak, e.g. "Série 5 ×2". */
export const streakLabel = (streak: number) => t('streak.label', { count: streak, mult: multiplierOf(streak) });
export const FlameSpacer = () => <View style={{ width: 6 }} />;
