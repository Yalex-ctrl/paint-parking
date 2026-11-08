import { t } from '@/core/i18n';
import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { stepDots, type DotState } from '@/core/steps';
import { useThumbnail } from '@/core/render/useThumbnail';
import { useProfile } from '@/core/storage/profile';
import { Icon } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors } from '@/core/ui/theme';

const DOT = 24;

/** One level of the step: a green tick when done (it pops when it becomes done), the player's ball on the current one, a ring if still to do. */
function Dot({ state }: { state: DotState }) {
  const profile = useProfile();
  const uri = useThumbnail('ball', profile.equipped.ball);
  const pop = useSharedValue(1);
  const last = useRef(state);
  useEffect(() => {
    if (last.current !== 'done' && state === 'done') pop.set(withSequence(withTiming(1.5, { duration: 160 }), withTiming(1, { duration: 260 })));
    last.current = state;
  }, [state, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  if (state === 'done') {
    return (
      <Animated.View style={[styles.dot, styles.done, style]}>
        <Icon name="check-bold" size={15} color={colors.text} />
      </Animated.View>
    );
  }
  if (state === 'current') {
    return <View style={[styles.dot, styles.current]}>{uri ? <Image source={{ uri }} style={styles.ball} /> : <View style={[styles.ball, { backgroundColor: colors.gold }]} />}</View>;
  }
  return <View style={[styles.dot, styles.todo]} />;
}

/**
 * The bar under the title: the five levels of the step the player is on, one dot each, and the chest at the end. It replaces the
 * map: the next goal is always in sight.
 */
export function StepBar({ levelId, stars }: { levelId: number; stars: Record<number, number> }) {
  const dots = stepDots(levelId, stars);
  const complete = dots.every((d) => d.state === 'done');
  const left = dots.filter((d) => d.state !== 'done').length;
  return (
    <View>
      <View style={styles.row}>
        {dots.map((d) => (
          <Dot key={d.id} state={d.state} />
        ))}
        <View style={styles.chest}>
          <Icon name={complete ? 'treasure-chest-outline' : 'treasure-chest'} size={26} color={complete ? colors.textMuted : colors.coin} />
        </View>
      </View>
      {left > 0 && (
        <Text style={styles.left} pointerEvents="none" numberOfLines={1}>
          {t('hud.levelsLeft', { count: left })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', top: 31, left: 0, right: 0, textAlign: 'center', color: colors.text, fontSize: 10, fontWeight: '800', textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 30, paddingHorizontal: 12, borderRadius: 15, alignSelf: 'center', backgroundColor: 'rgba(18, 12, 34, 0.55)' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.greenDeep },
  current: { backgroundColor: 'rgba(255, 255, 255, 0.18)', borderWidth: 2, borderColor: colors.gold },
  todo: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.35)' },
  ball: { width: DOT - 6, height: DOT - 6, borderRadius: (DOT - 6) / 2 },
  chest: { marginLeft: 2 },
});
