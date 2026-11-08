import { useIsVip } from '@/storage/useVip';
import { useScreenReady } from '@/ui/useScreenReady';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONETIZATION } from '@/config/monetization';
import { nextVipBall, noteRefusal, yearlySaving, type PaywallSource, type VipPlan } from '@/game/vip';
import { formatPercent, priceText, realYearlySaving, t, useLanguage, yearlyMonthlyText } from '@/i18n';
import { itemName } from '@/i18n/names';
import { ShopPreview } from '@/render/ShopPreview';
import { track } from '@/services/analytics';
import { playSfx } from '@/services/audio';
import { restoreSubscription, subscribe } from '@/services/subscription';
import { showToast } from '@/services/toast';
import { updateProfile, useProfile } from '@/storage/profile';
import { BenefitRow, VIP_BENEFITS, planPrice } from '@/components/VipParts';
import { Button3D } from '@/ui/Button3D';
import { Card3D } from '@/ui/Card3D';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes, radius } from '@/ui/theme';

const SOURCES: PaywallSource[] = ['offres', 'cadeaux', 'vies', 'reglages', 'auto_level20', 'auto_weekly'];

function PlanCard({ plan, selected, onPress }: { plan: VipPlan; selected: boolean; onPress: () => void }) {
  const yearly = plan === 'yearly';
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.plan, selected && styles.planOn]}>
      {yearly && (
        <View style={styles.best}>
          <Text style={styles.bestText} numberOfLines={1} adjustsFontSizeToFit>
            {t('vip.best')}
          </Text>
        </View>
      )}
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <Text style={styles.planName}>{t(`vip.plan.${plan}`)}</Text>
        {yearly && (
          <Text style={styles.planSub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
            {t('vip.equivalent', { price: yearlyMonthlyText(MONETIZATION.vip.products.yearly.id, MONETIZATION.vip.products.yearly.priceEur), percent: formatPercent(realYearlySaving(MONETIZATION.vip.products.yearly.id, MONETIZATION.vip.products.monthly.id) ?? yearlySaving()) })}
          </Text>
        )}
      </View>
      <Text style={styles.planPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {planPrice(plan)}
      </Text>
    </Pressable>
  );
}

/**
 * The paywall of the VIP pass. What the App Store asks for is all here: the name of the pass, what it gives, the full price of each
 * plan, the automatic renewal, the links to the terms and the privacy policy, "Restaurer", and a cross at the top that closes it at
 * once. The plan chosen first is the yearly one (cheaper by the month).
 */
export default function VipScreen() {
  useScreenReady('/vip');
  useLanguage();
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string }>();
  const source: PaywallSource = SOURCES.includes(params.source as PaywallSource) ? (params.source as PaywallSource) : 'offres';
  const profile = useProfile();
  const vip = useIsVip();
  const [plan, setPlan] = useState<VipPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const purchased = useRef(false);
  const ball = nextVipBall(profile.vip) ?? MONETIZATION.vip.balls[0];

  useEffect(() => {
    track('paywall_shown', { source });
    return () => {
      track('paywall_closed', { source, purchased: purchased.current });
    };
  }, [source]);

  const close = () => {
    if (!purchased.current) updateProfile((p) => noteRefusal(p, Date.now()));
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await subscribe(plan);
    setBusy(false);
    if (ok) {
      purchased.current = true;
      playSfx('purchase');
      showToast(t('vip.welcome'));
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      updateProfile((p) => noteRefusal(p, Date.now()));
    }
  };

  const restore = async () => {
    const found = await restoreSubscription();
    showToast(found ? t('vip.restoreDone') : t('vip.restoreNone'));
    if (found) close();
  };

  const trial = MONETIZATION.vip.trialDays;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable onPress={close} hitSlop={10} accessibilityLabel={t('common.close')} style={[styles.close, { top: insets.top + 8 }]}>
        <Icon name="close" size={26} color={colors.gold} />
      </Pressable>
      {/* Fixed at the top, under the cross: the title, then the ball of the month turning on its glowing pedestal. */}
      <View style={styles.header}>
        <View style={styles.hero}>
          <Icon name="crown" size={30} color={colors.gold} />
          <Text style={styles.title}>{t('vip.title')}</Text>
        </View>
        <View style={styles.preview}>
          <LinearGradient colors={['rgba(255, 207, 77, 0.35)', 'rgba(255, 207, 77, 0)']} style={styles.glow} pointerEvents="none" />
          {focused && <ShopPreview ball={ball} paint={profile.equipped.paint} />}
          <View style={styles.pedestal} pointerEvents="none" />
        </View>
        <Text style={styles.ballName}>{t('vip.ballOfMonth', { name: itemName(ball) })}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>{t('vip.headline')}</Text>

        <Card3D innerStyle={styles.card}>
          {VIP_BENEFITS.map((b) => (
            <BenefitRow key={b.key} benefit={b} />
          ))}
        </Card3D>

        <View style={styles.plans} accessibilityRole="radiogroup">
          <PlanCard plan="yearly" selected={plan === 'yearly'} onPress={() => setPlan('yearly')} />
          <PlanCard plan="monthly" selected={plan === 'monthly'} onPress={() => setPlan('monthly')} />
        </View>

        {trial > 0 && <Text style={styles.trial}>{t('vip.trial', { count: trial, price: priceText(MONETIZATION.vip.products[plan].id, MONETIZATION.vip.products[plan].priceEur), period: t(plan === 'yearly' ? 'vip.per.year' : 'vip.per.month') })}</Text>}

        <Button3D block size="lg" variant="primary" disabled={busy || vip} onPress={buy}>
          <Text style={styles.cta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t('vip.subscribeFor', { price: priceText(MONETIZATION.vip.products[plan].id, MONETIZATION.vip.products[plan].priceEur), period: t(plan === 'yearly' ? 'vip.per.year' : 'vip.per.month') })}
          </Text>
        </Button3D>

        <Text style={styles.legal}>{t('vip.legal')}</Text>
        <View style={styles.links}>
          <Pressable onPress={() => Linking.openURL(MONETIZATION.vip.links.terms)} hitSlop={8}>
            <Text style={styles.link}>{t('vip.terms')}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(MONETIZATION.vip.links.privacy)} hitSlop={8}>
            <Text style={styles.link}>{t('vip.privacy')}</Text>
          </Pressable>
          <Pressable onPress={restore} hitSlop={8}>
            <Text style={styles.link}>{t('common.restore')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  close: { position: 'absolute', right: MARGIN, zIndex: 10, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 2, borderColor: 'rgba(255, 201, 60, 0.55)' },
  content: { paddingHorizontal: MARGIN, paddingTop: 12, gap: 14 },
  header: { paddingHorizontal: MARGIN, gap: 8, paddingTop: 6 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, paddingHorizontal: 56 },
  title: { color: colors.gold, fontSize: fontSizes.xl, fontWeight: '800', textAlign: 'center' },
  headline: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center', marginBottom: 2 },
  preview: { height: 200, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.previewBg },
  glow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  pedestal: { position: 'absolute', bottom: 8, alignSelf: 'center', width: 150, height: 14, borderRadius: 7, backgroundColor: 'rgba(255, 224, 130, 0.5)', shadowColor: '#ffd23f', shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  ballName: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800', textAlign: 'center' },
  card: { padding: 14, gap: 12 },
  plans: { gap: 10, marginTop: 4 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.surfaceEdge },
  planOn: { borderColor: colors.gold, backgroundColor: colors.surfaceHi },
  best: { position: 'absolute', top: -11, right: 14, paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.gold, maxWidth: 160 },
  bestText: { color: colors.onGold, fontSize: fontSizes.xs, fontWeight: '800' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  planName: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800' },
  planSub: { color: colors.greenLight, fontSize: fontSizes.xs, fontWeight: '700' },
  planPrice: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800', maxWidth: 130, textAlign: 'right' },
  trial: { color: colors.greenLight, fontSize: fontSizes.sm, fontWeight: '700', textAlign: 'center' },
  cta: { color: colors.onGold, fontSize: fontSizes.lg, fontWeight: '800' },
  legal: { color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, rowGap: 8 },
  link: { color: colors.textSoft, fontSize: fontSizes.xs, textDecorationLine: 'underline' },
});
