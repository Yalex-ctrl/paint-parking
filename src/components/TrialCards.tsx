import { itemName } from '@/i18n/names';
import { formatNumber , t } from '@/i18n';

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Overlay } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { buyItem, equipItem } from '@/game/economy';
import { itemById } from '@/game/shopItems';
import { playSfx } from '@/services/audio';
import { getProfile, updateProfile, useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinAmount } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/** "Essai : 2 niveaux restants": a small pill in the level while a ball or a paint is on trial. */
export function TrialBadge({ levelsLeft, bottom }: { levelsLeft: number; bottom: number }) {
  return (
    <View style={[styles.badge, { bottom }]} pointerEvents="none">
      <Icon name="flask-outline" size={14} color={colors.ink} />
      <Text style={styles.badgeText}>
        {t('trial.badge', { count: levelsLeft })}
      </Text>
    </View>
  );
}

/**
 * The end of a trial: "Tu as aimé la balle Lave ?" with the price (or what is missing, and the way to the offers), and "Non merci".
 * The equipment from before is already back on.
 */
export function TrialEndCard({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const router = useRouter();
  const profile = useProfile();
  const item = itemById(itemId);
  if (!item || item.price === undefined) return null;
  const price = item.price;
  const missing = Math.max(0, price - profile.coins);
  const buy = () => {
    const r = buyItem(getProfile(), itemId);
    if (!r.ok) return;
    const equipped = equipItem(r.profile, itemId) ?? r.profile;
    updateProfile(() => equipped);
    playSfx('purchase');
    onClose();
  };
  return (
    <Overlay onDismiss={onClose}>
      <Text style={styles.title}>
        {t(item.kind === 'ball' ? 'trial.likedBall' : 'trial.likedPaint', { name: itemName(item.id) })}
      </Text>
      {missing === 0 ? (
        <Button3D block variant="primary" onPress={buy}>
          <View style={styles.row}>
            <Text style={styles.btn}>{t('common.buy')} · </Text>
            <CoinAmount amount={price} size={20} textStyle={{ color: colors.onGold }} />
          </View>
        </Button3D>
      ) : (
        <>
          <Button3D block variant="neutral" disabled label={t('trial.missing', { amount: formatNumber(missing) })} onPress={() => {}} />
          <Pressable
            onPress={() => {
              onClose();
              router.push({ pathname: '/shop', params: { tab: 'offers' } });
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>{t('trial.seeOffers')}</Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={onClose} style={styles.link}>
        <Text style={styles.linkText}>{t('common.noThanks')}</Text>
      </Pressable>
    </Overlay>
  );
}

void MONETIZATION;

const styles = StyleSheet.create({
  badge: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: colors.gold },
  badgeText: { color: colors.ink, fontSize: fontSizes.xs, fontWeight: '800' },
  title: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '800' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: 'rgba(255, 255, 255, 0.8)', fontSize: fontSizes.md, fontWeight: '700' },
});
