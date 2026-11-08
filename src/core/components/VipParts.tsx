import { StyleSheet, View } from 'react-native';

import { MONETIZATION } from '@/core/config/monetization';
import { type VipPlan } from '@/core/vip';
import { priceText, t } from '@/core/i18n';
import { Icon, type IconName } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

/** The benefits of the pass, in the order of the paywall and of "Mon Pass VIP". */
export const VIP_BENEFITS: { key: string; icon: IconName; count?: number }[] = [
  { key: 'noAds', icon: 'advertisements-off' },
  { key: 'coins', icon: 'cash-multiple', count: MONETIZATION.vip.dailyCoins },
  { key: 'lives', icon: 'infinity' },
  { key: 'ball', icon: 'star-circle' },
  { key: 'spin', icon: 'ferris-wheel' },
];

export function BenefitRow({ benefit }: { benefit: (typeof VIP_BENEFITS)[number] }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Icon name={benefit.icon} size={24} color={colors.gold} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.benefitTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {t(`vip.benefit.${benefit.key}`, { count: benefit.count })}
        </Text>
        <Text style={styles.benefitSub} numberOfLines={2}>
          {t(`vip.benefit.${benefit.key}Sub`)}
        </Text>
      </View>
    </View>
  );
}

/** The price line of a plan, in the language on screen: "29,99 € / an". */
export const planPrice = (plan: VipPlan): string => `${priceText(MONETIZATION.vip.products[plan].id, MONETIZATION.vip.products[plan].priceEur)} ${t(plan === 'yearly' ? 'vip.per.year' : 'vip.per.month')}`;


const styles = StyleSheet.create({
  flex: { flex: 1 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 201, 60, 0.14)' },
  benefitTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800' },
  benefitSub: { color: colors.textSoft, fontSize: fontSizes.xs },
});
