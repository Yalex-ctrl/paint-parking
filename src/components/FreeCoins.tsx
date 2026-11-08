import { t, useLanguage } from '@/i18n';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MONETIZATION } from '@/config/monetization';
import { formatDuration } from '@/game/duration';
import { claimFreeCoins, freeCoinsStatus, rewardedAdsLeft } from '@/game/rewards';
import { ads } from '@/services/ads';
import { playSfx } from '@/services/audio';
import { getProfile, updateProfile, useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinAmount } from '@/ui/CoinIcon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/**
 * "+15 🪙 · Regarder une pub": free coins every half hour, six times a day. The reward is written on the button before the ad; between
 * two, the button shows the countdown; when the six are taken (or the day's rewarded ads are used up) it says "Reviens demain".
 * Used in the Cadeaux panel and in the Offres tab of the shop.
 */
export function FreeCoinsButton({ onClaimed }: { onClaimed?: (coins: number) => void }) {
  useLanguage();
  useLanguage();
  useLanguage();
  const profile = useProfile();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const free = freeCoinsStatus(profile.rewards, now);
  const capped = rewardedAdsLeft(profile.rewards) <= 0;
  const waiting = !free.available && free.left > 0;
  const label = capped || free.left <= 0 ? t('common.tomorrow') : waiting ? t('common.inTime', { time: formatDuration(free.waitMs) }) : null;

  const take = async () => {
    if (!free.available || capped) return;
    const ok = await ads.showRewarded('free_coins');
    if (!ok) return;
    const next = claimFreeCoins(getProfile(), Date.now());
    if (!next) return;
    updateProfile(() => next);
    playSfx('purchase');
    onClaimed?.(free.coins);
  };

  return (
    <View style={styles.wrap}>
      <Button3D block variant={free.available && !capped ? 'primary' : 'neutral'} disabled={!free.available || capped} onPress={take}>
        {label ? (
          <Text style={styles.text}>{label}</Text>
        ) : (
          <View style={styles.row}>
            <CoinAmount amount={`+${free.coins}`} size={20} textStyle={{ color: colors.onGold }} />
            <Text style={styles.text}> · {t('common.watchAd')}</Text>
          </View>
        )}
      </Button3D>
      <Text style={styles.muted}>
        {t('freeCoins.rule', { interval: MONETIZATION.rewards.freeCoins.intervalMin, perDay: MONETIZATION.rewards.freeCoins.perDay, left: free.left })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '800' },
  muted: { color: colors.textSoft, fontSize: fontSizes.xs, textAlign: 'center' },
});
