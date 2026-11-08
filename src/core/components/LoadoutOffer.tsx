import { howText, itemLabel } from '@/core/i18n/names';
import { t } from '@/core/i18n';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { dailyLoadout, unownedOf } from '@/core/dailyLoadout';
import { type ShopItem } from '@/core/shopItems';
import { useThumbnail } from '@/core/render/useThumbnail';
import { useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { CoinAmount } from '@/core/ui/CoinIcon';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

/** What it costs, written for the card: "3 000 🪙", or how it is earned when it cannot be bought. */
function Price({ item }: { item: ShopItem }) {
  if (item.price !== undefined) return <CoinAmount amount={item.price} size={16} textStyle={{ color: colors.textSoft }} />;
  return <Text style={styles.how}>{item.exclusive ? howText(item) : t('shop.exclusive')}</Text>;
}

function Row({ item, onShop }: { item: ShopItem; onShop: (id: string) => void }) {
  const uri = useThumbnail(item.kind, item.id);
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>{uri ? <Image source={{ uri }} style={styles.thumbImage} /> : <View style={styles.thumbInner} />}</View>
      <View style={styles.rowText}>
        <Text style={styles.name}>
          {itemLabel(item.id)}
        </Text>
        <Price item={item} />
      </View>
      <Button3D size="sm" variant="primary" label={t('loadout.seeInShop')} onPress={() => onShop(item.id)} />
    </View>
  );
}

/**
 * After a daily challenge: if the ball or the paint of the day is not the player's, a small card asks "Ça t'a plu ?" and takes them to
 * the item in the shop ("Plus tard" leaves it).
 */
export function LoadoutOffer({ day, onLater }: { day: string; onLater: () => void }) {
  const router = useRouter();
  const profile = useProfile();
  const items = unownedOf(dailyLoadout(day), profile.owned);
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('loadout.liked')}</Text>
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          onShop={(id) => {
            onLater();
            router.push({ pathname: '/shop', params: { item: id } });
          }}
        />
      ))}
      <Pressable onPress={onLater} style={styles.later} accessibilityRole="button">
        <Text style={styles.laterText}>{t('common.later')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', gap: 8, padding: 10, borderRadius: 16, backgroundColor: 'rgba(0, 0, 0, 0.22)' },
  title: { color: colors.gold, fontSize: fontSizes.md, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumbImage: { width: 52, height: 52, borderRadius: 26 },
  thumb: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  thumbInner: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gold },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800' },
  how: { color: colors.textSoft, fontSize: fontSizes.xs },
  later: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: 'rgba(255, 255, 255, 0.7)', fontSize: fontSizes.sm, fontWeight: '700' },
});
