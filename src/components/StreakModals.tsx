import { t } from '@/i18n';
import { Pressable, StyleSheet } from 'react-native';

import { Overlay } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { dayKeyOf } from '@/game/dates';
import { canSaveWithAd } from '@/game/streak';
import { useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinAmount } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/** "Ta série de N va être perdue !": keep it for a rewarded ad (once a day) or for coins, or let it go. */
export function SaveStreak({ streak, onAd, onCoins, onLose }: { streak: number; onAd: () => void; onCoins: () => void; onLose: () => void }) {
  const profile = useProfile();
  const cost = MONETIZATION.streak.saveCoinCost;
  const canPay = profile.coins >= cost;
  const adOk = canSaveWithAd(profile, dayKeyOf(new Date()));
  return (
    <Overlay>
      <Icon name="fire" size={48} color={colors.flame} />
      <Text style={styles.title}>{t('streak.willBeLost', { count: streak })}</Text>
      <Text style={styles.body}>{t('streak.keepBody')}</Text>
      {adOk && <Button3D block variant="success" icon="play-circle-outline" label={t('streak.keepAd')} onPress={onAd} />}
      <Button3D block variant={canPay ? 'primary' : 'neutral'} disabled={!canPay} onPress={onCoins}>
        <Text style={[styles.btn, { color: canPay ? colors.onGold : colors.textSoft }]}>{t('streak.keep')} · </Text>
        <CoinAmount amount={cost} size={20} textStyle={{ color: canPay ? colors.onGold : colors.textSoft }} />
      </Button3D>
      <Pressable onPress={onLose} hitSlop={10}>
        <Text style={styles.later}>{t('streak.letGo')}</Text>
      </Pressable>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  btn: { fontSize: fontSizes.md, fontWeight: '800' },
  later: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: 2 },
});
