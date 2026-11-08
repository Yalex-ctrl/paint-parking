import { howText, itemName, rarityName } from '@/core/i18n/names';
import { formatNumber , t, useLanguage } from '@/core/i18n';

import { useScreenReady } from '@/core/ui/useScreenReady';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buyItem, equipItem, owns, type Profile } from '@/core/economy';
import { SHOP_FILTERS, filterItems, isNewItem, markSeen, sortItems, type ShopFilter } from '@/core/shopCatalog';
import { SHOP_ITEMS, itemsOfKind, type ItemKind, type ShopItem } from '@/core/shopItems';
import { ShopPreview } from '@/render/ShopPreview';
import { useThumbnail } from '@/core/render/useThumbnail';
import { track } from '@/core/services/analytics';
import { playSfx } from '@/core/services/audio';
import { Offers, OffersScrollContext } from '@/core/components/ShopOffers';
import { registerTourAction } from '@/core/tour/targets';
import { updateProfile, useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { CoinAmount, CoinIcon } from '@/core/ui/CoinIcon';
import { Icon, type IconName } from '@/core/ui/Icon';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, radius, rarityColors, fontSizes } from '@/core/ui/theme';

type Tab = ItemKind | 'offers';
const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'ball', icon: 'circle-multiple' },
  { id: 'paint', icon: 'format-paint' },
  { id: 'offers', icon: 'gift' },
];
const COLUMNS = 3;
const ART_W = 80;
const ART_H = 76;

export default function ShopScreen() {
  useScreenReady('/shop');
  useLanguage();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ tab?: string; item?: string }>();
  // An item can be asked for by the route (the card after the daily challenge): its tab opens and it is selected.
  const asked = params.item ? SHOP_ITEMS.find((i) => i.id === params.item) : undefined;
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>(params.tab === 'offers' ? 'offers' : asked ? asked.kind : 'ball');
  // The guided tour: the hand presses the "Offres" tab and it really opens; the list of offers is scrolled to what is presented.
  const offersScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => registerTourAction('shop-tab-offers', () => setTab('offers')), []);
  const [filter, setFilter] = useState<ShopFilter>('all');
  const [selected, setSelected] = useState<{ ball: string; paint: string }>({
    ball: asked?.kind === 'ball' ? asked.id : profile.equipped.ball,
    paint: asked?.kind === 'paint' ? asked.id : profile.equipped.paint,
  });
  const visited = useRef(new Set<ItemKind>(['ball']));

  // What the player has been shown is no longer "new" once they leave the shop.
  useEffect(
    () => () => {
      const ids = SHOP_ITEMS.filter((i) => visited.current.has(i.kind)).map((i) => i.id);
      updateProfile((p) => markSeen(p, ids));
    },
    [],
  );

  const kind: ItemKind = tab === 'paint' ? 'paint' : 'ball';

  const items = useMemo(() => (tab === 'offers' ? [] : sortItems(filterItems(itemsOfKind(kind), profile, filter), profile)), [tab, kind, profile, filter]);
  const current: ShopItem | undefined = tab === 'offers' ? undefined : SHOP_ITEMS.find((i) => i.id === selected[kind]);

  /** The item just bought: the bar shows "Équipé ✓" with a little burst of coins for a moment. */
  const [bought, setBought] = useState<string | null>(null);
  /** The coins of the purchase only fly for a moment: they are never left on the button. */
  const [burst, setBurst] = useState(false);
  const buy = (item: ShopItem) => {
    const result = buyItem(profile, item.id);
    if (!result.ok) {
      if (result.reason === 'coins') setTab('offers');
      return;
    }
    // Bought: it is worn at once (the obvious choice), and the bar says so.
    updateProfile(() => equipItem(result.profile, item.id) ?? result.profile);
    track('shop_item_bought', { item: item.id, kind: item.kind, price: item.price });
    playSfx('purchase');
    setBought(item.id);
    setBurst(true);
    setTimeout(() => setBurst(false), 950);
    setTimeout(() => setBought((b) => (b === item.id ? null : b)), 1600);
  };

  const equip = (item: ShopItem) => updateProfile((p) => equipItem(p, item.id) ?? p);
  const select = useCallback((item: ShopItem) => {
    setSelected((s) => ({ ...s, [item.kind]: item.id }));
    updateProfile((p) => markSeen(p, [item.id]));
  }, []);

  /** The preview takes about 30 % of the screen. */
  const previewHeight = Math.max(170, Math.min(260, Math.round(windowHeight * 0.3)));

  /** Fixed under the tabs, whatever the scroll: the selected item (3D preview, name, rarity, action) and the filters. */
  const fixedTop = current && (
    <View style={styles.fixedTop}>
      <Card3D innerStyle={styles.previewCard}>
        <View style={[styles.preview, { height: previewHeight }]}>
          {focused && (
            <ShopPreview ball={kind === 'ball' ? current.id : profile.equipped.ball} paint={kind === 'paint' ? current.id : profile.equipped.paint} />
          )}
          <View style={[styles.rarityTag, { backgroundColor: rarityColors[current.rarity] }]} pointerEvents="none">
            <Text style={styles.rarityTagText}>{rarityName(current.rarity)}</Text>
          </View>
        </View>
        <View style={styles.previewInfo}>
          <View style={styles.flex}>
            <Text style={styles.itemName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {itemName(current.id)}
            </Text>
            {current.exclusive ? (
              <Text style={styles.how} numberOfLines={2}>
                {howText(current)}
              </Text>
            ) : (
              <Text style={[styles.how, { color: rarityColors[current.rarity] }]}>{rarityName(current.rarity)}</Text>
            )}
            {!owns(profile, current.id) && !current.exclusive && (current.price ?? 0) > profile.coins && (
              <Pressable onPress={() => setTab('offers')} hitSlop={8}>
                <Text style={styles.barLink}>{t('trial.seeOffers')}</Text>
              </Pressable>
            )}
          </View>
          <ActionButton item={current} profile={profile} justBought={bought === current.id} burst={burst} onBuy={() => buy(current)} onEquip={() => equip(current)} />
        </View>
      </Card3D>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {SHOP_FILTERS.map((f) => {
          const on = filter === f;
          const color = f === 'all' || f === 'owned' ? colors.gold : rarityColors[f];
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, on && { backgroundColor: color, borderColor: color }, !on && { borderColor: color }]}>
              <Text style={[styles.chipText, on && { color: colors.ink }]}>{t(`shop.filter.${f}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hud.shop')} />

      <View style={styles.tabs}>
        {TABS.map((tb) => (
          <Button3D
            key={tb.id}
            tourId={`shop-tab-${tb.id}`}
            style={styles.flex}
            block
            size="sm"
            icon={tb.icon}
            label={t(`shop.tab.${tb.id}`)}
            variant={tab === tb.id ? 'primary' : 'neutral'}
            onPress={() => {
              if (tb.id !== 'offers') visited.current.add(tb.id);
              setTab(tb.id);
              setFilter('all');
            }}
          />
        ))}
      </View>

      {tab !== 'offers' && fixedTop}

      <View style={styles.flex}>
        {tab === 'offers' ? (
          <ScrollView ref={offersScroll} contentContainerStyle={{ paddingHorizontal: MARGIN, paddingTop: 12, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
            <OffersScrollContext.Provider value={offersScroll}>
              <Offers />
            </OffersScrollContext.Provider>
          </ScrollView>
        ) : (
          <FlatList
            key={tab}
            data={items}
            numColumns={COLUMNS}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={<Text style={styles.empty}>{t('shop.empty')}</Text>}
            columnWrapperStyle={styles.row}
            contentContainerStyle={{ paddingHorizontal: MARGIN, paddingTop: 4, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={9}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                owned={owns(profile, item.id)}
                equipped={profile.equipped[item.kind] === item.id}
                selected={selected[item.kind] === item.id}
                isNew={isNewItem(item, profile)}
                onSelect={select}
              />
            )}
          />
        )}
        <TopFade />
      </View>

    </View>
  );
}

/**
 * The one place to buy or wear the selected item: buy it (price), wear it, "Équipé" (one tick) when it is worn, how to get it when it
 * is exclusive, or, short of coins, a greyed "Il manque X pièces".
 */
function ActionButton({ item, profile, justBought, burst, onBuy, onEquip }: { item: ShopItem; profile: Profile; justBought: boolean; burst: boolean; onBuy: () => void; onEquip: () => void }) {
  const owned = owns(profile, item.id);
  const equipped = profile.equipped[item.kind] === item.id;
  const price = item.price ?? 0;
  const missing = Math.max(0, price - profile.coins);
  return (
    <View style={styles.barAction}>
      {justBought || equipped ? (
        <Animated.View key={justBought ? 'bought' : 'worn'} entering={ZoomIn.duration(200)} style={styles.badge}>
          <Icon name="check-bold" size={18} color={colors.text} />
          <Text style={styles.badgeText}>{t('shop.equipped')}</Text>
        </Animated.View>
      ) : owned ? (
        <Button3D size="md" variant="success" label={t('shop.equip')} onPress={onEquip} />
      ) : item.exclusive ? (
        <View style={styles.exclusive}>
          <Icon name="lock" size={16} color={colors.textMuted} />
          <Text style={styles.exclusiveText} numberOfLines={2}>
            {t('shop.exclusive')}
          </Text>
        </View>
      ) : missing > 0 ? (
        <Button3D size="md" variant="neutral" disabled label={t('trial.missing', { amount: formatNumber(missing) })} />
      ) : (
        <Button3D size="md" variant="primary" onPress={onBuy}>
          <Text style={styles.buyLabel}>{t('common.buy')}</Text>
          <CoinAmount amount={price} size={18} textStyle={{ color: colors.onGold }} />
        </Button3D>
      )}
      {burst && <CoinBurst />}
    </View>
  );
}

/** A few coins rising from the button after a purchase. */
function CoinBurst() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 900 }));
  }, [t]);
  return (
    <View style={styles.burst} pointerEvents="none">
      {[0, 1, 2, 3, 4].map((i) => (
        <BurstCoin key={i} t={t} i={i} />
      ))}
    </View>
  );
}
function BurstCoin({ t, i }: { t: { get: () => number }; i: number }) {
  const style = useAnimatedStyle(() => {
    const k = t.get();
    return { opacity: 1 - k * k, transform: [{ translateX: (i - 2) * 16 * k }, { translateY: -50 * k - (i % 2) * 14 * k }, { scale: 1 - 0.3 * k }] };
  });
  return (
    <Animated.View style={[styles.burstCoin, style]}>
      <CoinIcon size={18} />
    </Animated.View>
  );
}

const ItemCard = memo(function ItemCard({
  item,
  owned,
  equipped,
  selected,
  isNew,
  onSelect,
}: {
  item: ShopItem;
  owned: boolean;
  equipped: boolean;
  selected: boolean;
  isNew: boolean;
  onSelect: (item: ShopItem) => void;
}) {
  const uri = useThumbnail(item.kind, item.id);
  return (
    <Card3D
      style={styles.cell}
      innerStyle={styles.cellInner}
      selected={selected}
      borderColor={rarityColors[item.rarity]}
      onPress={() => onSelect(item)}
    >
      <View style={styles.thumbBox}>
        {uri ? <Image source={{ uri }} style={styles.thumb} /> : <View style={styles.thumbHolder} />}
        {item.rarity === 'legendary' && (
          <>
            <Twinkle x={6} y={8} delay={0} />
            <Twinkle x={48} y={14} delay={500} />
            <Twinkle x={38} y={48} delay={900} />
          </>
        )}
        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newText}>{t('shop.new')}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {itemName(item.id)}
      </Text>
      {equipped ? (
        <View style={styles.stateRow}>
          <Icon name="check-circle" size={16} color={colors.green} />
          <Text style={styles.stateOk}>{t('shop.equipped')}</Text>
        </View>
      ) : owned ? (
        <Text style={styles.stateText}>{t('shop.owned')}</Text>
      ) : item.exclusive ? (
        <View style={styles.stateRow}>
          <Icon name="lock" size={15} color={colors.textMuted} />
          <Text style={styles.stateText}>{t('shop.exclusive')}</Text>
        </View>
      ) : (
        <CoinAmount amount={item.price ?? 0} size={15} />
      )}
    </Card3D>
  );
});

function Twinkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 650 }), withTiming(0, { duration: 600 })), -1)));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ scale: 0.4 + t.get() * 0.9 }, { rotate: '45deg' }] }));
  return <Animated.View pointerEvents="none" style={[styles.twinkle, { left: x, top: y }, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  // Opaque, and above the list: what scrolls goes under the tabs and is gone (the fade below them softens the edge).
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: MARGIN, paddingVertical: 8, backgroundColor: colors.bg, zIndex: 3, elevation: 3 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: MARGIN, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: 2, borderTopColor: colors.surfaceEdge },
  barThumb: { width: 60, height: 60, borderRadius: 14, borderWidth: 2, overflow: 'hidden', backgroundColor: colors.previewBg },
  barText: { flex: 1, gap: 1 },
  barName: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800' },
  barRarity: { fontSize: fontSizes.xs, fontWeight: '800' },
  barLink: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '800' },
  barAction: { alignItems: 'flex-end', maxWidth: 190, gap: 6 },
  buyLabel: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '800' },
  exclusive: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 170 },
  exclusiveText: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '700', flexShrink: 1 },
  mini: { position: 'absolute', top: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14, paddingLeft: 4, height: 44, borderRadius: 22, borderWidth: 2, backgroundColor: colors.surface },
  miniThumb: { width: 36, height: 36, borderRadius: 18 },
  miniName: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800', maxWidth: 160 },
  burst: { position: 'absolute', right: 40, bottom: 20, width: 1, height: 1 },
  burstCoin: { position: 'absolute' },
  fixedTop: { paddingHorizontal: MARGIN, paddingTop: 8 },
  previewWrap: { paddingTop: 12 },
  previewCard: { padding: 8, gap: 8 },
  preview: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.previewBg },
  rarityTag: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  rarityTagText: { color: colors.ink, fontSize: fontSizes.xs, fontWeight: '700' },
  previewInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingBottom: 2 },
  itemName: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  how: { color: colors.textMuted, fontSize: fontSizes.xs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.equipped },
  badgeText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  filters: { gap: 8, paddingVertical: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 2, backgroundColor: colors.surfaceEdge },
  chipText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  row: { gap: 10, marginBottom: 10 },
  cell: { flex: 1 },
  cellInner: { alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderWidth: 2 },
  thumbBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64 },
  thumbHolder: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHi, opacity: 0.6 },
  twinkle: { position: 'absolute', width: 7, height: 7, backgroundColor: colors.text },
  newBadge: { position: 'absolute', top: -4, left: -8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.red },
  newText: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '700' },
  cardName: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '600' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stateOk: { color: colors.green, fontSize: fontSizes.xs, fontWeight: '700' },
  stateText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14 },
  offerArt: { width: ART_W, height: ART_H, alignItems: 'center', justifyContent: 'center' },
  art: { width: ART_W, height: ART_H, overflow: 'hidden' },
  artBall: { position: 'absolute', width: 40, height: 40 },
  offerText: { flex: 1, minWidth: 0, gap: 3 },
  offerTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  offerDesc: { color: colors.textSoft, fontSize: fontSizes.xs },
  bonus: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.equipped },
  bonusText: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '700' },
  tag: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 9, borderRadius: radius.pill },
  tagText: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdown: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '800' },
  gauge: { height: 8, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)', overflow: 'hidden', marginTop: 2 },
  gaugeFill: { height: 8, borderRadius: 4, backgroundColor: colors.coin },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gaugeText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800' },
  owned: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownedText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  fine: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
});
