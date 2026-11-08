import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from '@/core/components/AdBanner';
import { Confetti } from '@/core/components/Confetti';
import { HudPop } from '@/core/components/HudPop';
import { LevelHud } from '@/core/components/LevelHud';
import { Attention, ResultStars, TutorialBubble } from '@/core/components/LevelResult';
import { ConfirmLife, OutOfMoves } from '@/core/components/LivesModals';
import { HintChoice, Overlay, PrimaryButton } from '@/core/components/Modals';
import { HeartPop, NoLivesCard } from '@/core/components/NoLivesCard';
import { PauseMenu, type PauseAction, type PauseToggle } from '@/core/components/PauseMenu';
import { SaveStreak } from '@/core/components/StreakModals';
import { adsBannerHeight } from '@/core/config/app';
import { livesOn, moveLimitOn } from '@/core/config/features';
import { MONETIZATION } from '@/core/config/monetization';
import { testerTools } from '@/core/config/tester';
import { dayKeyOf } from '@/core/dates';
import { settleDaily, settleVictory, type DailyVictory } from '@/core/victory';
import { payHint, spendCoins } from '@/core/economy';
import { formatNumber, t, useLanguage } from '@/core/i18n';
import { failureCostsStreak, lifeCosts } from '@/core/lives';
import { scoreLines } from '@/core/points';
import { Chrono } from '@/core/chrono';
import { particlePalette } from '@/core/render/paintPalette';
import { ParkingCanvas, createPickBridge } from '@/render/ParkingCanvas';
import { ParkingScene, type SceneEvent } from '@/render/ParkingScene';
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
import { applyGesture, compile, createState, type GameState } from '@/game/engine';
import { dailyLevelForDay, DAILY_LEVELS, levelOfId } from '@/game/dailyLevels';
import { GUIDE_IDLE_MS, guideMode, hintAvailable, nextHint, type Hint } from '@/game/guide';
import { activeLimit, recomputeStars, starsFor } from '@/game/scoring';
import { optimalOf } from '@/game/levels';
import { tutorialFor } from '@/game/mechanics';
import type { Dir, Level, Tutorial } from '@/game/types';
import { isDailyLevelId } from '@/core/worlds';

/** The header takes three rows (see components/LevelHud.tsx), then the bar of the stars. */
const HEADER_H = 8 + 45 + 8 + 44 + 8 + 30;
const STARS_H = 24;
const BUTTONS_H = 80 + adsBannerHeight;
/** Pixels of finger travel before a swipe counts. */
const SWIPE_THRESHOLD = 18;
/** How long the result stays before the next level comes (the player can go on sooner). */
const RESULT_MS = 3200;

const recompute: RecomputeStars = (stars, moves) => recomputeStars(stars, moves, optimalOf);

type Popup = { kind: 'hint' } | { kind: 'confirmRestart' } | { kind: 'outOfMoves' } | { kind: 'saveStreak'; value: number };

type End = {
  key: number;
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

/** The hand that shows which vehicle to swipe and which way: it moves over the vehicle in the direction to go, again and again. */
function GuideHand({ x, y, dir }: { x: number; y: number; dir: Dir }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 250 })), -1));
    return () => cancelAnimation(k);
  }, [k, x, y, dir]);
  const dx = dir === 'R' ? 1 : dir === 'L' ? -1 : 0;
  const dy = dir === 'D' ? 1 : dir === 'U' ? -1 : 0;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx * 46 * k.get() }, { translateY: dy * 46 * k.get() }, { scale: 1 - 0.12 * k.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.hand, { left: x - 22, top: y - 6 }, style]}>
      <Text style={styles.handText}>👆</Text>
    </Animated.View>
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
  const [popup, setPopup] = useState<Popup | null>(null);
  const [end, setEnd] = useState<End | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guide, setGuide] = useState<Hint | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState<Tutorial | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [heartKey, setHeartKey] = useState(0);
  const [dailyResult, setDailyResult] = useState<DailyVictory | null>(null);

  const daily = params.daily === '1';

  // The level being played.
  const level: Level | null = useMemo(() => {
    if (daily) return params.challenge ? DAILY_LEVELS[(Number(params.challenge) - 1) % DAILY_LEVELS.length] : dailyLevelForDay(dayKeyOf(new Date()));
    return levelId === null ? null : levelOfId(levelId);
  }, [daily, params.challenge, levelId]);

  // A new level or a restart: the rules, the scene and the moves start again.
  const run = useMemo(() => {
    if (!level) return null;
    const board = compile(level);
    const scene = new ParkingScene(level);
    const state: GameState = createState(board);
    return { level, board, scene, state };
    // A restart (runKey) builds the rules and the scene again for the same level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, runKey]);

  const levelRef = useRef<Level | null>(null);
  levelRef.current = level;
  const bridge = useMemo(() => createPickBridge(() => levelRef.current as Level), []);
  const margins = useMemo(() => ({ top: insets.top + HEADER_H + STARS_H, bottom: insets.bottom + BUTTONS_H }), [insets.top, insets.bottom]);

  const chrono = useRef(new Chrono());
  const hintUsed = useRef(false);
  const finished = useRef(false);
  const lastActivity = useRef(0);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout>[]>([]);
  const afterLoss = useRef<(() => void) | null>(null);
  const adMovesUsed = useRef(false);
  const touched = useRef(-1);
  const swiped = useRef(false);

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
      exit: () => playSfx('plop', 0.7),
      bump: () => {
        playSfx('impact_soft');
        impact(Haptics.ImpactFeedbackStyle.Medium);
      },
      horn: () => playSfx('clac'),
      shake: () => playSfx('tok', 0.6),
      gateOpen: () => {
        playSfx('door_open');
        notify(Haptics.NotificationFeedbackType.Success);
      },
    };
    run.scene.onEvent = (e) => sounds[e]();
    // The vehicle with the crown leaves a trail of the equipped paint.
    const palette = particlePalette(profile.equipped.paint, 0xff5468);
    run.scene.setTrailColor(run.scene.player, `#${palette[0].toString(16).padStart(6, '0')}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setPopup(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

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
    const after = completeLevelNow(lvl.id, earned, state.moves);
    setDoneStars({ ...after.stars });
    const won = settleVictory(getProfile(), { levelId: lvl.id, stars: earned, previousStars, picked: 0, moves: state.moves, optimum: lvl.optimal, seconds, hintUsed: hintUsed.current });
    updateProfile(() => won.profile);
    runWhenIdle(() => track('level_complete', { level: lvl.id, moves: state.moves, stars: earned, duration: seconds }));
    setEnd({
      key: Date.now(),
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

  const goNext = useCallback(() => {
    setEnd((e) => {
      if (e) setLevelId(e.next);
      return null;
    });
    setRunKey((k) => k + 1);
  }, []);

  // The result stays for a moment, then the next level comes by itself.
  useEffect(() => {
    if (!end) return;
    const id = setTimeout(goNext, RESULT_MS);
    return () => clearTimeout(id);
  }, [end, goNext]);

  /* --------------------------------------------------------------------------- a gesture */

  const act = useCallback(
    (vehicle: number, dir: Dir | null) => {
      if (!run || finished.current || end || popup || menuOpen) return;
      const { scene, board, state } = run;
      scene.lastTouched = vehicle;
      // A vehicle that is still moving ignores gestures; the others stay playable.
      if (scene.isBusy(vehicle)) return;
      const way = dir ?? board.level.vehicles[vehicle].dir;
      const result = applyGesture(board, state, vehicle, way);
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
    [run, end, popup, menuOpen, shownLimit, tutorialOpen, dismissTutorial, refreshGuide, win, later],
  );
  const actRef = useRef(act);
  actRef.current = act;
  const runRef = useRef(run);
  runRef.current = run;

  const vehicleAt = useCallback(
    (x: number, y: number): number => {
      const r = runRef.current;
      if (!r) return -1;
      const cell = bridge.pick(x, y);
      if (!cell) return -1;
      return r.state.occ[cell[0] * r.level.cols + cell[1]];
    },
    [bridge],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(8)
      .maxPointers(1)
      .onBegin((e) => {
        touched.current = vehicleAt(e.x, e.y);
        swiped.current = false;
      })
      .onUpdate((e) => {
        if (swiped.current || touched.current < 0) return;
        const adx = Math.abs(e.translationX);
        const ady = Math.abs(e.translationY);
        if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;
        swiped.current = true;
        actRef.current(touched.current, adx > ady ? (e.translationX > 0 ? 'R' : 'L') : e.translationY > 0 ? 'D' : 'U');
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(12)
      .onEnd((e) => {
        const v = vehicleAt(e.x, e.y);
        if (v >= 0) actRef.current(v, null);
      });
    return Gesture.Exclusive(pan, tap);
  }, [vehicleAt]);

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
  const pauseToggles: PauseToggle[] = settings
    ? [
        { key: 'music', icon: 'music', offIcon: 'music-off', label: t('settings.music'), on: settings.music, onToggle: () => toggleSetting({ music: !settings.music }) },
        { key: 'sound', icon: 'volume-high', offIcon: 'volume-off', label: t('settings.sfx'), on: settings.sound, onToggle: () => toggleSetting({ sound: !settings.sound }) },
        { key: 'vibrations', icon: 'vibrate', offIcon: 'vibrate-off', label: t('settings.vibrations'), on: settings.vibrations, onToggle: () => toggleSetting({ vibrations: !settings.vibrations }) },
      ]
    : [];

  /* --------------------------------------------------------------------------- what is drawn */

  const guideAt = guide && run ? bridge.toScreen(run.scene.actors[guide.vehicle].x, run.scene.actors[guide.vehicle].z, 0.4) : null;
  const bubbleTop = insets.top + HEADER_H + 8;
  const noLife = !!level && atStake && lives.count <= 0 && !lives.infinite && !end;

  const movesNode = (
    <Text style={styles.moves}>{shownLimit !== null ? t('game.movesOf', { moves, limit: shownLimit }) : t('game.moves', { count: moves })}</Text>
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={styles.scene} collapsable={false}>
          {run && level && (
            <ParkingCanvas
              level={level}
              scene={run.scene}
              bridge={bridge}
              margins={margins}
              active={focused}
              decor={settings?.decor ?? true}
              skin={profile.equipped.ball}
              onReady={() => markReady('/')}
            />
          )}
        </View>
      </GestureDetector>

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

          {tutorialOpen && !end && <TutorialBubble text={TUTORIAL_TEXT[tutorialOpen]} top={bubbleTop} onPress={dismissTutorial} />}
          {!tutorialOpen && level.id === 1 && moves === 0 && !daily && <TutorialBubble text={t('game.swipeToMove')} top={bubbleTop} />}
          {message && (
            <View style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}

          {guide && guideAt && !end && <GuideHand x={guideAt.x} y={guideAt.y} dir={guide.dir} />}

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
          <View style={[styles.next, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
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

      {menuOpen && <PauseMenu title={t('settings.title')} lines={level ? [daily ? t('hud.dailyTitle') : t('hud.level', { id: level.id }), shownLimit !== null ? t('game.movesOf', { moves, limit: shownLimit }) : t('game.moves', { count: moves })] : []} actions={pauseActions} toggles={pauseToggles} onClose={() => setMenuOpen(false)} />}

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
      {testerTools() && null}
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
  moves: { color: colors.textSoft, fontSize: fontSizes.sm, fontWeight: '800' },
  toast: { position: 'absolute', top: '45%', left: 24, right: 24, alignItems: 'center' },
  toastText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800', textAlign: 'center', backgroundColor: 'rgba(18, 12, 34, 0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden' },
  popKicker: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
  popTitle: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '800', textAlign: 'center' },
  popBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
});
