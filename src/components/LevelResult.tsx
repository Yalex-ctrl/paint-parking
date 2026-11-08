import { useCommitTimer } from '../render/useCommitTimer';
import { worldName } from '@/i18n/worldNames';
import { t } from '@/i18n';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PIECES, pictureUri } from '@/game/gallery';
import { RESULT_FADE_MS, resultTimings, SCORE_COUNT_MS, STAR_FIRST_MS, STAR_GAP_MS } from '@/render/resultTimings';
import { themeForLevel, worldProgress } from '@/game/worlds';
import { playSfx } from '@/services/audio';
import { CoinIcon } from '@/ui/CoinIcon';
import { Icon, type IconName } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes, fonts, radius } from '@/ui/theme';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

function Star({ index, onStar }: { index: number; onStar: (i: number) => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => onStar(index), STAR_FIRST_MS + index * STAR_GAP_MS);
    t.set(withDelay(STAR_FIRST_MS + index * STAR_GAP_MS, withSequence(withTiming(1.35, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160 }))));
    return () => clearTimeout(id);
    // Each star plays once, when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.get() * 4), transform: [{ scale: t.get() }, { rotate: index % 2 ? '8deg' : '-8deg' }] }));
  return (
    <Animated.Text style={[styles.star, style]} accessible={false}>
      ★
    </Animated.Text>
  );
}

/**
 * The result of a normal level, kept to the minimum: the stars, big, under the bar of the steps; under them one big number, the
 * points of the level, that runs up from 0 (a tick that speeds up); then the coins won as a single number ("+9", already multiplied
 * by the streak) that flies to the counter. "Parfait !" when it was perfect, a small "Meilleur score !" badge when the player has
 * beaten his own score on a level he had already finished (and "Record !" for the moves, likewise). Touching the score shows how it
 * was made, in a small bubble: nothing else is written. It goes away by itself before the next board is reached (unless the bubble is
 * open).
 */
export function ResultStars({
  top,
  stars,
  newRecord,
  newBestScore,
  perfect,
  score,
  detail,
  showScore,
  gain,
  onStar,
}: {
  top: number;
  stars: 1 | 2 | 3;
  newRecord: boolean;
  newBestScore: boolean;
  perfect: boolean;
  score: number;
  /** The lines of the bubble that explains the score. */
  detail: string[];
  /** The score is shown (it is not in the very first levels, where the header is minimal). */
  showScore: boolean;
  /** The coins won, shown under the score; 0 shows nothing. */
  gain: number;
  onStar: (i: number) => void;
}) {
  useCommitTimer('ResultStars');
  const { scoreAt, scoreEnd, gainAt, flyAt, endAt } = resultTimings(stars);
  const gainIn = useSharedValue(0);
  const scoreIn = useSharedValue(0);
  const count = useSharedValue(0);
  const all = useSharedValue(1);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    scoreIn.set(withDelay(scoreAt, withTiming(1, { duration: 160 })));
    count.set(withDelay(scoreAt, withTiming(score, { duration: SCORE_COUNT_MS, easing: Easing.out(Easing.quad) })));
    gainIn.set(withDelay(gainAt, withSequence(withTiming(1, { duration: 200 }), withDelay(Math.max(0, flyAt - gainAt - 200), withTiming(0, { duration: 160 })))));
    all.set(withDelay(endAt, withTiming(0, { duration: RESULT_FADE_MS })));
    // The ticks of the number: they come faster and faster, as it runs.
    const ticks: ReturnType<typeof setTimeout>[] = [];
    if (showScore) {
      const N = 9;
      for (let k = 0; k < N; k++) ticks.push(setTimeout(() => playSfx('click', 0.3 + 0.04 * k), scoreAt + SCORE_COUNT_MS * (1 - Math.pow(1 - k / N, 1.7))));
    }
    return () => ticks.forEach(clearTimeout);
    // The result is played once, when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // The bubble is open: the result stays until it is closed (or the level changes).
    if (open) {
      cancelAnimation(all);
      all.set(1);
    }
  }, [open, all]);
  const gainStyle = useAnimatedStyle(() => ({ opacity: gainIn.get(), transform: [{ translateY: (1 - Math.min(1, gainIn.get() * 2)) * 8 }, { scale: 0.85 + 0.15 * Math.min(1, gainIn.get() * 2) }] }));
  const scoreStyle = useAnimatedStyle(() => ({ opacity: scoreIn.get(), transform: [{ scale: 0.9 + 0.1 * scoreIn.get() }] }));
  const allStyle = useAnimatedStyle(() => ({ opacity: all.get() }));
  const scoreProps = useAnimatedProps(() => ({ text: String(Math.round(count.get())), defaultValue: '0' }) as never);
  void scoreEnd;
  return (
    <Animated.View style={[styles.result, { top }, allStyle]} pointerEvents="box-none">
      <View style={styles.starRow} pointerEvents="none">
        <View style={styles.stars}>
          {Array.from({ length: stars }, (_, i) => (
            <Star key={i} index={i} onStar={onStar} />
          ))}
        </View>
      </View>
      {showScore && (
        <Animated.View style={scoreStyle}>
          <Pressable onPress={() => setOpen((o) => !o)} hitSlop={10} style={styles.scoreBox} accessibilityRole="button" accessibilityLabel={t('result.scoreDetail')}>
            <AnimatedInput editable={false} pointerEvents="none" underlineColorAndroid="transparent" defaultValue="0" animatedProps={scoreProps} style={styles.scoreText} />
            <Text style={styles.scoreUnit}>{t('result.pts')}</Text>
          </Pressable>
        </Animated.View>
      )}
      {showScore && (perfect || newBestScore || newRecord) && (
        <Animated.View entering={FadeIn.delay(scoreAt + SCORE_COUNT_MS).duration(180)} style={styles.badges} pointerEvents="none">
          {perfect && (
            <View style={[styles.badge, styles.perfect]}>
              <Text style={styles.badgeText}>{t('result.perfect')}</Text>
            </View>
          )}
          {newBestScore && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('result.bestScore')}</Text>
            </View>
          )}
          {newRecord && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('result.record')}</Text>
            </View>
          )}
        </Animated.View>
      )}
      {gain > 0 && (
        <Animated.View style={[styles.gain, gainStyle]} pointerEvents="none">
          <Text style={styles.gainText}>+{gain}</Text>
          <CoinIcon size={26} />
        </Animated.View>
      )}
      {open && (
        <Animated.View entering={FadeIn.duration(140)} style={styles.detail}>
          <Pressable onPress={() => setOpen(false)}>
            {detail.map((line) => (
              <Text key={line} style={styles.detailText}>
                {line}
              </Text>
            ))}
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Draws the eye to its content with a gentle pulse while `active` (the restart button of a player who is stuck). */
export function Attention({ active, children }: { active: boolean; children: ReactNode }) {
  const k = useSharedValue(0);
  useEffect(() => {
    if (active) k.set(withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 520, easing: Easing.inOut(Easing.sin) })), -1));
    else {
      cancelAnimation(k);
      k.set(0);
    }
  }, [active, k]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.07 * k.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The coins of the piggy bank, under the result: how far through the world and its picture the player is (no animation: it is read once). */
export function WorldProgressRow({ levelId, picture, pieces }: { levelId: number; picture: number; pieces: number }) {
  useCommitTimer('WorldProgressRow');
  const { levelInWorld, total, fraction } = worldProgress(levelId);
  const theme = themeForLevel(levelId);
  const uri = useMemo(() => pictureUri(picture, pieces, 4), [picture, pieces]);
  return (
    <View style={styles.progress}>
      <Image source={{ uri }} style={styles.picture} />
      <View style={styles.progressBody}>
        <View style={styles.progressRow}>
          <View style={styles.worldName}>
            <Icon name={theme.icon as IconName} size={16} color={colors.text} />
            <Text style={styles.worldText}>{worldName(levelId)}</Text>
          </View>
          <Text style={styles.count}>
            {levelInWorld}/{total}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
        <Text style={styles.sub}>{pieces >= PIECES ? t('result.pictureDone') : t('result.picture', { pieces, total: PIECES })}</Text>
      </View>
    </View>
  );
}

const COIN_BITS = 14;

/**
 * The chest of a finished step, drawn at once with the veil: it falls from above, shakes, opens (a flash, the lid pops) and coins
 * burst out of it. Pure React Native / Reanimated: nothing to load, so nothing to wait for. `onDone` is called when it is over and
 * the "Étape terminée !" card can come in.
 */
export function ChestOpening({ onDone }: { onDone: () => void }) {
  const fall = useSharedValue(0);
  const shake = useSharedValue(0);
  const open = useSharedValue(0);
  const burst = useSharedValue(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  const bits = useMemo(
    () =>
      Array.from({ length: COIN_BITS }, (_, i) => {
        const a = -Math.PI / 2 + ((i / COIN_BITS) * 2 - 1) * 1.1;
        const speed = 110 + ((i * 47) % 90);
        return { dx: Math.cos(a) * speed, dy: Math.sin(a) * speed, delay: (i % 5) * 25 };
      }),
    [],
  );
  const [stage, setStage] = useState<'closed' | 'open'>('closed');

  useEffect(() => {
    playSfx('chest', 0.9);
    fall.set(withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }));
    shake.set(withDelay(520, withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 120 }), withTiming(1, { duration: 120 }), withTiming(-1, { duration: 120 }), withTiming(0, { duration: 70 }))));
    const opener = setTimeout(() => {
      setStage('open');
      open.set(withSequence(withTiming(1, { duration: 120 }), withTiming(0.35, { duration: 400 })));
      burst.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }, 1050);
    const done = setTimeout(() => doneRef.current(), 1750);
    return () => {
      clearTimeout(opener);
      clearTimeout(done);
    };
  }, [fall, shake, open, burst]);

  const chest = useAnimatedStyle(() => {
    const k = fall.get();
    // It lands with a short squash.
    const squash = k >= 1 ? 1 - 0.06 * Math.abs(shake.get()) : 1;
    return {
      transform: [{ translateY: (1 - k) * -360 }, { rotate: `${shake.get() * 7}deg` }, { scaleY: squash }, { scale: 1 + open.get() * 0.18 }],
    };
  });
  const flash = useAnimatedStyle(() => ({ opacity: open.get() * 0.9, transform: [{ scale: 0.6 + open.get() * 1.6 }] }));
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={styles.chestVeil} pointerEvents="auto">
      <View style={styles.chestStage}>
        <Animated.View style={[styles.flash, flash]} pointerEvents="none" />
        {bits.map((b, i) => (
          <CoinBit key={i} burst={burst} dx={b.dx} dy={b.dy} delay={b.delay} />
        ))}
        <Animated.View style={chest}>
          <Icon name={stage === 'open' ? 'treasure-chest-outline' : 'treasure-chest'} size={120} color={colors.coin} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function CoinBit({ burst, dx, dy, delay }: { burst: { get: () => number }; dx: number; dy: number; delay: number }) {
  const style = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (burst.get() * 900 - delay) / 900));
    // Up and out, then down with gravity.
    return { opacity: k <= 0 || k >= 1 ? 0 : 1 - k * k, transform: [{ translateX: dx * k }, { translateY: dy * k + 260 * k * k }, { scale: 0.6 + 0.5 * (1 - k) }] };
  });
  return (
    <Animated.View style={[styles.bit, style]} pointerEvents="none">
      <CoinIcon size={22} />
    </Animated.View>
  );
}

/**
 * The text of the first swipe and the explanations of a new mechanic: a dark, slightly transparent bubble with white text, in the
 * free band above or under the board (see render/bubbleSlot), never over the walls or the ball.
 */
export function TutorialBubble({ text, top, onPress }: { text: string; top: number; onPress?: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.tutorial, { top }]} pointerEvents={onPress ? 'box-none' : 'none'}>
      <View style={styles.tutorialBubble} onTouchEnd={onPress}>
        <Text style={styles.tutorialText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  result: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  starRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, height: 62 },
  star: { color: colors.gold, fontSize: 54, lineHeight: 62, textShadowColor: 'rgba(0, 0, 0, 0.55)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 3 } },
  scoreBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10 },
  scoreText: { color: colors.text, fontFamily: fonts.display, fontSize: fontSizes.xxl, lineHeight: 46, minWidth: 90, textAlign: 'center', padding: 0, textShadowColor: 'rgba(0, 0, 0, 0.55)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  scoreUnit: { color: colors.textSoft, fontSize: fontSizes.sm, fontWeight: '800', marginBottom: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  perfect: { backgroundColor: colors.green },
  detail: { maxWidth: 320, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: 'rgba(18, 12, 34, 0.92)', gap: 2 },
  detailText: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.gold },
  badgeText: { color: colors.ink, fontSize: fontSizes.xs, fontWeight: '800' },
  gain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(18, 12, 34, 0.7)' },
  gainText: { color: colors.text, fontSize: fontSizes.xl },

  progress: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  picture: { width: 56, height: 56, borderRadius: 8 },
  progressBody: { flex: 1, gap: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  worldName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  worldText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800' },
  count: { color: colors.textSoft, fontSize: fontSizes.sm, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.gold },
  sub: { color: colors.textSoft, fontSize: fontSizes.xs },

  chestVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  chestStage: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  flash: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff3b0' },
  bit: { position: 'absolute' },

  tutorial: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tutorialBubble: { maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: 'rgba(18, 12, 34, 0.82)' },
  tutorialText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
});
