/* eslint-disable react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization -- the screen is imperative: the scene and the rules are mutated, the callbacks read refs. */
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from '@/core/components/AdBanner';
import { Confetti } from '@/core/components/Confetti';
import { HudPop } from '@/core/components/HudPop';
import { LevelHud } from '@/core/components/LevelHud';
import { Attention, ResultStars, TutorialBubble } from '@/core/components/LevelResult';
import { ConfirmLife, OutOfMoves } from '@/core/components/LivesModals';
import { HintChoice, Overlay, PrimaryButton, StarterPackOffer, WorldUnlock, markStarterOffered } from '@/core/components/Modals';
import { TrialEndCard } from '@/core/components/TrialCards';
import { OutlineText } from '@/core/ui/OutlineText';
import { StepEnd, MovesText } from './parts';
import { chestCoins, endsStep, stepOf } from '@/core/steps';
import { pictureForLevel, piecesEarned } from '@/core/gallery';
import { autoOffer, noteAutoOffer, type PaywallSource } from '@/core/vip';
import { postponeTour, shouldOfferTour } from '@/core/tour';
import { holdHud, releaseHud } from '@/core/tour/hudStore';
import { Target } from '@/core/tour/targets';
import { isTourRunning, onTourEnd, startTour, useTourRunning } from '@/core/tour/tourStore';
import { notificationPermissionAsked, shouldAskNotificationPermission } from '@/core/notificationPlan';
import { requestNotificationPermission, syncNotifications } from '@/core/services/notifications';
import { playContext } from '@/core/services/playClock';
import type { ShopItem } from '@/core/shopItems';
import { isDailyLevelId, isNewWorldStart } from '@/core/worlds';
import { itemName } from '@/core/i18n/names';
import { HeartPop, NoLivesCard } from '@/core/components/NoLivesCard';
import { PauseMenu, type PauseAction, type PauseToggle } from '@/core/components/PauseMenu';
import { SaveStreak } from '@/core/components/StreakModals';
import { adsBannerHeight } from '@/core/config/app';
import { livesOn, moveLimitOn } from '@/core/config/features';
import { MONETIZATION } from '@/core/config/monetization';
import { testerTools } from '@/core/config/tester';
import { dayKeyOf } from '@/core/dates';
import { settleDaily, settleVictory, type DailyVictory } from '@/core/victory';
import { earnCoins, earnPlayed, payHint, shouldOfferStarter, spendCoins } from '@/core/economy';
import { formatNumber, t, useLanguage } from '@/core/i18n';
import { failureCostsStreak, lifeCosts } from '@/core/lives';
import { scoreLines } from '@/core/points';
import { Chrono } from '@/core/chrono';
import { dailyLoadout } from '@/core/dailyLoadout';
import { LoadoutOffer } from '@/core/components/LoadoutOffer';
import { perf, useFps, useQuality, useWorst } from '@/core/render/perf';
import { slowest } from '@/core/render/profiler';
import { particlePalette } from '@/core/render/paintPalette';
import { ParkingCanvas, createPickBridge } from '@/render/ParkingCanvas';
import { ParkingScene, type SceneEvent } from '@/render/ParkingScene';
import { bubbleSlot } from '@/render/bubbleSlot';
import { lotBandPx } from '@/render/cameraFit';
import { RewardBurst } from '@/core/components/RewardBurst';
import { resultTimings } from '@/core/render/resultTimings';
import { SCENE_BG } from '@/render/sceneBg';
import { ads } from '@/core/services/ads';
import { track } from '@/core/services/analytics';
import { initAudio, playSfx, playStarNote, setAudioSettings, setMusicContext, wantMusic } from '@/core/services/audio';
import { Haptics, impact, notify, setHapticsEnabled } from '@/core/services/haptics';
import { runWhenIdle } from '@/core/services/idleQueue';
import { notePlaySwipe } from '@/core/services/playTime';
import { spendLife, useLivesView } from '@/core/storage/lives';
import { getProfile, loadProfile, updateProfile, useProfile } from '@/core/storage/profile';
import { completeLevelNow, loadProgress, peekProgress, type RecomputeStars } from '@/core/storage/progress';
import { loadSettings, saveSettings, type Settings } from '@/core/storage/settings';
import { TUTORIAL_TEXT, loadSeenTutorials, markTutorialSeen } from '@/core/storage/tutorials';
import { Button3D } from '@/core/ui/Button3D';
import { CoinIcon } from '@/core/ui/CoinIcon';
import { markReady } from '@/core/ui/loadingStore';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';
import { protectionOffered, resetStreak, saveWithAd, saveWithCoins } from '@/core/streak';
import { applyTap, compile, createState, type GameState } from '@/game/engine';
import { nextStage } from '@/render/stage';
import { dailyLevelForDay, DAILY_LEVELS, levelOfId } from '@/game/dailyLevels';
import { GUIDE_IDLE_MS, guideMode, hintAvailable, nextHint, type Hint } from '@/game/guide';
import { activeLimit, recomputeStars, starsFor } from '@/game/scoring';
import { optimalOf } from '@/game/levels';
import { tutorialFor } from '@/game/mechanics';
import type { Level, Tutorial } from '@/game/types';

/** The header takes three rows (see components/LevelHud.tsx), then the bar of the stars. */
const HEADER_H = 8 + 45 + 8 + 44 + 8 + 30;
const STARS_H = 24;
const BUTTONS_H = 80 + adsBannerHeight;
/** How long the result stays before the next level comes (the player can go on sooner). */
const RESULT_MS = 3200;

const recompute: RecomputeStars = (stars, moves) => recomputeStars(stars, moves, optimalOf);

type Run = { level: Level; board: ReturnType<typeof compile>; scene: ParkingScene; state: GameState };

function makeRun(level: Level): Run {
  const board = compile(level);
  return { level, board, scene: new ParkingScene(level), state: createState(board) };
}

type Popup =
  | { kind: 'hint' }
  | { kind: 'confirmRestart' }
  | { kind: 'outOfMoves' }
  | { kind: 'saveStreak'; value: number }
  | { kind: 'world'; levelId: number }
  | { kind: 'reward'; item: ShopItem }
  | { kind: 'starter' }
  | { kind: 'tourIntro' }
  | { kind: 'trialEnd'; itemId: string }
  | { kind: 'step'; step: number; coins: number; progress: { levelId: number; picture: number; pieces: number } | null };

type End = {
  key: number;
  levelId: number;
  picture: number;
  piecesAfter: number;
  stars: 1 | 2 | 3;
  next: number;
  newRecord: boolean;
  total: number;
  showGain: boolean;
  newBestScore: boolean;
  score: ReturnType<typeof settleVictory>['score'];
  moves: number;
  optimum: number;
  seconds: number;
};

/** The hand that shows which vehicle to tap: it comes down on the vehicle again and again. It never takes a touch. */
function GuideHand({ x, y }: { x: number; y: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withRepeat(withSequence(withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) })), -1));
    return () => cancelAnimation(k);
  }, [k, x, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: 14 * k.get() }, { scale: 1 - 0.14 * k.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.hand, { left: x - 22, top: y - 4 }, style]}>
      <Text style={styles.handText}>👆</Text>
    </Animated.View>
  );
}

/** Developers only: the frame rate of the scene, and the quality step the phone has been brought down to. */
function FpsCounter({ top }: { top: number }) {
  const fps = useFps();
  const quality = useQuality();
  const worst = useWorst();
  return (
    <View pointerEvents="none" style={[styles.fps, { top }]}>
      <Text style={styles.fpsText}>
        {fps} fps · Q{quality} · max {worst} ms · {perf.calls} calls
      </Text>
      <Text style={styles.fpsText}>{slowest() || 'no slow event'}</Text>
    </View>
  );
}

export default function GameScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ level?: string; daily?: string; challenge?: string; reset?: string }>();
  const profile = useProfile();
  const lives = useLivesView();

  const [levelId, setLevelId] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [doneStars, setDoneStars] = useState<Record<number, number>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [moves, setMoves] = useState(0);
  const [extraMoves, setExtraMoves] = useState(0);
  const popupRef = useRef<Popup | null>(null);
  const [popup, setPopupState] = useState<Popup | null>(null);
  const setPopup = useCallback((p: Popup | null) => {
    popupRef.current = p;
    setPopupState(p);
  }, []);
  const endRef = useRef<End | null>(null);
  const [end, setEndState] = useState<End | null>(null);
  const setEnd = useCallback((e: End | null) => {
    endRef.current = e;
    setEndState(e);
  }, []);
  const [confetti, setConfetti] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guide, setGuide] = useState<Hint | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState<Tutorial | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [heartKey, setHeartKey] = useState(0);
  const [dailyResult, setDailyResult] = useState<DailyVictory | null>(null);

  const daily = params.daily === '1';
  const [today] = useState(() => dayKeyOf(new Date()));
  // In the daily challenge the vehicle and the paint of the day are imposed (the same for everybody).
  const loadout = useMemo(() => (daily ? dailyLoadout(today) : null), [daily, today]);
  const [loadoutLater, setLoadoutLater] = useState(false);

  // The level being played.
  const level: Level | null = useMemo(() => {
    if (daily) return params.challenge ? DAILY_LEVELS[(Number(params.challenge) - 1) % DAILY_LEVELS.length] : dailyLevelForDay(dayKeyOf(new Date()));
    return levelId === null ? null : levelOfId(levelId);
  }, [daily, params.challenge, levelId]);

  // The next level, prepared while the player is playing the current one: it waits below on the road.
  const preparedRef = useRef<Run | null>(null);
  const [nextRun, setNextRun] = useState<Run | null>(null);
  const [transition, setTransition] = useState(0);
  const [moving, setMoving] = useState(false);

  // A new level or a restart: the rules, the scene and the moves start again (or the prepared level takes over).
  const run = useMemo(() => {
    if (!level) return null;
    const ready = preparedRef.current;
    if (ready && ready.level === level) {
      preparedRef.current = null;
      return ready;
    }
    return makeRun(level);
    // A restart (runKey) builds the rules and the scene again for the same level.
  }, [level, runKey]);

  const levelRef = useRef<Level | null>(null);
  levelRef.current = level;
  const bridge = useMemo(() => createPickBridge(), []);
  const margins = useMemo(() => ({ top: insets.top + HEADER_H + STARS_H, bottom: insets.bottom + BUTTONS_H }), [insets.top, insets.bottom]);

  const chrono = useRef(new Chrono());
  const hintUsed = useRef(false);
  const finished = useRef(false);
  const lastActivity = useRef(0);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout>[]>([]);
  const afterLoss = useRef<(() => void) | null>(null);
  const adMovesUsed = useRef(false);
  const pendingTour = useRef(false);
  const pendingPaywall = useRef<PaywallSource | null>(null);
  const pendingReward = useRef<ShopItem | null>(null);
  const trialEnded = useRef<string | null>(null);
  const [trialEndId, setTrialEndId] = useState<string | null>(null);
  const tourRunning = useTourRunning();
  // Developers only: where the last touch landed and what was found there (a dot and a line of text over the scene).
  // Where the scene view is on the screen (measured when it is laid out): the touches are given in points of the screen.
  const viewOrigin = useRef({ x: 0, y: 0 });
  const sceneView = useRef<ComponentRef<typeof View>>(null);
  const measureScene = useCallback(() => {
    sceneView.current?.measureInWindow((x, y) => {
      viewOrigin.current.x = x;
      viewOrigin.current.y = y;
    });
  }, []);
  const [touchDebug, setTouchDebug] = useState<{ x: number; y: number; text: string } | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    pending.current.push(id);
  }, []);

  /* --------------------------------------------------------------------------- start up */

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadProfile();
      const [s, p] = await Promise.all([loadSettings(), loadProgress(recompute)]);
      if (!alive) return;
      setSettings(s);
      setAudioSettings(s);
      setHapticsEnabled(s.vibrations);
      initAudio();
      setDoneStars({ ...p.stars });
      const wanted = params.level ? Number(params.level) : p.current;
      setLevelId(Number.isFinite(wanted) && wanted >= 1 ? wanted : p.current);
    })();
    return () => {
      alive = false;
    };
  }, [params.level, params.reset]);

  useEffect(() => {
    wantMusic(focused, 'game');
    if (focused) setMusicContext('game');
    return () => wantMusic(false, 'game');
  }, [focused]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) {
        setMenuOpen(false);
        return true;
      }
      if (popup && popup.kind !== 'outOfMoves') {
        setPopup(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [menuOpen, popup]);

  useEffect(
    () => () => {
      pending.current.forEach(clearTimeout);
      if (guideTimer.current) clearTimeout(guideTimer.current);
    },
    [],
  );

  /* --------------------------------------------------------------------------- one level */

  const limit = level && moveLimitOn() ? activeLimit(level.id, level.optimal, isDailyLevelId(level.id)) : null;
  const shownLimit = limit === null ? null : limit + extraMoves;
  const atStake = !!level && lifeCosts(level.id, isDailyLevelId(level.id));
  const minimal = !!level && !daily && level.id <= 5 && !((doneStars[5] ?? 0) > 0);

  // The scene tells the screen when to make a sound.
  useEffect(() => {
    if (!run) return;
    const sounds: Record<SceneEvent, () => void> = {
      exit: () => {
        playSfx('engine_start', 0.6);
        setTimeout(() => playSfx('vroom', 0.7), 160);
      },
      bump: () => {
        playSfx('impact_soft');
        impact(Haptics.ImpactFeedbackStyle.Medium);
      },
      horn: () => {
        playSfx('horn');
        setTimeout(() => playSfx('pouet', 0.8), 240);
      },
      gateOpen: () => {
        playSfx('barrier');
        notify(Haptics.NotificationFeedbackType.Success);
      },
    };
    run.scene.onEvent = (e) => sounds[e]();
    // The vehicle with the crown leaves a trail of the equipped paint.
    const palette = particlePalette(loadout ? loadout.paint.id : profile.equipped.paint, 0xff5468);
    run.scene.setTrailColor(run.scene.player, `#${palette[0].toString(16).padStart(6, '0')}`);
  }, [run]);

  // Everything starts again with a new level or a restart.
  useEffect(() => {
    if (!run) return;
    finished.current = false;
    hintUsed.current = false;
    adMovesUsed.current = false;
    chrono.current = new Chrono();
    setMoves(0);
    setExtraMoves(0);
    setEnd(null);
    setGuide(null);
    setDailyResult(null);
    lastActivity.current = Date.now();
    refreshGuide();
    let alive = true;
    const tuto = tutorialFor(run.level.id);
    if (tuto && !isDailyLevelId(run.level.id)) {
      loadSeenTutorials().then((seen) => alive && setTutorialOpen(seen.includes(tuto) ? null : tuto));
    } else setTutorialOpen(null);
    return () => {
      alive = false;
    };
  }, [run]);

  // A couple of seconds into a level, when nothing else is happening, the next one is made and mounted below.
  useEffect(() => {
    setNextRun(null);
    if (!run || daily) return;
    const id = setTimeout(() => {
      const upcoming = levelOfId(run.level.id + 1);
      const made = makeRun(upcoming);
      preparedRef.current = made;
      setNextRun(made);
    }, 2500);
    return () => clearTimeout(id);
  }, [run, daily]);

  const showHintFor = useCallback(
    (ms: number | null) => {
      if (!run || finished.current) return;
      const h = nextHint(run.board, run.state);
      run.scene.hint = h;
      setGuide(h);
      if (ms !== null) {
        later(() => {
          if (run.scene.hint === h) {
            run.scene.hint = null;
            setGuide((g) => (g === h ? null : g));
          }
        }, ms);
      }
    },
    [run, later],
  );

  /** Level 1: the hand shows every move; levels 2-5: after a few seconds of doing nothing. */
  const refreshGuide = useCallback(() => {
    if (guideTimer.current) clearTimeout(guideTimer.current);
    guideTimer.current = null;
    const lv = levelRef.current;
    if (!lv || daily || finished.current) return;
    const mode = guideMode(lv.id);
    if (mode === 'off') return;
    if (mode === 'always') guideTimer.current = setTimeout(() => showHintFor(null), 350);
    else guideTimer.current = setTimeout(() => showHintFor(null), GUIDE_IDLE_MS);
  }, [daily, showHintFor]);

  const dismissTutorial = useCallback(() => {
    setTutorialOpen((m) => {
      if (m) markTutorialSeen(m);
      return null;
    });
  }, []);

  /* --------------------------------------------------------------------------- the end of a level */

  const win = useCallback(async () => {
    if (!run || finished.current === true) return;
    finished.current = true;
    const { level: lvl, state } = run;
    const seconds = chrono.current.seconds(Date.now());
    const earned = starsFor(state.moves, lvl.optimal);
    const isDaily = isDailyLevelId(lvl.id);
    setConfetti((n) => n + 1);
    later(() => setConfetti(0), 2600);
    playSfx('win');
    notify(Haptics.NotificationFeedbackType.Success);
    if (isDaily) {
      const won = settleDaily(getProfile(), { day: dayKeyOf(new Date()), moves: state.moves, optimum: lvl.optimal, seconds, hintUsed: hintUsed.current });
      updateProfile(() => won.profile);
      setDailyResult(won);
      return;
    }
    const before = peekProgress() ?? (await loadProgress(recompute));
    const previousBest = before.moves[lvl.id];
    const previousStars = (before.stars[lvl.id] ?? 0) as 0 | 1 | 2 | 3;
    const wasMinimal = lvl.id <= 5 && !((before.stars[5] ?? 0) > 0);
    // Level 5 won for the first time: the header stays as it is until the tour has brought the rest in.
    if (lvl.id === 5 && wasMinimal && shouldOfferTour(getProfile(), 5, false)) holdHud();
    const { picture } = pictureForLevel(lvl.id);
    const after = completeLevelNow(lvl.id, earned, state.moves);
    setDoneStars({ ...after.stars });
    const won = settleVictory(getProfile(), { levelId: lvl.id, stars: earned, previousStars, picked: 0, moves: state.moves, optimum: lvl.optimal, seconds, hintUsed: hintUsed.current });
    updateProfile(() => won.profile);
    if (won.trialEnded) trialEnded.current = won.trialEnded;
    if (won.reward) pendingReward.current = won.reward;
    runWhenIdle(() => track('level_complete', { level: lvl.id, moves: state.moves, stars: earned, duration: seconds }));
    setEnd({
      key: Date.now(),
      levelId: lvl.id,
      picture,
      piecesAfter: piecesEarned(after.stars, picture),
      stars: earned,
      next: after.current,
      newRecord: previousBest !== undefined && state.moves < previousBest,
      total: won.total,
      showGain: !wasMinimal,
      newBestScore: won.newBestScore && !wasMinimal,
      score: won.score,
      moves: state.moves,
      optimum: lvl.optimal,
      seconds,
    });
  }, [run, later]);

  const finishNext = useCallback(() => {
    const e = endRef.current;
    if (!e) return;
    setEnd(null);
    setLevelId(e.next);
    setRunKey((k) => k + 1);
    if (trialEnded.current) {
      setTrialEndId(trialEnded.current);
      trialEnded.current = null;
    }
    // After level 5 (and again after level 6 if the player said "later"): the offer of the guided tour.
    const offerTour = shouldOfferTour(getProfile(), e.levelId, false);
    // The last level of a step: the chest. (The first step, levels 1 to 5, has no chest: the tour comes instead.)
    if (endsStep(e.levelId) && stepOf(e.levelId) >= 1) {
      const chest = earnPlayed(getProfile(), chestCoins(stepOf(e.levelId)));
      updateProfile(() => chest.profile);
      playSfx('chest');
      pendingTour.current = offerTour;
      const ctx = playContext();
      pendingPaywall.current = autoOffer(
        getProfile(),
        { completedLevel: e.levelId, endsStep: true, inTour: isTourRunning(), inTutorial: false, sinceAdSec: ctx.lastAdAt === null ? null : ctx.playSeconds - ctx.lastAdAt },
        Date.now(),
      );
      setPopup({ kind: 'step', step: stepOf(e.levelId) + 1, coins: chest.gained, progress: { levelId: e.levelId, picture: e.picture, pieces: e.piecesAfter } });
      return;
    }
    if (offerTour) {
      setPopup({ kind: 'tourIntro' });
      return;
    }
    // At most one pop-up per level: a reward, else a new world; the notification permission is asked once the player has played a little.
    if (pendingReward.current) {
      setPopup({ kind: 'reward', item: pendingReward.current });
      pendingReward.current = null;
    } else if (isNewWorldStart(e.next)) {
      setPopup({ kind: 'world', levelId: e.next });
    } else if (shouldAskNotificationPermission(getProfile(), e.levelId)) {
      updateProfile(notificationPermissionAsked);
      requestNotificationPermission().then(() => syncNotifications(getProfile()));
    }
  }, [setEnd, setPopup]);

  /** The result is over: the camera follows the road to the next lot (or, if it is not ready, the next level simply replaces this one). */
  const goNext = useCallback(() => {
    const e = endRef.current;
    if (!e || moving) return;
    if (nextRun && nextRun.level.id === e.next) {
      setMoving(true);
      setTransition((n) => n + 1);
    } else finishNext();
  }, [moving, nextRun, finishNext]);

  const transitionDone = useCallback(() => {
    setMoving(false);
    finishNext();
  }, [finishNext]);

  /** The chest of a step, doubled for a rewarded ad. */
  const doubleChest = useCallback(() => {
    const p = popupRef.current;
    if (!p || p.kind !== 'step') return;
    ads.showRewarded('double_reward').then((ok) => ok && updateProfile((pr) => earnCoins(pr, p.coins)));
  }, []);

  // The result stays for a moment, then the next level comes by itself.
  useEffect(() => {
    if (!end) return;
    const id = setTimeout(goNext, RESULT_MS);
    return () => clearTimeout(id);
  }, [end, goNext]);

  // The end of the tour: "Jouer" starts the level over (it has not been played yet); skipping just goes back to it.
  useEffect(
    () =>
      onTourEnd((e) => {
        if (!e.completed) return;
        setRunKey((k) => k + 1);
        // Right after the tour: the one-time starter pack (48 hours).
        if (shouldOfferStarter(getProfile())) {
          setTimeout(() => {
            markStarterOffered();
            setPopup({ kind: 'starter' });
          }, 500);
        }
      }),
    [setPopup],
  );

  // The card that ends a trial comes once nothing else is on screen.
  useEffect(() => {
    if (!trialEndId || popup !== null || tourRunning || menuOpen || end !== null) return;
    const id = setTimeout(() => {
      setPopup({ kind: 'trialEnd', itemId: trialEndId });
      setTrialEndId(null);
    }, 700);
    return () => clearTimeout(id);
  }, [trialEndId, popup, tourRunning, menuOpen, end, setPopup]);

  /* --------------------------------------------------------------------------- a gesture */

  const act = useCallback(
    (vehicle: number) => {
      if (!run || finished.current || end || popup || menuOpen || tourRunning || moving) return;
      const { scene, board, state } = run;
      // A vehicle that is still moving ignores a tap; the others stay playable (taps can follow each other very fast).
      if (scene.isBusy(vehicle)) return;
      const result = applyTap(board, state, vehicle);
      scene.play(result);
      if (result.kind === 'ignored') return;
      chrono.current.start(Date.now());
      notePlaySwipe();
      lastActivity.current = Date.now();
      scene.hint = null;
      setGuide(null);
      setMessage(null);
      setMoves(state.moves);
      if (tutorialOpen) dismissTutorial();
      if (result.kind === 'exit') {
        if (state.finished) later(win, 1500);
        else refreshGuide();
      } else {
        refreshGuide();
        if (shownLimit !== null && state.moves >= shownLimit) later(() => !finished.current && setPopup({ kind: 'outOfMoves' }), 1100);
      }
    },
    [run, end, popup, menuOpen, tourRunning, moving, shownLimit, tutorialOpen, dismissTutorial, refreshGuide, win, later],
  );
  const actRef = useRef(act);
  actRef.current = act;
  const runRef = useRef(run);
  runRef.current = run;

  /**
   * The vehicle under a touch. The touch comes from the gesture handler in points of the SCREEN; the canvas is where the scene view is
   * (measured on its layout), so the point is made relative to it, then a ray is cast from the camera of the scene against the box of
   * each vehicle (the finger is on a roof, not on the ground), and failing that the vehicle nearest to the finger on the screen is taken.
   */
  const vehicleAt = useCallback(
    (screenX: number, screenY: number): number => {
      const r = runRef.current;
      const x = screenX - viewOrigin.current.x;
      const y = screenY - viewOrigin.current.y;
      const picked = r ? bridge.pick(x, y, r.scene) : { vehicle: -1, via: 'none' as const, distance: Infinity };
      if (testerTools()) {
        // A dot where the touch landed, the vehicle it selected circled for half a second, and what was found, in words.
        if (r && picked.vehicle >= 0) r.scene.flash(picked.vehicle, 0.5);
        setTouchDebug({ x, y, text: `touch ${Math.round(x)},${Math.round(y)} → ${picked.vehicle >= 0 ? `voiture #${picked.vehicle} (${picked.via === 'ray' ? 'rayon' : 'plus proche'})` : 'aucune'}` });
      }
      return picked.vehicle;
    },
    [bridge],
  );

  // Taps only: no swipe. A tap on a vehicle sends it the one way its arrow shows.
  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(30)
        .maxDuration(700)
        .onEnd((e, success) => {
          if (!success) return;
          const v = vehicleAt(e.absoluteX, e.absoluteY);
          if (v >= 0) actRef.current(v);
        }),
    [vehicleAt],
  );
  /* --------------------------------------------------------------------------- restart, hint, lives */

  const settleLoss = useCallback((keepStreak: boolean) => {
    if (livesOn()) spendLife();
    if (keepStreak) return;
    const r = resetStreak(getProfile());
    if (r.lost > 0) track('streak_lost', { value: r.lost });
    updateProfile(() => r.profile);
  }, []);

  const loseLifeThen = useCallback(
    (then: () => void) => {
      const p = getProfile();
      if (protectionOffered(p)) {
        afterLoss.current = then;
        setPopup({ kind: 'saveStreak', value: p.winStreak.current });
        return;
      }
      settleLoss(false);
      setHeartKey((k) => k + 1);
      then();
    },
    [settleLoss],
  );

  const finishLoss = useCallback(
    (keep: boolean) => {
      settleLoss(keep);
      setHeartKey((k) => k + 1);
      setPopup(null);
      const then = afterLoss.current;
      afterLoss.current = null;
      then?.();
    },
    [settleLoss],
  );

  const restartNow = useCallback(() => setRunKey((k) => k + 1), []);

  const restart = useCallback(() => {
    if (finished.current || end) return;
    if ((run?.state.moves ?? 0) > 0 && atStake) {
      setPopup({ kind: 'confirmRestart' });
      return;
    }
    restartNow();
  }, [run, end, atStake, restartNow]);

  const giveUp = useCallback(() => {
    setPopup(null);
    const lv = levelRef.current;
    if (!lv || !failureCostsStreak(lv.id, isDailyLevelId(lv.id))) {
      restartNow();
      return;
    }
    loseLifeThen(restartNow);
  }, [loseLifeThen, restartNow]);

  const askHint = useCallback(() => {
    if (!run || finished.current || end) return;
    setPopup({ kind: 'hint' });
  }, [run, end]);

  const showPaidHint = useCallback(
    (method: 'coins' | 'ad') => {
      if (!run) return;
      hintUsed.current = true;
      track('hint_used', { level: run.level.id, method });
      showHintFor(4000);
    },
    [run, showHintFor],
  );

  const hintWithCoins = useCallback(() => {
    const paid = payHint(getProfile());
    setPopup(null);
    if (!paid) return;
    updateProfile(() => paid);
    showPaidHint('coins');
  }, [showPaidHint]);

  const hintWithAd = useCallback(() => {
    setPopup(null);
    ads.showRewarded(MONETIZATION.hint.adPlacement).then((ok) => ok && showPaidHint('ad'));
  }, [showPaidHint]);

  const moreMovesWithAd = useCallback(() => {
    ads.showRewarded('extra_moves').then((ok) => {
      if (!ok) return;
      adMovesUsed.current = true;
      setExtraMoves((e) => e + MONETIZATION.moves.bonusMoves);
      setPopup(null);
    });
  }, []);

  const moreMovesWithCoins = useCallback(() => {
    const paid = spendCoins(getProfile(), MONETIZATION.moves.bonusMovesCoinCost);
    if (!paid) return;
    updateProfile(() => paid);
    setExtraMoves((e) => e + MONETIZATION.moves.bonusMoves);
    setPopup(null);
  }, []);

  const saveStreakWithAd = useCallback(() => {
    ads.showRewarded('keep_streak').then((ok) => {
      if (!ok) return;
      const next = saveWithAd(getProfile(), dayKeyOf(new Date()));
      if (!next) return;
      updateProfile(() => next);
      playSfx('streak_saved');
      finishLoss(true);
    });
  }, [finishLoss]);

  const saveStreakWithCoins = useCallback(() => {
    const next = saveWithCoins(getProfile());
    if (!next) return;
    updateProfile(() => next);
    playSfx('streak_saved');
    finishLoss(true);
  }, [finishLoss]);

  /* --------------------------------------------------------------------------- pause menu */

  const toggleSetting = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...(s as Settings), ...patch };
      setAudioSettings(next);
      setHapticsEnabled(next.vibrations);
      void saveSettings(next);
      return next;
    });
  }, []);

  const pauseActions: PauseAction[] = [
    { key: 'restart', label: t('lives.restart'), icon: 'restart', onPress: () => { setMenuOpen(false); restart(); } },
    { key: 'settings', label: t('settings.title'), icon: 'cog', onPress: () => { setMenuOpen(false); router.push('/settings'); } },
  ];
  const pauseDev: PauseAction[] = testerTools()
    ? [
        { key: 'tour', label: t('dev.replayTour'), icon: 'help-circle-outline', onPress: () => { setMenuOpen(false); setTimeout(startTour, 350); } },
        { key: 'next', label: 'Niveau +1', icon: 'skip-next', onPress: () => { setMenuOpen(false); setLevelId((id) => (id ?? 1) + 1); setRunKey((k) => k + 1); } },
        { key: 'prev', label: 'Niveau −1', icon: 'skip-previous', onPress: () => { setMenuOpen(false); setLevelId((id) => Math.max(1, (id ?? 2) - 1)); setRunKey((k) => k + 1); } },
        { key: 'win', label: 'Gagner le niveau', icon: 'trophy', onPress: () => { setMenuOpen(false); const r = runRef.current; if (r) r.level.solution.forEach((id, i) => setTimeout(() => actRef.current(id), 350 * i)); } },
      ]
    : [];
  const pauseToggles: PauseToggle[] = settings
    ? [
        { key: 'music', icon: 'music', offIcon: 'music-off', label: t('settings.music'), on: settings.music, onToggle: () => toggleSetting({ music: !settings.music }) },
        { key: 'sound', icon: 'volume-high', offIcon: 'volume-off', label: t('settings.sfx'), on: settings.sound, onToggle: () => toggleSetting({ sound: !settings.sound }) },
        { key: 'vibrations', icon: 'vibrate', offIcon: 'vibrate-off', label: t('settings.vibrations'), on: settings.vibrations, onToggle: () => toggleSetting({ vibrations: !settings.vibrations }) },
      ]
    : [];

  /* --------------------------------------------------------------------------- what is drawn */

  const guideAt = guide && run ? bridge.toScreen(run.scene.actors[guide.vehicle].x, run.scene.actors[guide.vehicle].z, 0.45) : null;
  // The bubbles go in the free band above the lot, or under it, never over it.
  const bubbleTop = level
    ? bubbleSlot(lotBandPx(level, width, height, margins), { top: insets.top + HEADER_H, bottom: height - margins.bottom }, 74)
    : insets.top + HEADER_H + 8;
  const noLife = !!level && atStake && lives.count <= 0 && !lives.infinite && !end;

  const movesNode = (
    <HudPop id="moves" index={9} minimal={minimal}>
      <Target id="moves">
        <MovesText moves={moves} limit={shownLimit} />
      </Target>
    </HudPop>
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View ref={sceneView} onLayout={measureScene} style={styles.scene} collapsable={false}>
          {run && level && (
            <ParkingCanvas
              level={level}
              scene={run.scene}
              next={nextStage(run, nextRun, daily)}
              transition={transition}
              onTransitionDone={transitionDone}
              bridge={bridge}
              margins={margins}
              active={focused}
              decor={settings?.decor ?? true}
              skin={loadout ? loadout.ball.id : profile.equipped.ball}
              onReady={() => markReady('/')}
            />
          )}
        </View>
      </GestureDetector>

      {testerTools() && touchDebug && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" style={[styles.touchDot, { left: touchDebug.x - 7, top: touchDebug.y - 7 }]} />
          <Text pointerEvents="none" style={[styles.touchText, { top: insets.top + 8 + 45 + 6 + 46 }]}>
            {touchDebug.text}
          </Text>
        </View>
      )}
      {testerTools() && settings?.showPerf && <FpsCounter top={insets.top + 8 + 45 + 6} />}

      {confetti > 0 && <Confetti key={confetti} width={width} height={height} count={44} />}

      {level && (
        <>
          <LevelHud
            top={insets.top + 8}
            levelId={daily ? 0 : level.id}
            daily={daily}
            moves={movesNode}
            shownCoins={profile.coins}
            stars={doneStars}
            onMenu={() => setMenuOpen(true)}
            minimal={minimal}
            flameBoost={0}
          />

          {tutorialOpen && !end && !tourRunning && <TutorialBubble text={TUTORIAL_TEXT[tutorialOpen]} top={bubbleTop} onPress={dismissTutorial} />}
          {!tutorialOpen && level.id === 1 && moves === 0 && !daily && <TutorialBubble text={t('game.swipeToMove')} top={bubbleTop} />}
          {message && (
            <View style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}

          {guide && guideAt && !end && !tourRunning && <GuideHand x={guideAt.x} y={guideAt.y} />}

          {!end && <AdBanner bottom={insets.bottom} levelId={level.id} />}

          {!end && (
            <View style={[styles.buttons, { paddingBottom: insets.bottom + 12 + adsBannerHeight }]} pointerEvents="box-none">
              <HudPop id="restart" index={10} minimal={minimal} style={styles.flex}>
                <Attention active={false}>
                  <Button3D block variant="neutral" icon="restart" label={t('lives.restart')} onPress={restart} />
                </Attention>
              </HudPop>
              {hintAvailable(level.id) && (
                <HudPop id="hint" index={11} minimal={minimal} style={styles.flex}>
                  <Button3D block variant="primary" icon="lightbulb-on-outline" label={t('game.hint')} onPress={askHint} tourId="hint">
                    <View style={styles.hintCost}>
                      <Text style={styles.hintCostText}>{MONETIZATION.hint.coinCost}</Text>
                      <CoinIcon size={16} />
                    </View>
                  </Button3D>
                </HudPop>
              )}
            </View>
          )}
        </>
      )}

      {end && (
        <>
          <ResultStars
            key={end.key}
            top={insets.top + HEADER_H + 8}
            stars={end.stars}
            newRecord={end.newRecord}
            newBestScore={end.newBestScore}
            perfect={end.score.perfect}
            score={end.score.total}
            detail={scoreLines(end.score, end.moves, end.optimum, end.seconds)}
            showScore={end.showGain}
            gain={end.showGain ? end.total : 0}
            onStar={(i) => playStarNote(Math.min(2, i) as 0 | 1 | 2)}
          />
          {end.showGain && end.total > 0 && (
            // The gain, a single number under the stars, goes to the counter as coins; nothing else is written over the board.
            <RewardBurst
              key={`burst${end.key}`}
              total={end.total}
              count={Math.min(9, Math.max(3, end.total))}
              showLabel={false}
              delay={resultTimings(end.stars).flyAt}
              from={{ x: width / 2, y: insets.top + HEADER_H + 8 + 62 + 6 + 22 }}
              to={{ x: width - 56, y: insets.top + 8 + 45 + 8 + 22 }}
            />
          )}
          <View style={[styles.next, { bottom: insets.bottom + 24, opacity: moving ? 0 : 1 }]} pointerEvents={moving ? 'none' : 'box-none'}>
            <Button3D variant="primary" label={t('common.continue')} onPress={goNext} />
          </View>
        </>
      )}

      {dailyResult && (
        <Overlay>
          <Text style={styles.popKicker}>{t('daily.kicker')}</Text>
          <Text style={styles.popTitle}>{dailyResult.result.alreadyDone ? t('game.alreadyDone') : t('game.challengeDone')}</Text>
          <Text style={styles.popBody}>{t('daily.streak', { count: dailyResult.result.streak })}</Text>
          <Text style={styles.popBody}>{t('game.scoreLine', { score: formatNumber(dailyResult.score.total) })}</Text>
          {!loadoutLater && <LoadoutOffer day={today} onLater={() => setLoadoutLater(true)} />}
          <PrimaryButton
            label={t('common.continue')}
            onPress={() => {
              router.setParams({ daily: '' });
              setDailyResult(null);
              router.push('/daily');
            }}
          />
        </Overlay>
      )}

      {noLife && <NoLivesCard />}
      <HeartPop trigger={heartKey} />

      {menuOpen && <PauseMenu title={t('settings.title')} lines={level ? [daily ? t('hud.dailyTitle') : t('hud.level', { id: level.id }), shownLimit !== null ? t('game.movesOf', { moves, limit: shownLimit }) : t('game.moves', { count: moves })] : []} actions={pauseActions} toggles={pauseToggles} dev={pauseDev} onClose={() => setMenuOpen(false)} />}

      {popup?.kind === 'hint' && <HintChoice coins={profile.coins} free={profile.freeHints} onCoins={hintWithCoins} onAd={hintWithAd} onCancel={() => setPopup(null)} />}
      {popup?.kind === 'confirmRestart' && (
        <ConfirmLife
          title={t('game.restartQuestion')}
          body={t('game.restartCosts')}
          confirm={t('game.restartConfirm')}
          onConfirm={() => {
            setPopup(null);
            loseLifeThen(restartNow);
          }}
          onCancel={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'outOfMoves' && shownLimit !== null && <OutOfMoves limit={shownLimit} adUsed={adMovesUsed.current} lifeAtStake={atStake} onAd={moreMovesWithAd} onCoins={moreMovesWithCoins} onGiveUp={giveUp} />}
      {popup?.kind === 'saveStreak' && <SaveStreak streak={popup.value} onAd={saveStreakWithAd} onCoins={saveStreakWithCoins} onLose={() => finishLoss(false)} />}
      {popup?.kind === 'world' && <WorldUnlock levelId={popup.levelId} onClose={() => setPopup(null)} />}
      {popup?.kind === 'starter' && <StarterPackOffer onClose={() => setPopup(null)} />}
      {popup?.kind === 'trialEnd' && <TrialEndCard itemId={popup.itemId} onClose={() => setPopup(null)} />}
      {popup?.kind === 'reward' && (
        <Overlay onDismiss={() => setPopup(null)}>
          <Text style={styles.popKicker}>{t('game.worldReward')}</Text>
          <Text style={styles.popTitle}>{itemName(popup.item.id)}</Text>
          <Text style={styles.popBody}>{t(popup.item.kind === 'ball' ? 'game.newBallInShop' : 'game.newPaintInShop')}</Text>
          <PrimaryButton label={t('common.great')} onPress={() => setPopup(null)} />
        </Overlay>
      )}
      {popup?.kind === 'step' && (
        <StepEnd
          step={popup.step}
          coins={popup.coins}
          progress={popup.progress}
          onDouble={doubleChest}
          onClose={() => {
            // The tour offer that was waiting for the chest comes next.
            const offer = pendingTour.current;
            pendingTour.current = false;
            setPopup(offer ? { kind: 'tourIntro' } : null);
            const paywall = pendingPaywall.current;
            pendingPaywall.current = null;
            if (paywall && !offer) {
              updateProfile((p) => noteAutoOffer(p, Date.now()));
              setTimeout(() => router.push({ pathname: '/vip', params: { source: paywall } }), 350);
            }
          }}
        />
      )}
      {popup?.kind === 'tourIntro' && (
        <Overlay>
          <OutlineText style={styles.popTitle} width={2.5}>
            {t('game.basicsDone')}
          </OutlineText>
          <Text style={styles.popBody}>{t('game.tourQuestion')}</Text>
          <PrimaryButton
            label={t('game.letsGo')}
            onPress={() => {
              setPopup(null);
              setTimeout(startTour, 300);
            }}
          />
          <Pressable
            onPress={() => {
              updateProfile(postponeTour);
              setPopup(null);
              // The player put the tour off: the whole header comes in, one pop after the other.
              releaseHud(true);
            }}
            style={styles.laterHit}
            accessibilityRole="button"
          >
            <Text style={styles.later}>{t('common.later')}</Text>
          </Pressable>
        </Overlay>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCENE_BG },
  scene: StyleSheet.absoluteFill,
  flex: { flex: 1 },
  buttons: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  next: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintCost: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hintCostText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800' },
  hand: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  handText: { fontSize: 38 },
  touchDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255, 60, 120, 0.85)', borderWidth: 2, borderColor: '#fff' },
  touchText: { position: 'absolute', left: 12, right: 12, color: '#fff', fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(0, 0, 0, 0.65)', padding: 4, borderRadius: 6, overflow: 'hidden' },
  fps: { position: 'absolute', left: 12, right: 12, padding: 6, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  fpsText: { color: '#9dffb0', fontSize: 11, fontWeight: '700' },
  laterHit: { paddingVertical: 10, paddingHorizontal: 24 },
  later: { color: colors.textSoft, fontSize: fontSizes.md, fontWeight: '700', textDecorationLine: 'underline' },
  toast: { position: 'absolute', top: '45%', left: 24, right: 24, alignItems: 'center' },
  toastText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800', textAlign: 'center', backgroundColor: 'rgba(18, 12, 34, 0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden' },
  popKicker: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
  popTitle: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '800', textAlign: 'center' },
  popBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
});
