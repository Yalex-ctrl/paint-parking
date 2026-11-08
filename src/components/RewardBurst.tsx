import { StyleSheet } from 'react-native';
import { useEffect, useMemo } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CoinIcon } from '@/ui/CoinIcon';
import { OutlineText } from '@/ui/OutlineText';
import { fontSizes } from '@/ui/theme';

const COINS = 9;

function FlyingCoin({ index, from, to, delay }: { index: number; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }) {
  const t = useSharedValue(0);
  const jitter = useMemo(() => ({ x: ((index * 37) % 60) - 30, y: ((index * 53) % 40) - 20 }), [index]);
  useEffect(() => {
    t.set(withDelay(delay + index * 55, withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) })));
  }, [t, index, delay]);
  const style = useAnimatedStyle(() => {
    const k = t.get();
    // Out of the board in a little burst, then to the counter.
    const burst = Math.min(1, k * 3);
    const x = from.x + jitter.x * burst + (to.x - from.x - jitter.x) * Math.max(0, (k - 0.3) / 0.7);
    const y = from.y + jitter.y * burst - 40 * Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) + (to.y - from.y + 40 - jitter.y) * Math.max(0, (k - 0.3) / 0.7);
    return { opacity: k <= 0 ? 0 : k >= 1 ? 0 : 1, transform: [{ translateX: x - 11 }, { translateY: y - 11 }, { scale: 1 - 0.4 * k }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.coin, style]}>
      <CoinIcon size={22} />
    </Animated.View>
  );
}

/** The coins of a finished level jump out of the board ("+10") and fly to the counter in the header. About a second. */
export function RewardBurst({
  total,
  from,
  to,
  count = COINS,
  showLabel = true,
  delay = 0,
}: {
  total: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** How many coins fly. */
  count?: number;
  /** The "+10" that rises from the start point. */
  showLabel?: boolean;
  /** Milliseconds before the coins leave. */
  delay?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 1100 }));
  }, [t]);
  const label = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, t.get() - 0.55) / 0.45, transform: [{ translateY: -50 * t.get() }, { scale: 0.7 + Math.min(1, t.get() * 6) * 0.3 }] }));
  if (total <= 0) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <FlyingCoin key={i} index={i} from={from} to={to} delay={delay} />
      ))}
      {showLabel && (
        <Animated.View pointerEvents="none" style={[styles.label, { left: from.x - 70, top: from.y - 30 }, label]}>
          <OutlineText style={styles.labelText} color="#ffd23f" width={2.5}>
            {`+${total}`}
          </OutlineText>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  coin: { position: 'absolute', top: 0, left: 0 },
  label: { position: 'absolute', width: 140, alignItems: 'center' },
  labelText: { fontSize: fontSizes.xxl, textAlign: 'center' },
});
