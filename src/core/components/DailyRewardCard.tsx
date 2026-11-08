import { itemName } from '@/core/i18n/names';
import { t } from '@/core/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/core/components/Modals';
import { claimDailyReward, dailyRewardStatus, rewardForDay } from '@/core/daily';
import { dayKeyOf } from '@/core/dates';
import { ads } from '@/core/services/ads';
import { updateProfile, useProfile } from '@/core/storage/profile';
import { Card3D } from '@/core/ui/Card3D';
import { CoinAmount } from '@/core/ui/CoinIcon';
import { Icon } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

/** First opening of the day: the 7-day reward calendar, with the "x2" rewarded-ad button. */
export function DailyRewardCard({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const today = dayKeyOf(new Date());
  const status = dailyRewardStatus(profile, today);
  const [claimed, setClaimed] = useState<{ day: number; coins: number; skin: string | null; doubled: boolean } | null>(null);
  const day = claimed?.day ?? status.day;

  const claim = (doubled: boolean) => {
    const result = claimDailyReward(profile, today, doubled);
    if (!result) return;
    updateProfile(() => result.profile);
    setClaimed({ day: result.day, coins: result.reward.coins, skin: result.reward.skin, doubled });
  };
  const claimDoubled = () => {
    ads.showRewarded('daily_reward_double').then((ok) => ok && claim(true));
  };

  return (
    <View style={styles.back}>
      <View style={styles.wrap}>
        <Card3D innerStyle={styles.card}>
          <Text style={styles.kicker}>{t('daily.reward.kicker')}</Text>
          <View style={styles.days}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const payout = rewardForDay(profile, d);
              const done = d < day || (claimed !== null && d === day);
              const active = d === day && !claimed;
              return (
                <View key={d} style={[styles.dayCell, active && styles.dayActive, done && styles.dayDone]}>
                  <Text style={[styles.dayLabel, active && { color: colors.ink }]}>J{d}</Text>
                  {done ? (
                    <Icon name="check-bold" size={16} color={colors.text} />
                  ) : payout.skin ? (
                    <Icon name="gift" size={16} color={active ? colors.ink : colors.gold} />
                  ) : (
                    <Text style={[styles.dayValue, active && { color: colors.ink }]}>{payout.coins}</Text>
                  )}
                </View>
              );
            })}
          </View>
          {claimed ? (
            <>
              {claimed.skin ? <Text style={styles.won}>{t('daily.reward.newBall', { name: itemName(claimed.skin) })}</Text> : <CoinAmount amount={`+${claimed.coins}`} size={30} textStyle={{ color: colors.coin }} />}
              <PrimaryButton label={t('common.great')} onPress={onClose} />
            </>
          ) : (
            <>
              <PrimaryButton label={t('common.claim')} onPress={() => claim(false)} />
              {!rewardForDay(profile, status.day).skin && <PrimaryButton label={t('common.doubleWithAd')} variant="success" onPress={claimDoubled} />}
            </>
          )}
        </Card3D>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.overlay },
  wrap: { width: '100%', maxWidth: 380 },
  card: { alignItems: 'center', gap: 14, padding: 18 },
  kicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 2 },
  days: { flexDirection: 'row', gap: 6 },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surfaceHi },
  dayActive: { backgroundColor: colors.gold },
  dayDone: { backgroundColor: colors.greenDeep },
  dayLabel: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '700' },
  dayValue: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  won: { color: colors.coin, fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center' },
});
