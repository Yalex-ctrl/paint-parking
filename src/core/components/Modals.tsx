import { worldName } from '@/core/i18n/worldNames';
import { itemName } from '@/core/i18n/names';
import { priceText, t } from '@/core/i18n';

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { MONETIZATION } from '@/core/config/monetization';
import { formatDuration } from '@/core/duration';
import { starterRemainingMs } from '@/core/economy';
import { mechanicsNewInWorld, themeForLevel, worldIndexOf } from '@/core/worlds';
import { playSfx } from '@/core/services/audio';
import { purchaseProduct } from '@/core/services/purchases';
import { updateProfile, useProfile } from '@/core/storage/profile';
import { TUTORIAL_TEXT } from '@/core/storage/tutorials';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { CoinAmount } from '@/core/ui/CoinIcon';
import { Icon, type IconName } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors, space, type ButtonVariant, fontSizes } from '@/core/ui/theme';

/** A dimmed full-screen layer with a card in the middle (a plain View: the 3D scene underneath keeps running). */
export function Overlay({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  // A soft sound as the pop-up opens, and another as it goes away.
  useEffect(() => {
    playSfx('popup_open', 0.8);
    return () => playSfx('popup_close', 0.8);
  }, []);
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
      {onDismiss && <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />}
      <Animated.View entering={FadeIn.duration(200)} style={styles.cardWrap}>
        <Card3D innerStyle={styles.card}>{children}</Card3D>
      </Animated.View>
    </Animated.View>
  );
}

/** The big button of a pop-up. */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
}) {
  return <Button3D block label={label} onPress={onPress} variant={variant} />;
}

/** Shown when the first level of a new world starts: its name, a small preview, and the new mechanic if any. */
export function WorldUnlock({ levelId, onClose }: { levelId: number; onClose: () => void }) {
  useEffect(() => {
    playSfx('world');
  }, []);
  const theme = themeForLevel(levelId);
  const news = mechanicsNewInWorld(worldIndexOf(levelId));
  return (
    <Overlay>
      <Text style={styles.kicker}>{t('modals.newWorld')}</Text>
      <View style={[styles.preview, { backgroundColor: theme.sky.top }]}>
        <View style={[styles.previewSky, { backgroundColor: theme.sky.bottom }]} />
        <View style={[styles.previewGround, { backgroundColor: theme.ground.near }]}>
          <View style={[styles.previewGroundFar, { backgroundColor: theme.ground.far }]} />
        </View>
        <Icon name={theme.icon as IconName} size={56} color={colors.text} />
      </View>
      <Text style={styles.title}>{worldName(levelId)}</Text>
      {news.map((m) => (
        <Text key={m} style={styles.body}>
          {TUTORIAL_TEXT[m]}
        </Text>
      ))}
      <PrimaryButton label={t('modals.letsGo')} onPress={onClose} />
    </Overlay>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/** Re-renders every second and returns the value of `remaining()` (milliseconds left). */
export function useCountdown(remaining: () => number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return remaining();
}

/** The starter pack: no ads, 3 exclusive balls and coins, for 48 hours after level 15. */
export function StarterPackOffer({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const pack = MONETIZATION.products.starterPack;
  const left = useCountdown(() => starterRemainingMs(profile, Date.now()));
  const bought = profile.starter.purchased;
  return (
    <Overlay onDismiss={onClose}>
      <Text style={styles.kicker}>{t('modals.starter.kicker')}</Text>
      <Text style={styles.title}>{t('modals.starter.title')}</Text>
      <Text style={styles.body}>{t('modals.starter.body', { names: pack.skins.map((id) => itemName(id)).join(` ${t('common.and')} `) })}</Text>
      <CoinAmount amount={pack.coins} size={22} />
      {!bought && left > 0 && (
        <View style={styles.timer}>
          <Icon name="timer-outline" size={20} color={colors.gold} />
          <Text style={styles.countdown}>{t('shop.expiresIn', { time: formatDuration(left) })}</Text>
        </View>
      )}
      {bought ? (
        <PrimaryButton label={t('common.thanks')} variant="success" onPress={onClose} />
      ) : (
        <PrimaryButton
          label={`${t('common.buy')} · ${priceText(pack.id, pack.priceEur)}`}
          onPress={() => {
            purchaseProduct(pack.id).then((ok) => {
              if (ok) playSfx('purchase');
              if (ok) onClose();
            });
          }}
        />
      )}
      <Pressable onPress={onClose} hitSlop={10}>
        <Text style={styles.later}>{t('common.later')}</Text>
      </Pressable>
    </Overlay>
  );
}

/** Marks the offer as shown (starts the 48 h countdown). */
export const markStarterOffered = () =>
  updateProfile((p) => (p.starter.offeredAt === null ? { ...p, starter: { ...p.starter, offeredAt: Date.now() } } : p));

/** Choice when the player asks for a hint: coins or a rewarded ad. */
export function HintChoice({
  coins,
  free = 0,
  onCoins,
  onAd,
  onCancel,
}: {
  coins: number;
  /** Hints won on the wheel: used first. */
  free?: number;
  onCoins: () => void;
  onAd: () => void;
  onCancel: () => void;
}) {
  const cost = MONETIZATION.hint.coinCost;
  const canPay = free > 0 || coins >= cost;
  return (
    <Overlay onDismiss={onCancel}>
      <Text style={styles.title}>{t('modals.hint.title')}</Text>
      <Text style={styles.body}>{t('modals.hint.body')}</Text>
      <Button3D block variant={canPay ? 'primary' : 'neutral'} onPress={canPay ? onCoins : onCancel} disabled={!canPay}>
        {free > 0 ? (
          <Text style={{ color: colors.onGold, fontSize: fontSizes.md, fontWeight: '800' }}>{t('modals.hint.free', { count: free })}</Text>
        ) : (
          <CoinAmount amount={cost} size={20} textStyle={{ color: canPay ? colors.onGold : colors.textSoft }} />
        )}
      </Button3D>
      {!canPay && <Text style={styles.small}>{t('common.notEnoughCoins')}</Text>}
      <Button3D block variant="success" icon="play-circle-outline" label={t('common.watchAd')} onPress={onAd} />
      <Pressable onPress={onCancel} style={styles.cancelHit} accessibilityRole="button">
        <Text style={styles.cancel}>{t('common.cancel')}</Text>
      </Pressable>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    padding: space.xl,
  },
  cardWrap: { width: '100%', maxWidth: 360 },
  card: { alignItems: 'center', gap: space.md, padding: 20 },
  kicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  small: { color: colors.textMuted, fontSize: fontSizes.xs },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdown: { color: colors.gold, fontSize: fontSizes.lg, fontWeight: '700' },
  // White at 80 %, big, with a touch area of at least 44 px.
  cancelHit: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancel: { color: 'rgba(255, 255, 255, 0.8)', fontSize: fontSizes.md, fontWeight: '700' },
  later: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: 2 },
  preview: { width: '100%', height: 110, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewSky: { position: 'absolute', top: 40, left: 0, right: 0, bottom: 0 },
  previewGround: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  previewGroundFar: { height: 14 },
});
