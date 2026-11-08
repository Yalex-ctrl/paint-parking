import { useIsVip, useVipStatus } from '@/storage/useVip';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MONETIZATION } from '@/config/monetization';
import { showExpired, type PaywallSource } from '@/game/vip';
import { t, useLanguage, yearlyMonthlyText } from '@/i18n';
import { track } from '@/services/analytics';
import { updateProfile, useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { Card3D } from '@/ui/Card3D';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/** Opens the paywall (or "Mon Pass VIP" for a subscriber). */
export function useOpenVip() {
  const router = useRouter();
  const vip = useIsVip();
  return (source: PaywallSource) => {
    if (vip) router.push('/vip-account');
    else router.push({ pathname: '/vip', params: { source } });
  };
}

/** The card at the top of the Offres tab: what the pass gives and from what price. A subscriber sees "Mon Pass VIP" instead. */
export function VipOfferCard({ source }: { source: PaywallSource }) {
  useLanguage();
  const open = useOpenVip();
  const vip = useIsVip();
  return (
    <Card3D innerStyle={styles.offer}>
      <View style={styles.offerHead}>
        <Icon name="crown" size={30} color={colors.gold} />
        <Text style={styles.offerTitle}>{vip ? t('vip.myPass') : t('vip.offer.title')}</Text>
      </View>
      {!vip && (
        <>
          <Text style={styles.offerSub}>{t('vip.offer.sub', { count: MONETIZATION.vip.dailyCoins })}</Text>
          <Text style={styles.offerFrom}>{t('vip.offer.from', { price: yearlyMonthlyText(MONETIZATION.vip.products.yearly.id, MONETIZATION.vip.products.yearly.priceEur) })}</Text>
        </>
      )}
      <Button3D block variant="primary" icon="crown" label={vip ? t('vip.account.manage') : t('vip.offer.cta')} onPress={() => open(source)} />
    </Card3D>
  );
}

/** "Ton Pass VIP a expiré": shown once the pass has lapsed, until the player closes it. */
export function VipExpiredCard() {
  useLanguage();
  const router = useRouter();
  const profile = useProfile();
  const { now } = useVipStatus();
  if (!showExpired(profile.vip, now)) return null;
  const dismiss = () => updateProfile((p) => ({ ...p, vip: { ...p.vip, expiredSeen: true } }));
  return (
    <Card3D innerStyle={styles.offer}>
      <View style={styles.offerHead}>
        <Icon name="crown-outline" size={30} color={colors.textMuted} />
        <Text style={styles.offerTitle}>{t('vip.expired.title')}</Text>
      </View>
      <Text style={styles.offerSub}>{t('vip.expired.body')}</Text>
      <Button3D
        block
        variant="primary"
        label={t('vip.expired.renew')}
        onPress={() => {
          dismiss();
          track('paywall_shown', { source: 'offres', from: 'expired' });
          router.push({ pathname: '/vip', params: { source: 'offres' } });
        }}
      />
      <Pressable onPress={dismiss} hitSlop={8}>
        <Text style={styles.later}>{t('vip.expired.dismiss')}</Text>
      </Pressable>
    </Card3D>
  );
}

const styles = StyleSheet.create({
  offer: { padding: 16, gap: 10 },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offerTitle: { color: colors.gold, fontSize: fontSizes.lg, fontWeight: '800', flex: 1 },
  offerSub: { color: colors.textSoft, fontSize: fontSizes.sm },
  offerFrom: { color: colors.greenLight, fontSize: fontSizes.sm, fontWeight: '700' },
  later: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center', textDecorationLine: 'underline' },
});
