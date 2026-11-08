import { t } from '@/core/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';

import { RewardBurst } from '@/core/components/RewardBurst';
import { useFeatures } from '@/core/config/features';
import { finishTour, TOUR_GIFT_COINS } from '@/core/tour';
import { isVip } from '@/core/vip';
import { itemsOfKind } from '@/core/shopItems';
import { playSfx } from '@/core/services/audio';
import { impact, Haptics } from '@/core/services/haptics';
import { updateProfile, getProfile } from '@/core/storage/profile';
import { ARROW, placeBubble, type Side } from '@/core/tour/placement';
import { tourSteps, TOUR_SCREENS, type TourBubble } from '@/core/tour/steps';
import { hasTarget, measureTarget, pressTarget, revealTarget, runTourAction, waitForTarget, type Rect } from '@/core/tour/targets';
import { releaseHud, revealHud } from '@/core/tour/hudStore';
import { endTour, useTourRunning } from '@/core/tour/tourStore';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { Icon, type IconName } from '@/core/ui/Icon';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes, MARGIN } from '@/core/ui/theme';

const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

const VEIL = 0.7;
const PAD = 6;
const GLIDE_MS = 300;
const BUBBLE_MAX_W = 340;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The rectangle to light up around an element: a little air around it, kept on the screen. */
function spotOf(r: Rect, screen: { width: number; height: number }): Rect {
  const x = Math.max(4, r.x - PAD);
  const y = Math.max(4, r.y - PAD);
  const right = Math.min(screen.width - 4, r.x + r.width + PAD);
  const bottom = Math.min(screen.height - 4, r.y + r.height + PAD);
  return { x, y, width: Math.max(8, right - x), height: Math.max(8, bottom - y) };
}
const radiusOf = (r: Rect) => Math.min(22, Math.min(r.width, r.height) / 2);

const ARROW_ICON: Record<Side, IconName> = { below: 'arrow-up-bold', above: 'arrow-down-bold', right: 'arrow-left-bold', left: 'arrow-right-bold' };

/** Rendered at the root of the app: nothing until a tour is running. */
export function GuidedTourHost() {
  const running = useTourRunning();
  return running ? <GuidedTour /> : null;
}

type Shown = { step: TourBubble; index: number; rect: Rect };

/**
 * The guided tour: the whole screen goes dark except a rounded hole around the element being presented, with a glowing border,
 * an arrow and a bubble that says what it is for. For the elements that open a screen, a hand goes to the button, presses it
 * and the screen really opens; the tour presents one or two elements there, then the hand presses the cross.
 *
 * There is no "skip" button: it would only be in the way (the tour can be put off when it is offered). It sits above everything and
 * swallows every touch, so nothing real happens during the tour: no purchase, no coin spent, no
 * life lost, no ad, no hint. The only thing it does is navigate (open a panel, close it).
 */
export function GuidedTour() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const features = useFeatures();

  const [shown, setShown] = useState<Shown | null>(null);
  const [total, setTotal] = useState(0);
  const [final, setFinal] = useState<{ gift: number; coins: Rect | null } | null>(null);
  const [handOn, setHandOn] = useState(false);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });

  // The hole of the veil: it glides from one element to the next.
  const hx = useSharedValue(screen.width / 2);
  const hy = useSharedValue(screen.height / 2);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  const hr = useSharedValue(0);
  const glow = useSharedValue(0);
  // The hand.
  const px = useSharedValue(screen.width / 2);
  const py = useSharedValue(screen.height / 2);
  const tap = useSharedValue(0);
  // The arrow bobs towards the element.
  const bob = useSharedValue(0);

  const nextRef = useRef<(() => void) | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);
  const openScreen = useRef<keyof typeof TOUR_SCREENS | null>(null);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  });

  useEffect(() => {
    glow.set(withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1));
    bob.set(withRepeat(withSequence(withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) })), -1));
  }, [glow, bob]);

  const glideTo = useCallback(
    (r: Rect | null) => {
      const t = { duration: GLIDE_MS, easing: Easing.inOut(Easing.cubic) };
      if (!r) {
        hw.set(withTiming(0, t));
        hh.set(withTiming(0, t));
        return;
      }
      const s = spotOf(r, screenRef.current);
      // The first time the hole opens where the element is, so it grows from its centre instead of sliding from nowhere.
      if (hw.get() === 0) {
        hx.set(s.x + s.width / 2);
        hy.set(s.y + s.height / 2);
      }
      hx.set(withTiming(s.x, t));
      hy.set(withTiming(s.y, t));
      hw.set(withTiming(s.width, t));
      hh.set(withTiming(s.height, t));
      hr.set(withTiming(radiusOf(s), t));
    },
    [hx, hy, hw, hh, hr],
  );

  /** The hand goes to an element and presses it. */
  const handPress = useCallback(
    async (targetId: string, rect: Rect) => {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      glideTo(rect);
      px.set(cx + 70);
      py.set(cy + 130);
      setHandOn(true);
      await sleep(80);
      px.set(withTiming(cx, { duration: 650, easing: Easing.inOut(Easing.cubic) }));
      py.set(withTiming(cy, { duration: 650, easing: Easing.inOut(Easing.cubic) }));
      await sleep(760);
      tap.set(withSequence(withTiming(1, { duration: 110 }), withTiming(0, { duration: 160 })));
      // The button sinks, clicks and vibrates (a button that is not a Button3D only gets the click).
      if (!pressTarget(targetId)) {
        impact(Haptics.ImpactFeedbackStyle.Light);
        playSfx('click', 0.7);
      }
      await sleep(260);
      setHandOn(false);
    },
    [glideTo, px, py, tap],
  );

  useEffect(() => {
    cancelled.current = false;
    const counts = { balls: itemsOfKind('ball').length, paints: itemsOfKind('paint').length };
    const waitNext = () => new Promise<void>((res) => (nextRef.current = res));

    const open = async (key: keyof typeof TOUR_SCREENS): Promise<boolean> => {
      const { from, route } = TOUR_SCREENS[key];
      // The button is brought in first (a pop), then the hand goes to it.
      revealHud(from);
      await sleep(380);
      const r = await waitForTarget(from, 1500);
      if (!r || cancelled.current) return false;
      setShown(null);
      await handPress(from, r);
      if (cancelled.current) return false;
      router.push(route as never);
      openScreen.current = key;
      await sleep(450);
      return !cancelled.current;
    };
    const close = async () => {
      if (!openScreen.current) return;
      const r = await waitForTarget('close', 1500);
      setShown(null);
      if (r && !cancelled.current) await handPress('close', r);
      if (cancelled.current) return;
      if (router.canGoBack()) router.back();
      openScreen.current = null;
      await sleep(450);
    };

    const run = async () => {
      await sleep(250);
      // The steps of the level's own header that are not there are left out right away; the ones on other screens when we get there.
      const wanted = tourSteps({ lives: features.lives, moveLimit: features.moveLimit, vip: isVip(getProfile().vip, Date.now()) }, counts);
      const steps: TourBubble[] = [];
      // (Mounted, not measured: an element that has not come in yet is there but still tiny.)
      for (const s of wanted) if (s.screen || hasTarget(s.target)) steps.push(s);
      let count = steps.length;
      setTotal(count);
      let n = 0;
      const failed = new Set<string>();
      for (const s of steps) {
        if (cancelled.current) return;
        if (s.screen && failed.has(s.screen)) {
          count--;
          setTotal(count);
          continue;
        }
        if ((s.screen ?? null) !== openScreen.current) {
          await close();
          if (cancelled.current) return;
          if (s.screen && !(await open(s.screen))) {
            failed.add(s.screen);
            count--;
            setTotal(count);
            continue;
          }
        }
        if (!s.screen) {
          // The element comes in with a pop as it is presented.
          revealHud(s.target);
          if (s.target === 'hint') revealHud('restart');
          await sleep(380);
        }
        // An element further down a list is brought into the spotlight first (the list scrolls by itself).
        if (revealTarget(s.target)) await sleep(280);
        let rect = await waitForTarget(s.target);
        if (cancelled.current) return;
        if (!rect) {
          count--;
          setTotal(count);
          continue;
        }
        // The hand presses it and what it does really happens (the tab of the shop opens): nothing is bought, nothing is played.
        if (s.pressFirst) {
          await handPress(s.target, rect);
          if (cancelled.current) return;
          runTourAction(s.target);
          await sleep(420);
          rect = (await waitForTarget(s.target)) ?? rect;
        }
        n++;
        glideTo(rect);
        setShown({ step: s, index: n, rect });
        await waitNext();
        if (cancelled.current) return;
      }
      await close();
      if (cancelled.current) return;

      // The end: the rest of the header comes in, then the gift (the first time only), whose coins fly to the counter.
      revealHud('menu', 'restart', 'hint');
      setShown(null);
      glideTo(null);
      const coinsRect = await measureTarget('coins');
      const done = finishTour(getProfile());
      if (done.gift > 0) updateProfile(() => done.profile);
      setFinal({ gift: done.gift, coins: coinsRect });
      playSfx(done.gift > 0 ? 'chest' : 'popup_open', 0.8);
      await new Promise<void>((res) => (playRef.current = res));
      releaseHud(false);
      endTour({ completed: true });
    };
    run().catch(() => {
      if (!cancelled.current) endTour({ completed: false });
    });
    return () => {
      cancelled.current = true;
      nextRef.current?.();
      playRef.current?.();
    };
    // The tour runs once per start: the rules it was started under are the ones it keeps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = useCallback(() => {
    playSfx('click', 0.6);
    const fn = nextRef.current;
    nextRef.current = null;
    fn?.();
  }, []);

  const play = useCallback(() => {
    playSfx('click', 0.7);
    playRef.current?.();
  }, []);

  const holeProps = useAnimatedProps(() => ({ x: hx.get(), y: hy.get(), width: hw.get(), height: hh.get(), rx: hr.get(), ry: hr.get() }));
  const borderStyle = useAnimatedStyle(() => ({
    left: hx.get(),
    top: hy.get(),
    width: hw.get(),
    height: hh.get(),
    borderRadius: hr.get(),
    opacity: hw.get() < 2 ? 0 : 0.55 + 0.45 * glow.get(),
    transform: [{ scale: 1 + 0.025 * glow.get() }],
  }));
  const handStyle = useAnimatedStyle(() => ({ transform: [{ translateX: px.get() - 18 }, { translateY: py.get() - 6 }, { scale: 1 - 0.22 * tap.get() }] }));

  const placement = useMemo(() => {
    if (!shown || bubbleSize.width === 0) return null;
    return placeBubble(shown.rect, bubbleSize, screen, { top: insets.top, bottom: insets.bottom }, 16, shown.step.side);
  }, [shown, bubbleSize, screen, insets.top, insets.bottom]);
  const arrowStyle = useAnimatedStyle(() => {
    const d = (bob.get() - 0.5) * 8;
    const side = placement?.side;
    return { transform: side === 'below' ? [{ translateY: -d }] : side === 'above' ? [{ translateY: d }] : side === 'right' ? [{ translateX: -d }] : [{ translateX: d }] };
  });

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.root}>
      {/* The dark veil, with a rounded hole. */}
      <Svg width={screen.width} height={screen.height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="hole" x="0" y="0" width={screen.width} height={screen.height} maskUnits="userSpaceOnUse">
            <SvgRect x={0} y={0} width={screen.width} height={screen.height} fill="white" />
            <AnimatedRect animatedProps={holeProps} fill="black" />
          </Mask>
        </Defs>
        <SvgRect x={0} y={0} width={screen.width} height={screen.height} fill="black" fillOpacity={VEIL} mask="url(#hole)" />
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.border, borderStyle]} />

      {/* Every touch is for the tour: a tap goes to the next step, and nothing under the veil can be reached. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={final ? undefined : next} accessibilityLabel={t('tour.next')} />

      {shown && (
        <>
          <Animated.View
            key={`b${shown.step.id}`}
            entering={FadeIn.duration(220)}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setBubbleSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
            }}
            style={[styles.bubble, { maxWidth: Math.min(BUBBLE_MAX_W, screen.width - MARGIN * 2) }, placement ? { left: placement.x, top: placement.y } : styles.hidden]}
          >
            <Text style={styles.bubbleText}>{shown.step.text}</Text>
            <View style={styles.bubbleFoot}>
              <Text style={styles.counter}>
                {shown.index} / {total}
              </Text>
              <Button3D size="sm" variant="primary" label={t('tour.next')} onPress={next} />
            </View>
          </Animated.View>
          {placement && (
            <Animated.View pointerEvents="none" style={[styles.arrow, { left: placement.arrow.x - ARROW / 2, top: placement.arrow.y - ARROW / 2 }, arrowStyle]}>
              <Icon name={ARROW_ICON[placement.side]} size={ARROW} color={colors.gold} />
            </Animated.View>
          )}
        </>
      )}

      {handOn && (
        <Animated.View pointerEvents="none" style={[styles.hand, handStyle]}>
          <Text style={styles.handText}>👆</Text>
        </Animated.View>
      )}

      {final && (
        <>
          <Animated.View entering={FadeIn.duration(220)} style={styles.finalWrap} pointerEvents="box-none">
            <Card3D innerStyle={styles.final}>
              <Text style={styles.finalTitle}>{t('tour.ready')}</Text>
              {final.gift > 0 && <Text style={styles.finalBody}>{t('tour.gift', { count: TOUR_GIFT_COINS })}</Text>}
              <Button3D block variant="primary" label={t('common.play')} onPress={play} />
            </Card3D>
          </Animated.View>
          {final.gift > 0 && final.coins && (
            <RewardBurst total={final.gift} from={{ x: screen.width / 2, y: screen.height / 2 }} to={{ x: final.coins.x + final.coins.width / 2, y: final.coins.y + final.coins.height / 2 }} />
          )}
        </>
      )}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object, zIndex: 1000, elevation: 1000 },
  border: { position: 'absolute', borderWidth: 3, borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  bubble: {
    position: 'absolute',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  hidden: { opacity: 0, left: 0, top: 0 },
  bubbleText: { color: colors.ink, fontSize: fontSizes.md, fontWeight: '700', lineHeight: 21 },
  bubbleFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  counter: { color: '#6b5f86', fontSize: fontSizes.sm, fontWeight: '800' },
  arrow: { position: 'absolute', width: ARROW, height: ARROW, alignItems: 'center', justifyContent: 'center' },
  hand: { position: 'absolute', left: 0, top: 0 },
  handText: { fontSize: fontSizes.huge },
  finalWrap: { ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center', padding: 24 },
  final: { alignItems: 'center', gap: 14, padding: 20, width: 300 },
  finalTitle: { color: colors.text, fontSize: fontSizes.xl, textAlign: 'center' },
  finalBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
});
