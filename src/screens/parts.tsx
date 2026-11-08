import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { ChestOpening, WorldProgressRow } from '@/core/components/LevelResult';
import { Confetti } from '@/core/components/Confetti';
import { Overlay } from '@/core/components/Modals';
import { t } from '@/core/i18n';
import { Button3D } from '@/core/ui/Button3D';
import { CoinAmount } from '@/core/ui/CoinIcon';
import { Icon } from '@/core/ui/Icon';
import { OutlineText } from '@/core/ui/OutlineText';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

/**
 * "Étape terminée !": the chest falls, shakes and opens at once with the veil (see ChestOpening), then the card: the coins, how far
 * through the world and its picture the player is, and the choice to double the coins for a rewarded ad.
 */
export function StepEnd({
  step,
  coins,
  progress,
  onDouble,
  onClose,
}: {
  step: number;
  coins: number;
  progress: { levelId: number; picture: number; pieces: number } | null;
  onDouble: () => void;
  onClose: () => void;
}) {
  const [doubled, setDoubled] = useState(false);
  const [stage, setStage] = useState<'chest' | 'card'>('chest');
  return (
    <>
      {stage === 'chest' ? (
        <ChestOpening onDone={() => setStage('card')} />
      ) : (
        <>
          <Confetti width={400} height={800} count={50} />
          <Overlay>
            <Icon name="treasure-chest-outline" size={72} color={colors.coin} />
            <OutlineText style={styles.stepTitle} width={2.5}>
              {t('step.done')}
            </OutlineText>
            <Text style={styles.stepBody}>{t('step.number', { step })}</Text>
            <CoinAmount amount={`+${doubled ? coins * 2 : coins}`} size={34} textStyle={{ color: colors.coin }} />
            {progress && <WorldProgressRow levelId={progress.levelId} picture={progress.picture} pieces={progress.pieces} />}
            {!doubled && (
              <Button3D
                block
                variant="success"
                icon="play-circle-outline"
                label={t('step.double')}
                onPress={() => {
                  setDoubled(true);
                  onDouble();
                }}
              />
            )}
            <Button3D block variant="primary" label={t('common.continue')} onPress={onClose} />
          </Overlay>
        </>
      )}
    </>
  );
}

/** "3 / 12 coups": it pulses when only three moves are left, faster on the last one. */
export function MovesText({ moves, limit }: { moves: number; limit: number | null }) {
  const left = limit === null ? Infinity : limit - moves;
  const urgent = left <= 3;
  const critical = left <= 1;
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (urgent) pulse.set(withRepeat(withSequence(withTiming(1.14, { duration: critical ? 260 : 420 }), withTiming(1, { duration: critical ? 260 : 420 })), -1));
    else {
      cancelAnimation(pulse);
      pulse.set(1);
    }
  }, [urgent, critical, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const color = critical ? colors.red : left <= 3 ? '#ffa94d' : colors.textSoft;
  return (
    <Animated.Text style={[styles.movesText, { color }, style]}>{limit === null ? t('game.moves', { count: moves }) : t('game.movesOf', { moves, limit })}</Animated.Text>
  );
}

const styles = StyleSheet.create({
  stepTitle: { fontSize: fontSizes.xl, textAlign: 'center' },
  stepBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  movesText: { fontSize: fontSizes.sm, fontWeight: '800' },
});

export const Spacer = View;
