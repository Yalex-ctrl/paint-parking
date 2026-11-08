import { t , formatNumber } from '@/i18n';
import { usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTourTarget } from '@/tour/targets';
import { useProfile } from '@/storage/profile';

import { Icon } from './Icon';
import { CoinIcon } from './CoinIcon';
import { Text } from './Text';
import { HEADER_HEIGHT, MARGIN, colors, radius, fontSizes } from './theme';

/** The coin balance pill: opens the shop's offers when pressed. */
export function CoinBalance({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const profile = useProfile();
  const ref = useTourTarget('coin-balance');
  return (
    <View style={styles.balance}>
      <Pressable ref={ref} collapsable={false} onPress={onPress ?? (() => (pathname === '/shop' ? router.setParams({ tab: 'offers' }) : router.push({ pathname: '/shop', params: { tab: 'offers' } })))} hitSlop={8} style={styles.pill}>
        <CoinIcon size={22} />
        <Text style={styles.pillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {formatNumber(profile.coins)}
        </Text>
        <View style={styles.plus}>
          <Text style={styles.plusText}>+</Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The header of every panel (shop, gallery, daily challenge, piggy bank, settings): they open over the level, full screen, so the
 * way out is a gold cross at the top right (it brings the level back exactly as it was). The coin balance is on the left, the
 * title in the middle. It is opaque and sits above the scrolling content, which fades out under it.
 */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const close = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const closeRef = useTourTarget('close');
  return (
    <View style={{ backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.bar}>
        <View style={styles.left}>{right ?? <CoinBalance />}</View>
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {title}
          </Text>
        </View>
        <Pressable ref={closeRef} collapsable={false} onPress={close} hitSlop={6} accessibilityLabel={t('common.close')} style={styles.close}>
          <Icon name="close" size={26} color={colors.gold} />
        </Pressable>
      </View>
    </View>
  );
}

/** A soft fade at the top edge of a scrolling area, so content disappears gently under the header. */
export function TopFade({ height = 14 }: { height?: number }) {
  return <LinearGradient pointerEvents="none" colors={[colors.bg, 'rgba(29,23,51,0)']} style={[styles.fade, { height }]} />;
}

/** Width of the zone of the coin balance: "12 345", the coin and the plus fit in it. */
const BALANCE_ZONE = 136;

const styles = StyleSheet.create({
  bar: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: MARGIN },
  // Three zones: the balance on the left (fixed width), the title in the room that is left (it shrinks to 70 % before it would touch
  // anything), the cross on the right (fixed width).
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  title: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center' },
  left: { width: BALANCE_ZONE, alignItems: 'flex-start' },
  close: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 2, borderColor: 'rgba(255, 201, 60, 0.55)' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingLeft: 10,
    paddingRight: 6,
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceEdge,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  pillText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  plus: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#0f3a14', fontSize: fontSizes.md, fontWeight: '700', lineHeight: 21 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
});
