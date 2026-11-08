import { useIsFocused, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { FreeCoinsButton } from '@/components/FreeCoins';
import { useOpenVip, VipExpiredCard } from '@/components/VipCards';
import { useFeatures } from '@/config/features';
import { useTourTarget } from '@/tour/targets';
import { MONETIZATION } from '@/config/monetization';
import { starterDurationMs } from '@/game/economy';
import { coinBadge, coinBonusLabel, coinPileFor } from '@/game/offers';
import { canBreakPiggy, coinsUntilBreakable } from '@/game/piggy';
import { nextVipBall } from '@/game/vip';
import { formatDate, formatNumber, priceText, t, useLanguage } from '@/i18n';
import { useThumbnail } from '@/render/useThumbnail';
import { playSfx } from '@/services/audio';
import { listProducts, purchaseProduct, restorePurchases, type Product } from '@/services/purchases';
import { restoreSubscription } from '@/services/subscription';
import { useProfile } from '@/storage/profile';
import { useIsVip } from '@/storage/useVip';
import { Button3D } from '@/ui/Button3D';
import { CoinIcon } from '@/ui/CoinIcon';
import { Countdown, useNowWhileVisible } from '@/ui/Countdown';
import { Icon } from '@/ui/Icon';
import { PiggyBank } from '@/ui/PiggyBank';
import { PiggyGauge } from '@/ui/PiggyGauge';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes, radius } from '@/ui/theme';
import { testerTools } from '@/config/tester';

const BANNER_H = 200;
const AUTO_MS = 4000;

type BannerKind = 'starter' | 'vip' | 'piggy';

const BANNER_GRADIENTS: Record<BannerKind, [string, string]> = {
  vip: ['#ffcf4d', '#c97a0a'],
  starter: ['#7a3cf0', '#e8508f'],
  piggy: ['#ff8fb6', '#d9437f'],
};

/** Slow light rays turning behind an illustration: the one continuous animation of the banners (only the banner on screen has it). */
function Rays({ size, color = 'rgba(255, 255, 255, 0.22)' }: { size: number; color?: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const r = size / 2;
  const rays = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const w = 0.13;
    return `${r},${r} ${r + Math.cos(a - w) * r},${r + Math.sin(a - w) * r} ${r + Math.cos(a + w) * r},${r + Math.sin(a + w) * r}`;
  });
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {rays.map((points, i) => (
          <Polygon key={i} points={points} fill={color} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** A few sparkles, still (they sit with the rays: no animation of their own). */
function Sparkles() {
  const spots = [
    { left: '8%', top: '14%', s: 12 },
    { left: '38%', top: '8%', s: 8 },
    { left: '30%', top: '70%', s: 10 },
    { left: '92%', top: '18%', s: 9 },
    { left: '86%', top: '78%', s: 12 },
  ] as const;
  return (
    <>
      {spots.map((p, i) => (
        <View key={i} pointerEvents="none" style={{ position: 'absolute', left: p.left, top: p.top, width: p.s, height: p.s, transform: [{ rotate: '45deg' }], backgroundColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 2 }} />
      ))}
    </>
  );
}

function BallThumb({ id, size }: { id: string; size: number }) {
  const uri = useThumbnail('ball', id);
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.gold }} />;
}

/** One banner of the carousel: its gradient, the illustration on the left over turning rays, the texts and the price button. */
function Banner({ kind, width, active, product, onPress }: { kind: BannerKind; width: number; active: boolean; product?: Product; onPress: () => void }) {
  const profile = useProfile();
  const piggyCoins = profile.piggy.coins;
  const ball = nextVipBall(profile.vip) ?? MONETIZATION.vip.balls[0];
  const title = kind === 'vip' ? t('vip.title') : kind === 'starter' ? t('modals.starter.title') : t('hud.piggy');
  const desc =
    kind === 'vip'
      ? t('offers.banner.vip', { count: MONETIZATION.vip.dailyCoins })
      : kind === 'starter'
        ? t('offers.banner.starter', { coins: formatNumber(MONETIZATION.products.starterPack.coins) })
        : t('offers.banner.piggy', { amount: formatNumber(piggyCoins) });
  const price =
    kind === 'vip'
      ? t('offers.fromMonth', { price: priceText(MONETIZATION.vip.products.monthly.id, MONETIZATION.vip.products.monthly.priceEur) })
      : kind === 'starter'
        ? priceText(MONETIZATION.products.starterPack.id, MONETIZATION.products.starterPack.priceEur)
        : priceText(MONETIZATION.piggy.product.id, MONETIZATION.piggy.product.priceEur);
  void product;
  return (
    <View style={{ width, height: BANNER_H, paddingHorizontal: 0 }}>
      <LinearGradient colors={BANNER_GRADIENTS[kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={styles.bannerArt}>
          {active && (
            <View style={styles.rays} pointerEvents="none">
              <Rays size={190} />
            </View>
          )}
          {kind === 'vip' && (
            <View style={styles.artStack}>
              <Icon name="crown" size={54} color="#fff3c2" />
              <BallThumb id={ball} size={78} />
            </View>
          )}
          {kind === 'starter' && (
            <View style={styles.artStack}>
              <Icon name="treasure-chest" size={62} color={colors.coin} />
              <View style={styles.row}>
                {MONETIZATION.products.starterPack.skins.map((id) => (
                  <BallThumb key={id} id={id} size={46} />
                ))}
              </View>
            </View>
          )}
          {kind === 'piggy' && <PiggyBank ratio={Math.min(1, piggyCoins / MONETIZATION.piggy.capacity)} size={130} />}
          <Sparkles />
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {title}
          </Text>
          <Text style={styles.bannerDesc} numberOfLines={3}>
            {desc}
          </Text>
          {kind === 'starter' && <Countdown until={(profile.starter.offeredAt ?? 0) + starterDurationMs()} prefix={`${t('offers.expiresPrefix')} `} style={styles.bannerCountdown} />}
          <Button3D size="md" variant="primary" onPress={onPress}>
            <Text style={styles.priceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {price}
            </Text>
          </Button3D>
        </View>
      </LinearGradient>
    </View>
  );
}

/** The featured offers, full width: an automatic carousel (every 4 s) that can also be swiped, with its dots. */
function FeaturedCarousel({ kinds, onPress }: { kinds: BannerKind[]; onPress: (k: BannerKind) => void }) {
  const { width: screenW } = useWindowDimensions();
  const scrollOfOffers = useContext(OffersScrollContext);
  const width = screenW - MARGIN * 2;
  const focused = useIsFocused();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const touching = useRef(false);
  const count = kinds.length;
  const current = Math.min(index, count - 1);
  // The guided tour presents the VIP pass here: the carousel shows it and stays on it, and the list is at the top.
  const vipAt = kinds.indexOf('vip');
  const tourRef = useTourTarget(vipAt >= 0 ? 'offers-vip' : undefined, undefined, () => {
    scrollOfOffers?.current?.scrollTo({ y: 0, animated: false });
    scroller.current?.scrollTo({ x: vipAt * width, animated: false });
    touching.current = true;
    setIndex(vipAt);
  });

  useEffect(() => {
    if (count < 2 || !focused) return;
    const id = setInterval(() => {
      if (touching.current) return;
      const next = (current + 1) % count;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [count, current, focused, width]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    touching.current = false;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  return (
    <View ref={tourRef} collapsable={false}>
      <View style={styles.carousel}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onScrollBeginDrag={() => {
            touching.current = true;
          }}
          onMomentumScrollEnd={onEnd}
          scrollEventThrottle={64}
        >
          {kinds.map((k, i) => (
            <Banner key={k} kind={k} width={width} active={i === current && focused} onPress={() => onPress(k)} />
          ))}
        </ScrollView>
      </View>
      {count > 1 && (
        <View style={styles.dots}>
          {kinds.map((k, i) => (
            <View key={k} style={[styles.pageDot, i === current && styles.pageDotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

/** A coin pack's illustration in a box that fits a tile of the grid: a pile, two piles, then a chest overflowing with coins. */
function PackArt({ coins }: { coins: number }) {
  const { columns, chest } = coinPileFor(coins);
  const unit = chest ? 20 : 26;
  return (
    <View style={styles.packArt}>
      {chest && (
        <View style={{ position: 'absolute', left: 4, bottom: 4 }}>
          <Icon name="treasure-chest" size={44} color={colors.coin} />
        </View>
      )}
      {columns.map((n, col) =>
        Array.from({ length: n }, (_, k) => (
          <View key={`${col}-${k}`} style={{ position: 'absolute', left: chest ? 40 + col * 14 : 8 + col * 26, bottom: 2 + k * 8 + (col % 2) * 4, zIndex: k }}>
            <CoinIcon size={unit} />
          </View>
        )),
      )}
    </View>
  );
}

/** The gold border of the best offer: a reflection crosses it every 3 s (the second continuous animation of the tab). */
function Shine() {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.set(withRepeat(withSequence(withTiming(-1, { duration: 0 }), withDelay(1800, withTiming(1.4, { duration: 1200, easing: Easing.inOut(Easing.quad) }))), -1));
    return () => cancelAnimation(x);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 110 }, { rotate: '18deg' }] }));
  return (
    <View pointerEvents="none" style={styles.shineWrap}>
      <Animated.View style={[styles.shine, style]} />
    </View>
  );
}

function CoinTile({ product, onBuy }: { product: Product; onBuy: () => void }) {
  const badge = coinBadge(product.id);
  const bonus = coinBonusLabel(product.id);
  const best = MONETIZATION.products.coinPacks.find((p) => p.id === product.id)?.badge === 'best';
  const popular = MONETIZATION.products.coinPacks.find((p) => p.id === product.id)?.badge === 'popular';
  return (
    <View style={[styles.tileCol, best && styles.tileColBest]}>
      {popular && badge && (
        <View style={styles.popular}>
          <Text style={styles.popularText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {badge}
          </Text>
        </View>
      )}
      <View style={[styles.tile, best && styles.tileBest]}>
        <LinearGradient colors={best ? ['#3a2f78', '#241d4d'] : ['#36306e', '#2a2250']} style={StyleSheet.absoluteFill} />
        {best && <Shine />}
        {bonus && (
          <View style={styles.ribbonWrap} pointerEvents="none">
            <View style={styles.ribbon}>
              <Text style={styles.ribbonText}>{bonus}</Text>
            </View>
          </View>
        )}
        <PackArt coins={product.coins ?? 0} />
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {formatNumber(product.coins ?? 0)}
        </Text>
        {best && badge && (
          <Text style={styles.bestLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {badge}
          </Text>
        )}
        <Button3D block size="sm" variant="primary" onPress={onBuy}>
          <Text style={styles.priceSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {product.price}
          </Text>
        </Button3D>
      </View>
    </View>
  );
}

/** The list of offers (the scroll view of the shop), so the guided tour can bring a section into the spotlight. */
export const OffersScrollContext = createContext<RefObject<ComponentRef<typeof ScrollView> | null> | null>(null);
const TOUR_MARGIN = 96;
/** Where the sections start inside the scroll view: the padding above the list. */
const SECTIONS_OFFSET = 12;

function Section({ title, index, children, tour }: { title: string; index: number; children: ReactNode; tour?: string }) {
  const scroll = useContext(OffersScrollContext);
  const y = useRef(0);
  const ref = useTourTarget(tour, undefined, () => scroll?.current?.scrollTo({ y: Math.max(0, y.current - TOUR_MARGIN), animated: false }));
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 90).duration(320)} style={styles.section} onLayout={(e) => (y.current = e.nativeEvent.layout.y + SECTIONS_OFFSET)}>
      <View ref={ref} collapsable={false} style={styles.sectionBody}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
      </View>
    </Animated.View>
  );
}

function LivesCard({ product, hours, best, onBuy }: { product: Product; hours: number; best?: boolean; onBuy: () => void }) {
  return (
    <View style={styles.livesCol}>
      {/* The tag sits on the top edge of the card, outside it (the card clips what is drawn over its edge): the column leaves room for it. */}
      {best && (
        <View style={styles.livesBadge}>
          <Text style={styles.popularText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t('vip.best')}
          </Text>
        </View>
      )}
      <LinearGradient colors={['#ff6b8a', '#c52b55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.livesCard}>
        <View style={styles.heart}>
          <Icon name="heart" size={50} color="#fff" />
          <View style={styles.infinity}>
            <Icon name="infinity" size={24} color="#c52b55" />
          </View>
        </View>
        <Text style={styles.livesTitle}>{t('offers.hours', { count: hours })}</Text>
        <Button3D block size="sm" variant="primary" onPress={onBuy}>
          <Text style={styles.priceSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {product.price}
          </Text>
        </Button3D>
      </LinearGradient>
    </View>
  );
}

/** A soft radial glow and a quiet pattern of dots behind the whole tab (not a flat colour). */
function Backdrop() {
  const { width, height } = useWindowDimensions();
  const dots: { x: number; y: number }[] = [];
  for (let y = 18; y < height; y += 46) for (let x = (Math.floor(y / 46) % 2) * 23 + 12; x < width; x += 46) dots.push({ x, y });
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="18%" rx="85%" ry="55%">
          <Stop offset="0" stopColor="#4a3b9a" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#1d1733" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={2} fill="rgba(255, 255, 255, 0.05)" />
      ))}
    </Svg>
  );
}

/**
 * The Offres tab: the featured offers in a carousel at the top (starter pack, VIP pass, piggy bank), then named sections: free coins,
 * coin packs (three tiles side by side), lives, the piggy bank, "no ads". What is already owned drops to the bottom, grey.
 */
export function Offers() {
  useLanguage();
  const profile = useProfile();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const features = useFeatures();
  const vip = useIsVip();
  const openVip = useOpenVip();
  const products = listProducts();
  const get = (id: string) => products.find((p) => p.id === id)!;
  const buy = (id: string) => purchaseProduct(id).then((ok) => ok && playSfx(id === MONETIZATION.piggy.product.id ? 'piggy_break' : 'purchase'));

  const now = useNowWhileVisible();
  const starterOpen = !profile.starter.purchased && profile.starter.offeredAt !== null && (profile.starter.offeredAt ?? 0) + starterDurationMs() > now;
  const breakable = canBreakPiggy(profile);
  const kinds: BannerKind[] = [...(starterOpen ? (['starter'] as const) : []), ...(!vip ? (['vip'] as const) : []), ...(breakable ? (['piggy'] as const) : [])];
  const onBanner = (k: BannerKind) => {
    if (k === 'starter') buy(MONETIZATION.products.starterPack.id);
    else if (k === 'vip') openVip('offres');
    else buy(MONETIZATION.piggy.product.id);
  };

  const packs = [...MONETIZATION.products.coinPacks].sort((a, b) => a.coins - b.coins).map((p) => get(p.id));
  const hour = get(MONETIZATION.lives.infiniteHour.id);
  const day = get(MONETIZATION.lives.infiniteDay.id);
  const piggy = get(MONETIZATION.piggy.product.id);
  let section = 0;

  return (
    <View style={styles.root}>
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="none">
        <Backdrop />
      </View>
      <View style={styles.content}>
        <VipExpiredCard />
        {kinds.length > 0 && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <FeaturedCarousel kinds={kinds} onPress={onBanner} />
          </Animated.View>
        )}

        {vip && (
          <Animated.View entering={FadeInDown.delay(60).duration(320)}>
            <Pressable onPress={() => router.push('/vip-account')}>
              <LinearGradient colors={['#ffcf4d', '#c97a0a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.vipActive}>
                <Icon name="crown" size={24} color={colors.onGold} />
                <Text style={styles.vipActiveText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {t('offers.vipActive', { date: formatDate(profile.vip.expiresAt, { day: 'numeric', month: 'long' }) })}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        <Section title={t('offers.free')} index={section++} tour="offers-free">
          <LinearGradient colors={['#3fbf5f', '#1f8a45']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.freeCard}>
            <View style={styles.freeHead}>
              <CoinIcon size={34} />
              <Text style={styles.freeTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {t('freeCoins.title')} +{MONETIZATION.rewards.freeCoins.coins}
              </Text>
              <Icon name="movie-open" size={22} color="#fff" />
            </View>
            <FreeCoinsButton />
            <Pressable onPress={() => router.push('/gifts')} hitSlop={8} style={styles.giftsLink}>
              <Icon name="gift" size={18} color="#fff" />
              <Text style={styles.giftsLinkText}>{t('offers.seeGifts')}</Text>
            </Pressable>
          </LinearGradient>
        </Section>

        <Section title={t('offers.coins')} index={section++} tour="offers-packs">
          <View style={styles.grid}>
            {packs.map((p) => (
              <CoinTile key={p.id} product={p} onBuy={() => buy(p.id)} />
            ))}
          </View>
        </Section>

        {features.lives && (
          <Section title={t('offers.lives')} index={section++} tour="offers-lives">
            <View style={styles.livesRow}>
              <LivesCard product={hour} hours={MONETIZATION.lives.infiniteHour.hours} onBuy={() => buy(hour.id)} />
              <LivesCard product={day} hours={MONETIZATION.lives.infiniteDay.hours} best onBuy={() => buy(day.id)} />
            </View>
          </Section>
        )}

        <Section title={t('hud.piggy')} index={section++} tour="offers-piggy">
          <LinearGradient colors={['#ff8fb6', '#c93a74']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.piggyCard}>
            <View style={styles.piggyTop}>
              <PiggyBank ratio={Math.min(1, profile.piggy.coins / MONETIZATION.piggy.capacity)} size={96} />
              <View style={styles.flex}>
                <PiggyGauge coins={profile.piggy.coins} />
                {!breakable && (
                  <Text style={styles.piggyMore}>{t('shop.piggyMore', { amount: formatNumber(coinsUntilBreakable(profile)) })}</Text>
                )}
              </View>
            </View>
            {breakable ? (
              <Button3D block variant="primary" onPress={() => buy(piggy.id)}>
                <Text style={styles.priceText}>{t('shop.breakFor', { price: piggy.price })}</Text>
              </Button3D>
            ) : (
              <Button3D block variant="neutral" disabled onPress={() => {}}>
                <Text style={styles.disabledText}>{t('shop.from', { amount: formatNumber(MONETIZATION.piggy.breakFrom) })} 🪙</Text>
              </Button3D>
            )}
          </LinearGradient>
        </Section>

        <Button3D
          block
          size="sm"
          variant="neutral"
          icon="restore"
          label={t('common.restore')}
          onPress={async () => {
            const ids = await restorePurchases();
            const found = await restoreSubscription();
            Alert.alert(t('common.restore'), ids.length > 0 || found ? t('common.restored') : t('common.nothingToRestore'));
          }}
        />
        {testerTools() && <Text style={styles.fine}>{t('common.simulatedPurchases')}</Text>}
        <View style={{ height: insets.bottom + 16 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { marginHorizontal: -MARGIN },
  content: { gap: 18 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carousel: { height: BANNER_H, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.25)' },
  banner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  bannerArt: { width: '42%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  artStack: { alignItems: 'center', gap: 2 },
  bannerText: { flex: 1, gap: 6, justifyContent: 'center' },
  bannerTitle: { color: '#fff', fontSize: fontSizes.xl, fontWeight: '900', textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowRadius: 4 },
  bannerDesc: { color: 'rgba(255, 255, 255, 0.95)', fontSize: fontSizes.sm, fontWeight: '700' },
  bannerCountdown: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '900', backgroundColor: 'rgba(0, 0, 0, 0.28)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  priceText: { color: colors.onGold, fontSize: fontSizes.lg, fontWeight: '900' },
  priceSmall: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '900' },
  disabledText: { color: colors.textSoft, fontSize: fontSizes.md, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  pageDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  pageDotOn: { width: 18, backgroundColor: colors.gold },
  sectionBody: { gap: 8 },
  section: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase', paddingLeft: 4 },
  vipActive: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg },
  vipActiveText: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '900', flex: 1 },
  freeCard: { padding: 12, gap: 10, borderRadius: radius.lg, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.3)' },
  freeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  freeTitle: { color: '#fff', fontSize: fontSizes.lg, fontWeight: '900', flex: 1 },
  giftsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32 },
  giftsLinkText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '800', textDecorationLine: 'underline' },
  grid: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  tileCol: { flex: 1 },
  tileColBest: {},
  tile: { borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', paddingHorizontal: 6, paddingTop: 12, paddingBottom: 8, gap: 6, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.18)' },
  tileBest: { paddingTop: 22, paddingBottom: 10, borderColor: colors.gold, borderWidth: 3 },
  popular: { alignSelf: 'center', marginBottom: -8, zIndex: 2, backgroundColor: colors.violet, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  popularText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  packArt: { width: 74, height: 66 },
  amount: { color: '#fff', fontSize: fontSizes.xl, fontWeight: '900', alignSelf: 'stretch', textAlign: 'center', fontVariant: ['tabular-nums'] },
  bestLabel: { color: colors.gold, fontSize: 11, fontWeight: '900', alignSelf: 'stretch', textAlign: 'center' },
  ribbonWrap: { position: 'absolute', top: 0, left: 0, width: 56, height: 56, overflow: 'hidden', zIndex: 3 },
  ribbon: { position: 'absolute', top: 9, left: -20, width: 80, paddingVertical: 2, backgroundColor: colors.equipped, transform: [{ rotate: '-45deg' }], alignItems: 'center' },
  ribbonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  shineWrap: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  shine: { position: 'absolute', top: -20, bottom: -20, width: 26, backgroundColor: 'rgba(255, 233, 150, 0.35)' },
  livesRow: { flexDirection: 'row', gap: 10 },
  livesCol: { flex: 1, paddingTop: 12 },
  livesCard: { borderRadius: radius.lg, padding: 10, gap: 6, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.3)' },
  livesBadge: { position: 'absolute', top: 0, alignSelf: 'center', backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, zIndex: 2, maxWidth: '90%' },
  heart: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center' },
  infinity: { position: 'absolute' },
  livesTitle: { color: '#fff', fontSize: fontSizes.xl, fontWeight: '900' },
  piggyCard: { borderRadius: radius.lg, padding: 12, gap: 10, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.3)' },
  piggyTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  piggyMore: { color: '#fff', fontSize: fontSizes.xs, fontWeight: '800', marginTop: 6 },
  noAds: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.12)' },
  noAdsIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 84, 104, 0.15)' },
  noAdsTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '900' },
  noAdsDesc: { color: colors.textSoft, fontSize: fontSizes.xs },
  ownedCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, opacity: 0.6 },
  ownedText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700' },
  fine: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
});
