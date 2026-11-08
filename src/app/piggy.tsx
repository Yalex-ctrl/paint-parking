import { formatNumber, priceText, t, useLanguage } from '@/core/i18n';

import { useScreenReady } from '@/core/ui/useScreenReady';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONETIZATION } from '@/core/config/monetization';
import { canBreakPiggy, coinsUntilBreakable, fillRatio } from '@/core/piggy';
import { playSfx } from '@/core/services/audio';
import { Haptics, notify } from '@/core/services/haptics';
import { track } from '@/core/services/analytics';
import { purchaseProduct } from '@/core/services/purchases';
import { useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { CoinIcon } from '@/core/ui/CoinIcon';
import { PiggyBank } from '@/core/ui/PiggyBank';
import { PiggyGauge } from '@/core/ui/PiggyGauge';
import { ScreenHeader } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';
import { testerTools } from '@/core/config/tester';

const SHARDS = Array.from({ length: 8 }, (_, i) => ({ angle: (i / 8) * Math.PI * 2 + 0.3, dist: 90 + (i % 3) * 30, size: 18 + (i % 4) * 6 }));
const COINS = Array.from({ length: 14 }, (_, i) => ({ angle: -Math.PI / 2 + ((i - 6.5) / 14) * Math.PI * 1.1, dist: 120 + (i % 4) * 40, delay: (i % 5) * 0.04 }));

/** One piece of the broken piggy bank, flying out and spinning. */
function Shard({ t, angle, dist, size }: { t: { get: () => number }; angle: number; dist: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const k = t.get();
    return {
      opacity: k <= 0 ? 0 : 1 - Math.max(0, k - 0.6) / 0.4,
      transform: [{ translateX: Math.cos(angle) * dist * k }, { translateY: Math.sin(angle) * dist * k + 90 * k * k }, { rotate: `${k * 540}deg` }],
    };
  });
  return <Animated.View style={[styles.shard, { width: size, height: size }, style]} />;
}

/** A coin leaving the broken piggy bank toward the counter. */
function FlyingCoin({ t, angle, dist, delay }: { t: { get: () => number }; angle: number; dist: number; delay: number }) {
  const style = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (t.get() - delay) / (1 - delay)));
    return {
      opacity: k <= 0 ? 0 : 1 - Math.max(0, k - 0.75) / 0.25,
      transform: [{ translateX: Math.cos(angle) * dist * k + 60 * k * k }, { translateY: Math.sin(angle) * dist * k - 120 * k * k }, { scale: 1 - 0.4 * k }],
    };
  });
  return (
    <Animated.View style={[styles.flyingCoin, style]}>
      <CoinIcon size={26} />
    </Animated.View>
  );
}

/** The piggy bank: how much it holds, and the button to break it (a simulated purchase). */
export default function PiggyScreen() {
  useLanguage();
  useScreenReady('/piggy');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const [broken, setBroken] = useState<number | null>(null);
  const burst = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const piggyStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.get() * 9}deg` }, { scale: 1 + wiggle.get() * 0.04 }], opacity: broken !== null && burst.get() > 0.02 ? 0 : 1 }));

  const { capacity, breakFrom, product } = MONETIZATION.piggy;
  const can = canBreakPiggy(profile);

  const breakIt = useCallback(async () => {
    const holding = profile.piggy.coins;
    if (!(await purchaseProduct(product.id))) return;
    setBroken(holding);
    track('piggy_broken', { coins: holding });
    // Shakes, breaks, coins fly out.
    wiggle.set(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 110 }), withTiming(1, { duration: 110 }), withTiming(-1, { duration: 110 }), withTiming(0, { duration: 70 })));
    setTimeout(() => {
      playSfx('piggy_break');
      notify(Haptics.NotificationFeedbackType.Success);
      burst.set(withTiming(1, { duration: 1100 }));
    }, 480);
  }, [profile.piggy.coins, product.id, burst, wiggle]);

  useEffect(() => {
    if (broken === null) return;
    const id = setTimeout(() => setBroken(null), 2600);
    return () => clearTimeout(id);
  }, [broken]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hud.piggy')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.stage}>
          <Animated.View style={piggyStyle}>
            <PiggyBank ratio={broken !== null ? 1 : fillRatio(profile)} size={250} />
          </Animated.View>
          {broken !== null && (
            <View style={styles.burst} pointerEvents="none">
              {SHARDS.map((s, i) => (
                <Shard key={i} t={burst} {...s} />
              ))}
              {COINS.map((c, i) => (
                <FlyingCoin key={i} t={burst} {...c} />
              ))}
            </View>
          )}
        </View>

        <Text style={styles.amount}>
          {broken !== null ? t('piggy.broke', { amount: formatNumber(broken) }) : t('piggy.amount', { coins: formatNumber(profile.piggy.coins), capacity: formatNumber(capacity) })}
        </Text>
        {broken === null && <PiggyGauge coins={profile.piggy.coins} height={28} />}
        <Text style={styles.explain}>
          {t('piggy.explain', { amount: formatNumber(breakFrom) })}
        </Text>

        <Button3D
          block
          size="lg"
          variant={can ? 'primary' : 'neutral'}
          disabled={!can || broken !== null}
          label={can ? t('piggy.breakFor', { price: priceText(product.id, product.priceEur) }) : t('piggy.moreCoins', { amount: formatNumber(coinsUntilBreakable(profile)) })}
          onPress={breakIt}
        />
        {testerTools() && <Text style={styles.fine}>{t('common.simulatedPurchases')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: MARGIN, gap: 14, justifyContent: 'center' },
  stage: { height: 220, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', alignSelf: 'center', top: 110, width: 1, height: 1 },
  shard: { position: 'absolute', borderRadius: 5, backgroundColor: '#ff9db8', borderWidth: 2, borderColor: '#e8708f' },
  flyingCoin: { position: 'absolute' },
  amount: { color: colors.gold, fontSize: fontSizes.xl, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  explain: { color: colors.textSoft, fontSize: fontSizes.sm, lineHeight: 21, textAlign: 'center', paddingHorizontal: 6 },
  fine: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
});
