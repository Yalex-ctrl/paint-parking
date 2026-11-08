import { itemName } from '@/i18n/names';
import { t, useLanguage } from '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { Overlay, PrimaryButton } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { levelOfId } from '@/game/dailyLevels';
import { dayKeyOf } from '@/game/dates';
import { pictureForLevel, pictureUri } from '@/game/gallery';
import { cachedInfiniteLevel } from '@/game/infinite';
import { LEVEL_COUNT } from '@/game/levels';
import { catchMapCoin, chestLevel, levelAtZ, openChest, padState } from '@/game/mapLayout';
import {
  beginDrag,
  bindLabels,
  bindSigns,
  distanceFromCurrent,
  dragBy,
  GlideDriver,
  endDrag,
  finishHop,
  isHopping,
  loadProgressInto,
  markCoinCaught,
  mirrorProfile,
  pick,
  releaseDrag,
  scheduleHop,
  showCurrent,
} from '@/render/map/mapController';
import { createMapShared, type MapHit, type MapShared } from '@/render/map/mapState';
import { MapScene } from '@/render/map/MapScene';
import { impact, notify } from '@/services/haptics';
import { KEYS } from '@/storage/keys';
import { getProfile, updateProfile, useProfile } from '@/storage/profile';
import { loadProgress, type Progress } from '@/storage/progress';
import { TUTORIAL_TEXT } from '@/storage/tutorials';
import { NoLives } from '@/components/LivesModals';
import { lifeAtStake } from '@/game/lives';
import { moveLimit } from '@/game/scoring';
import { ads } from '@/services/ads';
import { playSfx, playStarNote, setMusicContext, wantMusic } from '@/services/audio';
import { addLifeForAd, canPlay, refillWithCoins } from '@/storage/lives';
import { Button3D } from '@/ui/Button3D';
import { PiggyFullGate } from '@/components/PiggyParts';
import { LivesPill } from '@/ui/LivesPill';
import { PiggyButton } from '@/ui/PiggyBank';
import { StreakFlame } from '@/ui/StreakFlame';
import { markReady } from '@/ui/loadingStore';
import { LinearGradient } from 'expo-linear-gradient';
import { themeForLevel } from '@/game/worlds';
import { streakStatus } from '@/game/daily';
import { markFirstFrame, markNavigation } from '@/render/loadTimer';
import { AHEAD, gameMargins, pruneBefore, warmAhead } from '@/render/prepareCache';
import { loadSettings } from '@/storage/settings';
import { CoinAmount } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { CoinBalance } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fonts, fontSizes } from '@/ui/theme';

const SEEN_KEY = KEYS.mapSeen;
const HOP_DELAY = 0.8; // seconds after the map opens
const STARS_TIME = 0.9; // the stars fall on the finished level first
const HOP_TIME = 1.1;
const now = () => performance.now() / 1000;

type SignValues = { x: SharedValue<number>; y: SharedValue<number>; on: SharedValue<number> };

/** Where a world's name label sits on screen (updated by the scene every frame). */
const SIGN_W = 210;
/** The banner of a world never goes under the column of buttons on the left: it stays right of it. */
const SIGN_LEFT_FREE = 88;
function useSignStyle(s: SignValues, screenW: number) {
  return useAnimatedStyle(() => ({
    opacity: s.on.get(),
    transform: [{ translateX: Math.min(Math.max(s.x.get(), SIGN_W / 2 + SIGN_LEFT_FREE), screenW - SIGN_W / 2 - MARGIN) - SIGN_W / 2 }, { translateY: s.y.get() - 24 }],
  }));
}

let floatCounter = 0;
type LabelSetter = (id: number, x: number, y: number, scale: number, locked: boolean, shown: boolean) => void;
const LABEL_SLOTS = 20;

/** One level number, drawn in the app's font over its pad; the scene moves it every frame. */
function LabelSlot({ slot, registry }: { slot: number; registry: Map<number, LabelSetter> }) {
  const [id, setId] = useState(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const k = useSharedValue(1);
  const on = useSharedValue(0);
  const locked = useSharedValue(0);
  useEffect(() => {
    registry.set(slot, (nextId, nx, ny, scale, isLocked, shown) => {
      x.set(nx);
      y.set(ny);
      k.set(scale);
      on.set(shown ? 1 : 0);
      locked.set(isLocked ? 1 : 0);
      setId((prev) => (prev === nextId ? prev : nextId));
    });
    return () => {
      registry.delete(slot);
    };
  }, [slot, registry, x, y, k, on, locked]);
  const style = useAnimatedStyle(() => ({
    opacity: on.get(),
    color: locked.get() ? colors.textMuted : colors.text,
    transform: [{ translateX: x.get() - 40 }, { translateY: y.get() - 22 }, { scale: k.get() }],
  }));
  return (
    <Animated.Text pointerEvents="none" numberOfLines={1} style={[styles.label, style]}>
      {id || ''}
    </Animated.Text>
  );
}

type Float = { id: number; x: number; y: number; text: string };

/** The map of levels: a long 3D path from level 1 upward; the scene is drawn by <MapScene />, the rest is pop-ups and buttons. */
export default function MapScreen() {
  useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const profile = useProfile();
  const shared = useMemo<MapShared>(() => createMapShared(1), []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [popup, setPopup] = useState<number | null>(null);
  const [noLives, setNoLives] = useState(false);
  // A curtain stays over the map until its scene has drawn.

  const [chest, setChest] = useState<{ k: number; coins: number; picture: number; pieces: number; item: string | null } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [away, setAway] = useState<'up' | 'down' | null>(null);
  const cover = useSharedValue(1);
  // Only one 3D scene may run at a time: the map is torn down while the game (or any screen) is on top of it.
  const focused = useIsFocused();

  // The scene is rebuilt each time the map comes back: the curtain goes down again when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      markNavigation('map');
    }, []),
  );

  const currentLevel = progress?.current ?? 1;
  const fogColor = useMemo(() => themeForLevel(currentLevel).sky.bottom, [currentLevel]);

  // The ambient music plays on the map too.
  useEffect(() => {
    wantMusic(focused, 'map');
    if (focused) setMusicContext('menu');
    return () => wantMusic(false, 'map');
  }, [focused]);

  // Mirror the profile into the scene.
  useEffect(() => {
    mirrorProfile(shared, profile);
  }, [profile, shared]);

  const glider = useMemo(() => new GlideDriver(), []);
  const glideTo = useCallback((level: number, ms = 650) => glider.to(shared, level, ms), [glider, shared]);

  // Load the progress, put the camera on the current level, and play the "you just finished a level" sequence if there is one.
  useFocusEffect(
    useCallback(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    cover.set(1);
    (async () => {
      const p = await loadProgress();
      if (!alive) return;
      loadProgressInto(shared, p);
      let seen = p.current;
      try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        if (raw) seen = Number(raw);
      } catch {
        // No memory of the last visit: no animation.
      }
      const jump = p.current - seen;
      if (jump >= 1 && jump <= 3) {
        // The ball jumps from the level just finished to the next one: stars fall, the ball hops, the padlock flies off.
        const t0 = now() + HOP_DELAY;
        scheduleHop(shared, seen, p.current, t0, t0 + STARS_TIME, HOP_TIME);
        timers.push(
          setTimeout(() => glideTo(p.current, HOP_TIME * 1000 + 200), (HOP_DELAY + STARS_TIME) * 1000),
          setTimeout(
            () => {
              finishHop(shared, p.current, now());
              notify(Haptics.NotificationFeedbackType.Success);
              playStarNote(2);
            },
            (HOP_DELAY + STARS_TIME + HOP_TIME) * 1000,
          ),
        );
      } else {
        showCurrent(shared, p.current);
      }
      AsyncStorage.setItem(SEEN_KEY, String(p.current)).catch(() => {});
      setProgress(p);
      cover.set(withTiming(0, { duration: 500 }));
    })();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      glider.stop();
    };
    }, [shared, cover, glideTo, glider]),
  );

  // Is the camera far from the current level? Then a button brings it back.
  useEffect(() => {
    const t = setInterval(() => {
      const d = distanceFromCurrent(shared, levelAtZ);
      const far = Math.abs(d) > 6 && !isHopping(shared);
      setAway((prev) => {
        const next = far ? (d > 0 ? 'up' : 'down') : null;
        return prev === next ? prev : next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [shared]);

  // The wooden signs' labels follow the scene.
  const sign0 = { x: useSharedValue(0), y: useSharedValue(0), on: useSharedValue(0) };
  const sign1 = { x: useSharedValue(0), y: useSharedValue(0), on: useSharedValue(0) };
  const [signNames, setSignNames] = useState<[string, string]>(['', '']);
  useEffect(() => {
    const slots = [sign0, sign1];
    bindSigns(shared, (slot, x, y, name) => {
      const s = slots[slot];
      if (!s) return;
      s.x.set(x);
      s.y.set(y);
      s.on.set(name ? 1 : 0);
      if (name) setSignNames((prev) => (prev[slot] === name ? prev : slot === 0 ? [name, prev[1]] : [prev[0], name]));
    });
    return () => bindSigns(shared, undefined);
    // The shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);
  const labelRegistry = useMemo(() => new Map<number, LabelSetter>(), []);
  useEffect(() => {
    bindLabels(shared, (slot, id, lx, ly, scale, isLocked, shown) => labelRegistry.get(slot)?.(id, lx, ly, scale, isLocked, shown));
    return () => bindLabels(shared, undefined);
  }, [shared, labelRegistry]);
  const s0 = useSignStyle(sign0, width);
  const s1 = useSignStyle(sign1, width);

  const addFloat = useCallback((x: number, y: number, text: string) => {
    const id = ++floatCounter;
    setFloats((f) => [...f, { id, x, y, text }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.id !== id)), 1000);
  }, []);

  const handleHit = useCallback(
    (hit: MapHit) => {
      if (hit.kind === 'coin') {
        const caught = catchMapCoin(getProfile(), dayKeyOf(new Date()), hit.value ?? 1);
        markCoinCaught(shared, now());
        if (caught.paid > 0) {
          updateProfile(() => caught.profile);
          addFloat(hit.sx, hit.sy, `+${caught.paid}`);
          impact(Haptics.ImpactFeedbackStyle.Medium);
          playSfx('coin');
        }
      } else if (hit.kind === 'chest') {
        const opened = openChest(getProfile(), hit.id, shared.stars);
        if (!opened) {
          setHint(t('map.chestLocked', { count: MONETIZATION.map.chestEvery }));
          setTimeout(() => setHint(null), 2200);
          return;
        }
        updateProfile(() => opened.profile);
        notify(Haptics.NotificationFeedbackType.Success);
        playSfx('chest');
        setChest({ k: hit.id, coins: opened.coins, picture: pictureForLevel(chestLevel(hit.id)).picture, pieces: 10, item: opened.item });
      } else {
        impact(Haptics.ImpactFeedbackStyle.Light);
        setPopup(hit.id);
        // The level is prepared while the pop-up is read, so "Jouer" finds it ready.
        if (hit.id <= LEVEL_COUNT) {
          pruneBefore(hit.id);
          loadSettings().then((st) => warmAhead(hit.id, AHEAD + 1, { width, height }, gameMargins(insets), st.decor));
        }
      }
    },
    [shared, addFloat, width, height, insets],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(6)
      .onBegin(() => {
        shared.wake?.(); // the map may be resting at a low frame rate: back to full speed at once
        glider.stop();
        beginDrag(shared);
      })
      // Dragging down goes down the map (toward the first levels), dragging up goes up: the other way round from before.
      .onChange((e) => dragBy(shared, -e.changeY))
      .onEnd((e) => endDrag(shared, -e.velocityY))
      .onFinalize(() => releaseDrag(shared));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(260)
      .onEnd((e, ok) => {
        if (!ok) return;
        const hit = pick(shared, e.x, e.y);
        if (hit) handleHit(hit);
      });
    return Gesture.Exclusive(pan, tap);
  }, [shared, handleHit, glider]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));

  const stars = progress?.stars ?? {};
  const popupLevel = popup !== null ? levelOfId(popup) : null;
  const popupState = popup !== null && progress ? padState(popup, progress.current, stars) : 'locked';
  const best = popup !== null ? progress?.moves[popup] : undefined;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>{progress && focused && <MapScene shared={shared} onReady={() => {
                markFirstFrame('map');
                markReady('/map');
              }} />}</View>
      </GestureDetector>

      {/* A light mist at the top: the path fades into the colour of the sky, and the next stretches do not pop in. */}
      <LinearGradient pointerEvents="none" colors={[fogColor, `${fogColor}00`]} style={[styles.fog, { height: insets.top + 150 }]} />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Button3D round size="sm" variant="neutral" icon="chevron-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.topRight}>
          <LivesPill short={width < 410} />
          <CoinBalance />
        </View>
      </View>

      {Array.from({ length: LABEL_SLOTS }, (_, i) => (
        <LabelSlot key={i} slot={i} registry={labelRegistry} />
      ))}

      {/* Signs announcing the worlds. */}
      {[s0, s1].map((style, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.sign, style]}>
          <Text style={styles.signText} numberOfLines={1}>
            {signNames[i]}
          </Text>
        </Animated.View>
      ))}

      <View style={[styles.sideColumn, { top: insets.top + 8 + 56 }]} pointerEvents="box-none">
        <PiggyButton onPress={() => router.push('/piggy')} />
        <StreakFlame streak={profile.winStreak.current} height={46} />
        <Pressable onPress={() => router.push('/daily')} hitSlop={6} accessibilityLabel={t('hud.dailyTitle')} style={styles.dailyButton}>
          <Icon name="calendar-star" size={26} color={colors.gold} />
          {!streakStatus(profile, dayKeyOf(new Date())).doneToday && <View style={styles.dailyDot} />}
        </Pressable>
      </View>

      {away && progress && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.back, { bottom: insets.bottom + 18 }]}>
          <Button3D
            size="md"
            variant="primary"
            icon={away === 'up' ? 'arrow-down' : 'arrow-up'}
            label={t('hud.level', { id: progress.current })}
            onPress={() => glideTo(progress.current)}
          />
        </Animated.View>
      )}

      {hint && (
        <View style={[styles.hint, { bottom: insets.bottom + 90 }]} pointerEvents="none">
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      {floats.map((f) => (
        <FloatingText key={f.id} x={f.x} y={f.y} text={f.text} />
      ))}

      {popupLevel && popup !== null && (
        <Overlay onDismiss={() => setPopup(null)}>
          <Text style={styles.kicker}>{t('map.levelKicker')}</Text>
          <Text style={styles.big}>{popup}</Text>
          {popupState === 'locked' ? (
            <View style={styles.row}>
              <Icon name="lock" size={22} color={colors.textMuted} />
              <Text style={styles.body}>{t('map.finishBefore')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                {[0, 1, 2].map((i) => (
                  <Icon key={i} name="star" size={34} color={i < (stars[popup] ?? 0) ? colors.gold : colors.bgDeep} />
                ))}
              </View>
              <Text style={styles.body}>{best !== undefined ? t('map.record', { count: best }) : t('map.notDone')}</Text>
              {(popup <= LEVEL_COUNT || cachedInfiniteLevel(popup)) && (
                <>
                  <Text style={styles.body}>{t('map.minimum', { count: popupLevel.solution.length })}</Text>
                  <Text style={styles.body}>
                    {moveLimit(popup, popupLevel.solution.length) === null ? t('map.noLimit') : t('map.maximum', { count: moveLimit(popup, popupLevel.solution.length) })}
                  </Text>
                </>
              )}
              {popupLevel.tutorial && popup <= LEVEL_COUNT && <Text style={styles.news}>{TUTORIAL_TEXT[popupLevel.tutorial]}</Text>}
            </>
          )}
          <PrimaryButton
            label={popupState === 'locked' ? t('map.locked') : t('common.play')}
            variant={popupState === 'locked' ? 'neutral' : 'primary'}
            onPress={() => {
              if (popupState === 'locked') return;
              const id = popup;
              // No life, and this level would cost one: the pop-up that explains how to get some.
              if (lifeAtStake(id, false) && !canPlay()) {
                setPopup(null);
                setNoLives(true);
                return;
              }
              setPopup(null);
              router.push({ pathname: '/game', params: { level: String(id) } });
            }}
          />
        </Overlay>
      )}

      <PiggyFullGate />

      {noLives && (
        <NoLives
          onClose={() => setNoLives(false)}
          onAd={() => {
            ads.showRewarded('extra_life').then((ok) => {
              if (ok) addLifeForAd();
              if (ok && canPlay()) setNoLives(false);
            });
          }}
          onRefill={() => {
            if (refillWithCoins()) setNoLives(false);
          }}
          onShop={() => {
            setNoLives(false);
            router.push({ pathname: '/shop', params: { tab: 'offers' } });
          }}
        />
      )}

      {chest && (
        <View style={StyleSheet.absoluteFill}>
          <Overlay onDismiss={() => setChest(null)}>
            <Text style={styles.kicker}>{t('map.chestKicker')}</Text>
            <Text style={styles.big}>{t('map.bravo')}</Text>
            <Image source={{ uri: pictureUri(chest.picture, chest.pieces, 8) }} style={styles.picture} />
            <Text style={styles.body}>{t('map.pictureMore')}</Text>
            <CoinAmount amount={`+${chest.coins}`} size={30} textStyle={{ color: colors.coin }} />
            {chest.item && <Text style={styles.news}>{t('map.newItem', { name: itemName(chest.item) })}</Text>}
            <PrimaryButton label={t('common.great')} onPress={() => setChest(null)} />
          </Overlay>
          <Confetti width={width} height={height} />
        </View>
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, coverStyle]} />
    </View>
  );
}

/** A "+1" that rises from the coin that was caught and fades. */
function FloatingText({ x, y, text }: { x: number; y: number; text: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 900 }));
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.get(), transform: [{ translateY: -60 * t.get() }, { scale: 1 + (1 - t.get()) * 0.3 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.float, { left: x - 40, top: y - 30 }, style]}>
      <CoinAmount amount={text} size={26} textStyle={{ color: colors.coin }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: MARGIN },
  sideColumn: { position: 'absolute', left: MARGIN, gap: 8, alignItems: 'flex-start' },
  fog: { position: 'absolute', top: 0, left: 0, right: 0 },
  dailyButton: { width: 56, height: 46, borderRadius: 23, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  dailyDot: { position: 'absolute', top: 2, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.bg },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sign: { position: 'absolute', top: 0, left: 0, width: SIGN_W, alignItems: 'center', paddingVertical: 6, borderRadius: 18, borderWidth: 3, borderColor: '#c9955a', backgroundColor: colors.cream },
  signText: { color: colors.signInk, fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center' },
  label: { position: 'absolute', top: 0, left: 0, width: 80, textAlign: 'center', fontFamily: fonts.display, fontSize: fontSizes.xl, lineHeight: 44, textShadowColor: colors.shadow, textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  back: { position: 'absolute', alignSelf: 'center' },
  hint: { position: 'absolute', left: MARGIN, right: MARGIN, alignItems: 'center' },
  hintText: { color: colors.text, fontSize: fontSizes.sm, textAlign: 'center', backgroundColor: colors.overlay, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, overflow: 'hidden' },
  float: { position: 'absolute', width: 80, alignItems: 'center' },
  kicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 2 },
  big: { color: colors.text, fontSize: fontSizes.huge, fontWeight: '700', lineHeight: 58 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { color: colors.textSoft, fontSize: fontSizes.sm, textAlign: 'center' },
  news: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '600', textAlign: 'center' },
  picture: { width: 160, height: 160, borderRadius: 12 },
});
