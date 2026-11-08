import { useVipStatus } from '@/core/storage/useVip';
import { useScreenReady } from '@/core/ui/useScreenReady';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BenefitRow, VIP_BENEFITS, planPrice } from '@/core/components/VipParts';
import { MONETIZATION } from '@/core/config/monetization';
import { nextVipBall } from '@/core/vip';
import { formatDate, t, useLanguage } from '@/core/i18n';
import { itemName } from '@/core/i18n/names';
import { ShopPreview } from '@/render/ShopPreview';
import { checkSubscription } from '@/core/services/subscription';
import { useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { Icon } from '@/core/ui/Icon';
import { Countdown } from '@/core/ui/Countdown';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';

/** "Mon Pass VIP": the state of the subscription, the balls it gave, and the way to manage or cancel it (in the Apple account). */
export default function VipAccountScreen() {
  // A pass of the simulated store whose period is over has been renewed: the date shown is always in the future.
  useEffect(() => {
    void checkSubscription();
  }, []);
  useScreenReady('/vip-account');
  useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const v = profile.vip;
  const { status } = useVipStatus();
  const total = MONETIZATION.vip.balls.length;
  const next = nextVipBall(v);
  const ball = next ?? MONETIZATION.vip.balls[total - 1];

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('vip.myPass')} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Card3D innerStyle={styles.card}>
            <View style={styles.statusRow}>
              <Icon name="crown" size={30} color={status === 'none' || status === 'expired' ? colors.textMuted : colors.gold} />
              <View style={styles.flex}>
                <Text style={styles.label}>{t('vip.account.status')}</Text>
                <Text style={styles.value}>{t(`vip.account.${status}`)}</Text>
              </View>
            </View>
            {v.plan && (
              <Text style={styles.line}>
                {t('vip.account.plan')} : {t(`vip.plan.${v.plan}`)} · {planPrice(v.plan)}
              </Text>
            )}
            {status === 'active' && <Countdown until={v.expiresAt} prefix={`${t('vip.account.renewsIn')} `} style={styles.value} />}
            {status === 'active' && <Text style={styles.line}>{t('vip.account.renews', { date: formatDate(v.expiresAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text>}
            {status === 'grace' && <Text style={styles.warn}>{t('vip.account.graceBody')}</Text>}
            {status === 'expired' && <Text style={styles.line}>{t('vip.account.endsOn', { date: formatDate(v.expiresAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text>}
            {status === 'none' || status === 'expired' ? (
              <Button3D block variant="primary" icon="crown" label={t('vip.account.discover')} onPress={() => router.replace({ pathname: '/vip', params: { source: 'reglages' } })} />
            ) : (
              <Button3D block variant="secondary" icon="open-in-new" label={t('vip.account.manage')} onPress={() => Linking.openURL(MONETIZATION.vip.links.manage)} />
            )}
          </Card3D>

          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('vip.account.balls')}</Text>
            <View style={styles.preview}>
              <ShopPreview ball={ball} paint={profile.equipped.paint} />
            </View>
            <Text style={styles.value}>{t('vip.account.ballsCount', { given: v.ballsGiven, total })}</Text>
            {next && <Text style={styles.line}>{t('vip.account.nextBall', { name: itemName(next) })}</Text>}
          </Card3D>

          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('vip.account.benefits')}</Text>
            {VIP_BENEFITS.map((b) => (
              <BenefitRow key={b.key} benefit={b} />
            ))}
          </Card3D>
        </ScrollView>
        <TopFade />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: MARGIN, paddingTop: 14, gap: 14 },
  card: { padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: colors.textSoft, fontSize: fontSizes.xs },
  value: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '800' },
  line: { color: colors.textSoft, fontSize: fontSizes.sm },
  warn: { color: colors.flameLight, fontSize: fontSizes.sm, fontWeight: '700' },
  kicker: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: 1 },
  preview: { height: 170, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.previewBg },
});
