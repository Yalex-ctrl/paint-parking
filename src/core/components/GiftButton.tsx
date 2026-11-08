import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { dailyRewardStatus } from '@/core/daily';
import { dayKeyOf } from '@/core/dates';
import { canClaimVipDaily, isVip } from '@/core/vip';
import { formatDuration } from '@/core/duration';
import { giftsWaiting, nextGiftIn } from '@/core/rewards';
import { t, useLanguage } from '@/core/i18n';
import { useNowWhileVisible } from '@/core/ui/Countdown';
import { usePlayProgress } from '@/core/services/playTime';
import { useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { Text } from '@/core/ui/Text';
import { colors, fonts } from '@/core/ui/theme';

const RING = 38;
const STROKE = 3.5;
const RADIUS = (RING - STROKE) / 2;
const LENGTH = 2 * Math.PI * RADIUS;

/**
 * The "Cadeaux" button of the header: a gift, a little ring around it that fills towards the next chest of play time, a red dot with
 * the number of things waiting in the panel, and a jump when a chest has just been reached.
 */
/** How many gifts are waiting, and the time before the nearest one comes back (read again every second while the HUD is in front). */
export function useGiftsStatus(): { waiting: number; nextMs: number } {
  const profile = useProfile();
  const now = useNowWhileVisible();
  const waiting = giftsWaiting(profile, now, {
    dailyRewardReady: dailyRewardStatus(profile, dayKeyOf(new Date(now))).available,
    vip: isVip(profile.vip, now),
    vipDailyReady: canClaimVipDaily(profile, dayKeyOf(new Date(now)), now),
  });
  return { waiting, nextMs: nextGiftIn(profile, now) };
}

/** The caption under the button: "Cadeaux" while something is waiting, else the time before the nearest gift. */
export function GiftCaption({ style }: { style: StyleProp<TextStyle> }) {
  useLanguage();
  const { waiting, nextMs } = useGiftsStatus();
  return (
    <Text style={[style, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
      {waiting > 0 ? t('hud.gifts') : formatDuration(nextMs)}
    </Text>
  );
}

export function GiftButton({ onPress }: { onPress: () => void }) {
  const { fraction, bumps } = usePlayProgress();
  const { waiting } = useGiftsStatus();

  const jump = useSharedValue(0);
  useEffect(() => {
    if (bumps > 0) jump.set(withSequence(withTiming(-9, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }), withTiming(-4, { duration: 100 }), withTiming(0, { duration: 120 })));
  }, [bumps, jump]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: jump.get() }] }));

  return (
    <Animated.View style={style}>
      <View>
        <Svg width={RING} height={RING} style={styles.ring} pointerEvents="none">
          <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke="rgba(0, 0, 0, 0.35)" strokeWidth={STROKE} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.coin}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${LENGTH * fraction} ${LENGTH}`}
            rotation={-90}
            origin={`${RING / 2}, ${RING / 2}`}
          />
        </Svg>
        <Button3D round size="xs" variant="neutral" icon="gift" tourId="gifts" onPress={onPress} />
        {waiting > 0 && (
          <View style={styles.dot} pointerEvents="none">
            <Text style={styles.dotText}>{waiting}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: -4, top: -4 },
  dot: { position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: colors.text, fontSize: 10, lineHeight: 12, fontFamily: fonts.label },
});
