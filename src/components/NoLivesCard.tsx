import { priceText, t, useLanguage } from '@/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { MONETIZATION } from '@/config/monetization';
import { dayKeyOf } from '@/game/dates';
import { formatDuration } from '@/game/duration';
import { adLivesLeft } from '@/game/lives';
import { ads } from '@/services/ads';
import { addLifeForAd, refillWithCoins, useLivesView } from '@/storage/lives';
import { useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinAmount } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/**
 * At 0 lives: the level stays visible behind a veil and this card sits in the middle: the time before the next life, a life for a
 * rewarded ad, all of them for coins, the offers, and what can be done without a life (the daily challenge, the shop, the gallery).
 * It goes away by itself, with a heart popping, as soon as a life is back.
 */
export function NoLivesCard() {
  useLanguage();
  const router = useRouter();
  const profile = useProfile();
  const v = useLivesView();
  const adLeft = adLivesLeft(profile.lives, dayKeyOf(new Date()));
  const canPay = profile.coins >= MONETIZATION.lives.refillCoinCost;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.veil}>
      <View style={styles.card}>
        <Icon name="heart-broken" size={46} color={colors.red} />
        <Text style={styles.title}>{t('lives.none')}</Text>
        {v.nextInMs !== null && <Text style={styles.countdown}>{t('lives.nextIn', { time: formatDuration(v.nextInMs) })}</Text>}
        {adLeft > 0 ? (
          <Button3D
            block
            variant="success"
            icon="play-circle-outline"
            label={t('lives.adLife', { count: adLeft })}
            onPress={() => ads.showRewarded('extra_life').then((ok) => ok && addLifeForAd())}
          />
        ) : (
          <Text style={styles.small}>{t('lives.noMoreAds')}</Text>
        )}
        <Button3D block variant={canPay ? 'primary' : 'neutral'} disabled={!canPay} onPress={refillWithCoins}>
          <Text style={[styles.btn, { color: canPay ? colors.onGold : colors.textSoft }]}>{t('lives.refill', { count: MONETIZATION.lives.max })} · </Text>
          <CoinAmount amount={MONETIZATION.lives.refillCoinCost} size={20} textStyle={{ color: canPay ? colors.onGold : colors.textSoft }} />
        </Button3D>
        <Button3D block variant="secondary" icon="infinity" label={t('lives.infiniteFrom', { price: priceText(MONETIZATION.lives.infiniteHour.id, MONETIZATION.lives.infiniteHour.priceEur) })} onPress={() => router.push({ pathname: '/shop', params: { tab: 'offers' } })} />
        <Pressable onPress={() => router.push({ pathname: '/vip', params: { source: 'vies' } })} hitSlop={8}>
          <Text style={styles.vipLink}>{t('vip.livesLink')}</Text>
        </Pressable>
        <Text style={styles.sub}>{t('lives.meanwhile')}</Text>
        <View style={styles.row}>
          <Button3D style={styles.flex} block size="sm" variant="neutral" icon="calendar-star" label={t('hud.daily')} onPress={() => router.push('/daily')} />
          <Button3D style={styles.flex} block size="sm" variant="neutral" icon="shopping" label={t('hud.shop')} onPress={() => router.push('/shop')} />
          <Button3D style={styles.flex} block size="sm" variant="neutral" icon="image-multiple" label={t('hud.gallery')} onPress={() => router.push('/gallery')} />
        </View>
      </View>
    </Animated.View>
  );
}

/** A heart that pops when the lives are back (shown for a moment when the card has gone). */
export function HeartPop({ trigger }: { trigger: number }) {
  const t = useSharedValue(0);
  const [on, setOn] = useState(false);
  const seen = useRef(trigger);
  useEffect(() => {
    if (trigger === seen.current) return;
    seen.current = trigger;
    setOn(true);
    t.set(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 350 })));
    const id = setTimeout(() => setOn(false), 850);
    return () => clearTimeout(id);
  }, [trigger, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ scale: 0.5 + t.get() * 1.1 }] }));
  if (!on) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.pop, style]}>
      <Icon name="heart" size={110} color={colors.red} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10, 6, 24, 0.72)', padding: 20 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 10, padding: 18, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.surfaceEdge },
  title: { color: colors.text, fontSize: fontSizes.xl, textAlign: 'center' },
  countdown: { color: colors.gold, fontSize: fontSizes.lg, fontWeight: '800' },
  small: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
  btn: { fontSize: fontSizes.md, fontWeight: '800' },
  vipLink: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '700', textAlign: 'center', textDecorationLine: 'underline' },
  sub: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  flex: { flex: 1 },
  pop: { position: 'absolute', alignSelf: 'center', top: '38%' },
});
