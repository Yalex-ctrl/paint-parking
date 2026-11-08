import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Overlay } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { dayKeyOf } from '@/game/dates';
import { formatDuration } from '@/game/duration';
import { adLivesLeft } from '@/game/lives';
import { t } from '@/i18n';
import { useLivesView } from '@/storage/lives';
import { useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinAmount } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, space, fontSizes } from '@/ui/theme';

/** "Plus de coups !": more moves for a rewarded ad (once per attempt) or for coins, or give up (a life is lost). */
export function OutOfMoves({
  limit,
  adUsed,
  onAd,
  onCoins,
  onGiveUp,
  lifeAtStake,
}: {
  limit: number;
  adUsed: boolean;
  onAd: () => void;
  onCoins: () => void;
  onGiveUp: () => void;
  lifeAtStake: boolean;
}) {
  const profile = useProfile();
  const { bonusMoves, bonusMovesCoinCost } = MONETIZATION.moves;
  const canPay = profile.coins >= bonusMovesCoinCost;
  return (
    <Overlay>
      <Text style={styles.title}>{t('lives.noMoves.title')}</Text>
      <Text style={styles.body}>{t('lives.noMoves.body', { count: limit })}</Text>
      {!adUsed && <Button3D block variant="success" icon="play-circle-outline" label={t('lives.noMoves.ad', { count: bonusMoves })} onPress={onAd} />}
      <Button3D block variant={canPay ? 'primary' : 'neutral'} disabled={!canPay} onPress={onCoins}>
        <Text style={[styles.btnText, { color: canPay ? colors.onGold : colors.textSoft }]}>{`${t('lives.noMoves.coins', { count: bonusMoves })} · `}</Text>
        <CoinAmount amount={bonusMovesCoinCost} size={20} textStyle={{ color: canPay ? colors.onGold : colors.textSoft }} />
      </Button3D>
      <Pressable onPress={onGiveUp} hitSlop={10}>
        <Text style={styles.later}>{lifeAtStake ? t('lives.giveUp') : t('lives.restart')}</Text>
      </Pressable>
    </Overlay>
  );
}

/** "Recommencer coûte 1 vie" / "Quitter coûte 1 vie". */
export function ConfirmLife({ title, body, confirm, onConfirm, onCancel }: { title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Overlay onDismiss={onCancel}>
      <Icon name="heart-broken" size={40} color={colors.red} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Button3D block variant="danger" label={confirm} onPress={onConfirm} />
      <Button3D block variant="neutral" label={t('lives.keepPlaying')} onPress={onCancel} />
    </Overlay>
  );
}

/** At 0 lives, when the player touches "Jouer": the countdown, a life for an ad, all of them for coins, or the shop. */
export function NoLives({ onAd, onRefill, onShop, onClose }: { onAd: () => void; onRefill: () => void; onShop: () => void; onClose: () => void }) {
  const router = useRouter();
  const profile = useProfile();
  const v = useLivesView();
  const adLeft = adLivesLeft(profile.lives, dayKeyOf(new Date()));
  const canPay = profile.coins >= MONETIZATION.lives.refillCoinCost;
  return (
    <Overlay onDismiss={onClose}>
      <Icon name="heart-broken" size={44} color={colors.red} />
      <Text style={styles.title}>{t('lives.none')}</Text>
      {v.nextInMs !== null && <Text style={styles.countdown}>{t('lives.nextIn', { time: formatDuration(v.nextInMs) })}</Text>}
      {adLeft > 0 ? (
        <Button3D block variant="success" icon="play-circle-outline" label={t('lives.adLife', { count: adLeft })} onPress={onAd} />
      ) : (
        <Text style={styles.small}>{t('lives.noMoreAds')}</Text>
      )}
      <Button3D block variant={canPay ? 'primary' : 'neutral'} disabled={!canPay} onPress={onRefill}>
        <Text style={[styles.btnText, { color: canPay ? colors.onGold : colors.textSoft }]}>{t('lives.refill', { count: MONETIZATION.lives.max })} · </Text>
        <CoinAmount amount={MONETIZATION.lives.refillCoinCost} size={20} textStyle={{ color: canPay ? colors.onGold : colors.textSoft }} />
      </Button3D>
      <Pressable onPress={onShop} hitSlop={10}>
        <Text style={styles.link}>{t('lives.seeShop')}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          onClose();
          router.push({ pathname: '/vip', params: { source: 'vies' } });
        }}
        hitSlop={10}
      >
        <Text style={styles.link}>{t('vip.livesLink')}</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={10}>
        <Text style={styles.later}>{t('common.close')}</Text>
      </Pressable>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  small: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
  countdown: { color: colors.gold, fontSize: fontSizes.lg, fontWeight: '700' },
  btnText: { fontSize: fontSizes.md, fontWeight: '800' },
  later: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: 2 },
  link: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '700', marginTop: space.xs },
});
