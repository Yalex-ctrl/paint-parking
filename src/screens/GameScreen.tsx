/* eslint-disable react-hooks/immutability, react-hooks/refs, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization, react-hooks/purity --
 * The level screen is imperative on purpose: it drives a 3D scene through a bus object, refs and timers, and sets state from
 * events that come from outside React (the route, the scene, the stores). The refs made by useLatestRef are stable. The React
 * Compiler is not enabled in this app. */
import { itemName } from '@/i18n/names';
import { formatNumber, t, useLanguage } from '@/i18n';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { AppState, BackHandler, Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { initAudio, playPlip, setWhoosh, stopWhoosh, playSfx, playStarNote, setAudioSettings, setMusicContext, wantMusic } from '@/services/audio';
import { Attention, ChestOpening, ResultStars, TutorialBubble, WorldProgressRow } from '@/components/LevelResult';
import { resultTimings } from '@/render/resultTimings';
import { HudPop } from '@/components/HudPop';
import { guideMode, guideView, startGuide, type Guide, type GuideView } from '@/game/guide';
import { holdHud, releaseHud, resetHud } from '@/tour/hudStore';
import { SaveStreak } from '@/components/StreakModals';
import { Confetti } from '@/components/Confetti';
import { DailyRewardCard } from '@/components/DailyRewardCard';
import { LaunchLogo } from '@/components/LaunchLogo';
import { LevelHud } from '@/components/LevelHud';
import { HeartPop, NoLivesCard } from '@/components/NoLivesCard';
import { RewardBurst } from '@/components/RewardBurst';
import { postponeTour, shouldOfferTour } from '@/game/tour';
import { bubbleSlot } from '@/render/bubbleSlot';
import { boardBandPx } from '@/render/cameraFit';
import { Target } from '@/tour/targets';
import { isTourRunning, onTourEnd, startTour, useTourRunning } from '@/tour/tourStore';
import { ResetFlow } from '@/components/ResetFlow';
import { adsBannerHeight } from '@/config/app';
import { AdBanner } from '@/components/AdBanner';
import { livesOn, useFeatures } from '@/config/features';
import { chestCoins, endsStep, stepOf } from '@/game/steps';
import { autoOffer, noteAutoOffer, type PaywallSource } from '@/game/vip';
import { replayTutorial, resetProgress } from '@/storage/reset';
import { ConfirmLife, OutOfMoves } from '@/components/LivesModals';
import { PauseMenu, type PauseAction, type PauseToggle } from '@/components/PauseMenu';
import { HintChoice, Overlay, PrimaryButton, StarterPackOffer, WorldUnlock, markStarterOffered } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { dailyRewardStatus, type DailyResult } from '@/game/daily';
import { DAILY_LEVELS, dailyLevelForDay, levelOfId } from '@/game/dailyLevels';
import { newMechanicsOf } from '@/game/dailyMechanics';
import { dailyLoadout } from '@/game/dailyLoadout';
import { LoadoutOffer } from '@/components/LoadoutOffer';
import { TrialBadge, TrialEndCard } from '@/components/TrialCards';
import { notePlaySwipe, setPlayContext } from '@/services/playTime';
import { dayKeyOf } from '@/game/dates';
import { earnCoins, earnPlayed, type Profile, payHint, pickUpCoin, shouldOfferStarter, spendCoins } from '@/game/economy';
import { registerInterstitial, shouldShowInterstitial } from '@/game/adRules';
import { Chrono } from '@/game/chrono';
import { settleDaily, settleVictory, type VictoryResult } from '@/game/victory';
import { scoreLines, totalScore, type ScoreDetail } from '@/game/points';
import { noteEvent, playContext } from '@/services/playClock';
import { submitScore } from '@/services/leaderboard';
import { holdIdle, releaseIdle, runWhenIdle } from '@/services/idleQueue';
import { traceEnd, traceStart, traceWork, traced, tracing } from '@/render/transitionTrace';
import { applyMove, createState, type GameState } from '@/game/engine';
import { pictureForLevel, piecesEarned } from '@/game/gallery';
import { cachedInfiniteLevel, generateInfiniteLevel } from '@/game/infinite';
import { LEVEL_COUNT } from '@/game/levels';
import { notificationPermissionAsked, shouldAskNotificationPermission } from '@/game/notificationPlan';
import { failureCostsStreak, lifeCosts } from '@/game/lives';
import { protectionOffered, resetStreak, saveWithAd, saveWithCoins } from '@/game/streak';
import { HEAVY_IMPACT_FROM, impactVolume, slideThrill, slideWord } from '@/game/soundRules';
import { activeLimit, starsFor } from '@/game/scoring';
import { type ShopItem } from '@/game/shopItems';
import { solveBeam } from '@/game/beam';
import { solveFrom } from '@/game/solver';
import type { Dir, Tutorial } from '@/game/types';
import { isDailyLevelId, isNewWorldStart } from '@/game/worlds';
import { SceneBus, type GameEvent } from '@/render/bus';
import { particlePalette } from '@/render/paintPalette';
import { OutlineText } from '@/ui/OutlineText';
import { perf, useFps, useQuality, useWorst } from '@/render/perf';
import { slowest, timed } from '@/render/profiler';
import { GameCanvas, SCENE_BG } from '@/render/GameCanvas';
import { useCommitTimer } from '@/render/useCommitTimer';
import { testerTools } from '@/config/tester';
import { benchMark, benchTimed } from '@/render/bench';
import { benchProgress, useBridgeBench } from './useBridgeBench';
import { freeCameraGesture } from '@/render/FreeCamera';
import { SceneErrorBoundary, useFrameErrorGuard } from '@/render/SceneGuard';
import { prepareLevel, prepareLevelSteps, type PreparedLevel, type Viewport } from '@/render/prepare';
import { AHEAD, BUTTONS_H, HEADER_H, STARS_H, pruneBefore, setWarmIdle, setWarmPaused, takePrepared, warmAhead } from '@/render/prepareCache';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { Haptics, impact, notify, setHapticsEnabled } from '@/services/haptics';
import { requestNotificationPermission, syncNotifications } from '@/services/notifications';
import { spendLife, useLivesView } from '@/storage/lives';
import { getProfile, loadProfile, updateProfile, useProfile } from '@/storage/profile';
import { completeLevelNow, loadProgress, peekProgress } from '@/storage/progress';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/storage/settings';
import { Button3D } from '@/ui/Button3D';
import { markReady } from '@/ui/loadingStore';
import { markFirstFrame, markNavigation } from '@/render/loadTimer';
import { CoinAmount, CoinIcon } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes } from '@/ui/theme';
import { TUTORIAL_TEXT, loadSeenTutorials, markTutorialSeen } from '@/storage/tutorials';

const SWIPE_THRESHOLD = 18; // px of finger travel before a swipe registers
const HINT_MAX_STATES = 60_000;
const HUD_H = 46;
const COIN_FLIGHT_MS = 520; // a coin flies to the counter; the counter reacts when it arrives
/** The next level is prepared (geometry, decor, camera) this long after the current one starts. */
const PREPARE_NEXT_DELAY_MS = 250;
/** While the ball moves, the preparation of the next level looks again after this long (milliseconds). */
const CALM_RETRY_MS = 80;
/** Pause between two steps of that preparation, so the scene keeps drawing in between. */
const STEP_GAP_MS = 24;
const END_UI_EXTRA_MS = 500; // the end-of-level UI stays this long after the new board has landed

/** Index of the next paint note in the slide being played: it climbs tile after tile, and starts again at the next swipe. */
let slideNote = 0;

/** Haptic feedback and sound per game event, kept in one place. `strength` is the length of the slide for a hit. */
export function react(event: GameEvent, strength?: number) {
  const H = Haptics;
  const thrill = slideThrill(strength ?? 0);
  // The vibration grows with the slide: light, medium, then heavy for the very long ones.
  const hit = thrill === 0 ? H.ImpactFeedbackStyle.Light : thrill === 1 ? H.ImpactFeedbackStyle.Medium : H.ImpactFeedbackStyle.Heavy;
  switch (event) {
    case 'tile':
      playPlip(slideNote++);
      break;
    case 'double':
      // The "x2" of a tile that has been crossed once pops away: a discreet sound.
      playSfx('click', 0.45);
      break;
    case 'gate':
      // The gate of the entry closes behind the ball: a soft knock of wood and a light vibration.
      impact(H.ImpactFeedbackStyle.Light);
      playSfx('impact_soft', 0.55);
      break;
    case 'impact':
      impact(hit);
      playSfx(( strength ?? 1) >= HEAVY_IMPACT_FROM ? 'impact_hard' : 'impact_soft', impactVolume(strength ?? 1));
      break;
    case 'stop':
      impact(hit);
      playSfx('stop');
      break;
    case 'teleport':
      impact(H.ImpactFeedbackStyle.Light);
      playSfx('teleport', 0.8);
      break;
    case 'break':
      impact(H.ImpactFeedbackStyle.Heavy);
      playSfx('break');
      break;
    case 'bomb':
      impact(H.ImpactFeedbackStyle.Heavy);
      playSfx('bomb');
      break;
    case 'exitOpen':
      impact(H.ImpactFeedbackStyle.Medium);
      playSfx('door_open');
      break;
    case 'landed':
      impact(H.ImpactFeedbackStyle.Heavy);
      playSfx('impact_soft', 0.7);
      break;
    case 'coin':
      playSfx('coin');
      break;
    case 'chuteIn':
      impact(H.ImpactFeedbackStyle.Light);
      break;
    case 'chuteRide':
      setWhoosh(strength ?? 0.5);
      break;
    case 'chuteOut':
      stopWhoosh();
      impact(H.ImpactFeedbackStyle.Light);
      playSfx('plop', 0.8);
      break;
    case 'flapOpen':
      playSfx('clac', 0.8);
      break;
    case 'flapClose':
      playSfx('clac', 0.45);
      break;
    case 'flapHit':
      // The ball runs into the flap of a chute's exit from outside: a dull knock and a light vibration, like a wall that does not give.
      impact(H.ImpactFeedbackStyle.Light);
      playSfx('tok', 0.9);
      break;
    case 'collapse':
      impact(H.ImpactFeedbackStyle.Medium);
      playSfx('rumble', 0.9);
      break;
    case 'rampLand':
      impact(H.ImpactFeedbackStyle.Light);
      playSfx('impact_soft', 0.4);
      break;
  }
}

/** What the end-of-level UI shows while the ball falls to the next level. */
type EndInfo = {
  key: number;
  stars: 1 | 2 | 3;
  levelId: number;
  /** The player has just beaten his own record on a level he had already finished (never at the first pass). */
  newRecord: boolean;
  streak: number;
  mult: number;
  /** The coins of the level, already multiplied by the streak. */
  total: number;
  /** The coin counter is on screen (not in the first five levels): the gain is shown and flies to it. */
  showGain: boolean;
  /** The points of the level, with what they are made of (the detail bubble) and what was played. */
  score: ScoreDetail;
  moves: number;
  optimum: number;
  seconds: number;
  /** The player has just beaten his own best score on a level he had already finished. */
  newBestScore: boolean;
  picture: number;
  piecesBefore: number;
  piecesAfter: number;
};

const needsGeneration = (id: number) => id > LEVEL_COUNT && !isDailyLevelId(id) && !cachedInfiniteLevel(id);

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

/**
 * "Étape terminée !": the chest falls, shakes and opens at once with the veil (see ChestOpening), then the card: the coins, how far
 * through the world and its picture the player is, and the choice to double the coins for a rewarded ad.
 */
function StepEnd({
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

let wordCounter = 0;

/** "Super !", "Génial !", "Incroyable !": rises from the ball and fades. */
function FloatingWord({ text, x, y, thrill }: { text: string; x: number; y: number; thrill: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 950 }));
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, t.get() - 0.55) / 0.45, transform: [{ translateY: -70 * t.get() }, { scale: 0.7 + Math.min(1, t.get() * 6) * 0.3 + thrill * 0.06 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.wordWrap, { left: x - 120, top: y }, style]}>
      <OutlineText style={styles.word} color={thrill >= 3 ? colors.flameLight : thrill === 2 ? colors.gold : colors.text} width={2.5}>
        {text}
      </OutlineText>
    </Animated.View>
  );
}

type Popup =
  | { kind: 'world'; levelId: number }
  | { kind: 'reward'; item: ShopItem }
  | { kind: 'starter' }
  | { kind: 'hint' }
  | { kind: 'outOfMoves' }
  | { kind: 'confirmRestart' }
  | { kind: 'step'; step: number; coins: number; progress: { levelId: number; picture: number; pieces: number } | null }
  | { kind: 'tourIntro' }
  | { kind: 'trialEnd'; itemId: string }
  | { kind: 'saveStreak'; value: number }
  | null;

/** "4 / 12 coups": orange with 3 moves left, red with 1, and it pulses. */
function MovesText({ moves, limit }: { moves: number; limit: number | null }) {
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
    <Animated.Text style={[styles.movesText, { color }, style]}>
      {limit === null ? t('game.moves', { count: moves }) : t('game.movesOf', { moves, limit })}
    </Animated.Text>
  );
}

export default function GameScreen() {
  useCommitTimer('GameScreen');
  useLanguage();
  // For the trace of the passage between levels: how long this screen took to render and commit (see render/transitionTrace.ts).
  const renderStart = performance.now();
  const router = useRouter();
  const { level: levelParam, daily: dailyParam, challenge: challengeParam, reset: resetParam, bench: benchParam } = useLocalSearchParams<{ level?: string; daily?: string; challenge?: string; reset?: string; bench?: string }>();
  const isDaily = dailyParam === '1';
  // The bench of the bridge (developer tool): no interstitial ad interrupts it.
  const benchLabelRef = useRef(benchParam ?? '');
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  // The scene stops drawing while another screen (settings, shop...) is on top of the game.
  const focused = useIsFocused();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [levelId, setLevelId] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [moves, setMoves] = useState(0);
  const [shownCoins, setShownCoins] = useState(profile.coins);
  const [, setCoinBump] = useState(0);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null);
  const [loadoutLater, setLoadoutLater] = useState(false);
  const [dailyScore, setDailyScore] = useState<{ score: ScoreDetail; moves: number; optimum: number; seconds: number; best: boolean } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Bumped when a level generated in the background (after level 500) is ready. */
  const [generated, setGenerated] = useState(0);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  /** Moves added to the limit this attempt ("Plus de coups !"). */
  const [extraMoves, setExtraMoves] = useState(0);
  /** The stars of the levels done: the bar of the step reads them. */
  const [doneStars, setDoneStars] = useState<Record<number, number>>({});
  /** Bumped when the streak multiplies the gain of a level: the flame in the header animates. */
  const [flameBoost, setFlameBoost] = useState(0);
  /** Every tile is painted and the gate is open: the next level must be ready by the time the ball is out. */
  /** What the help shows now. */
  const [guideShow, setGuideShow] = useState<GuideView>({ show: 'none' });
  const [resetOpen, setResetOpen] = useState(false);
  /** The logo shows when the app opens, for a few seconds, and folds at the first swipe. */
  const [logoOn, setLogoOn] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLogoOn(false), 3800);
    return () => clearTimeout(id);
  }, []);
  /** The reward of the day, the first time the app opens that day. */
  const [showReward, setShowReward] = useState(false);
  useEffect(() => {
    loadProfile().then((p) => {
      if (dailyRewardStatus(p, dayKeyOf(new Date())).available && p.launches > 1) setShowReward(true);
    });
  }, []);
  /** A reset or a "level 1 again" (from the menu): the level starts afresh. */
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    setRunKey((k) => k + 1);
    setNext(null);
    setEnd(null);
  }, [resetParam]);
  const adMovesUsed = useRef(false);
  /** Coins picked up in this attempt (they are multiplied by the streak when the level is won). */
  const pickedCount = useRef(0);
  /** What to do once the player has chosen what happens to their streak (restart, leave...). */
  const afterLoss = useRef<(() => void) | null>(null);
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [current, setCurrent] = useState<PreparedLevel | null>(null);
  const [next, setNext] = useState<PreparedLevel | null>(null);
  // A curtain in the colours of the world stays over the whole screen until the scene has drawn its first frames.
  const drawn = useCallback(() => {
    markFirstFrame('game');
    markReady('/');
  }, []);
  useEffect(() => {
    markNavigation('game');
  }, []);

  const bus = useMemo(() => new SceneBus(), []);
  const level = current ? current.level : null;

  /** Confetti in the colours of the equipped paint, when the exit opens. */
  const [confetti, setConfetti] = useState(0);

  /** Words floating over the ball after a long slide. */
  const [words, setWords] = useState<{ id: number; text: string; x: number; y: number; thrill: number }[]>([]);
  const showWord = useCallback(
    (text: string, thrill: number) => {
      const p = bus.ballNdc;
      if (!p || !viewport) return;
      const id = ++wordCounter;
      setWords((w) => [...w.slice(-2), { id, text, thrill, x: ((p.x + 1) / 2) * viewport.width, y: ((1 - p.y) / 2) * viewport.height - 40 }]);
      setTimeout(() => setWords((w) => w.filter((i) => i.id !== id)), 1000);
    },
    [bus, viewport],
  );

  const state = useRef<GameState | null>(null);
  const played = useRef('');
  const busy = useRef(false);
  /** A swipe made while the ball was rolling; played as soon as it stops. */
  const queued = useRef<Dir | null>(null);
  const swipeRef = useRef<(dir: Dir) => void>(() => {});
  const finished = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCoins = useRef<number[]>([]);
  const earnedStars = useRef<1 | 2 | 3>(3);
  /** An exclusive item won by finishing the last level of a world: shown once the next level has started. */
  const pendingReward = useRef<ShopItem | null>(null);
  const endRef = useLatestRef(end);
  const startedAt = useRef(0);
  /** The chronometer of the level (from the first swipe to the exit) and whether a hint was used. */
  const chrono = useRef(new Chrono());
  const hintUsed = useRef(false);
  /** The trial of a ball or a paint that ended with the level just won: its card comes once nothing else is on screen. */
  const trialEnded = useRef<string | null>(null);
  const [trialEndId, setTrialEndId] = useState<string | null>(null);
  /** Coins on their way to the counter: the counter must not jump ahead of them. */
  const flights = useRef(0);
  const nextRef = useLatestRef(next);
  const levelRef = useLatestRef(level);
  const everPrepared = useRef(new Set<PreparedLevel>());
  const popupRef = useLatestRef(popup);
  const isDailyNow = level ? isDailyLevelId(level.id) : isDaily;
  const features = useFeatures();
  const baseLimit = level ? activeLimit(level.id, level.solution.length, isDailyNow) : null;
  const limit = baseLimit === null ? null : baseLimit + extraMoves;
  const limitRef = useLatestRef(limit);
  const lives = useLivesView();
  // No life left, in a level that would cost one: the level waits behind a veil until one is back.
  const noLife = features.lives && !!level && !isDailyNow && level.id > MONETIZATION.lives.freeUntilLevel && !lives.infinite && lives.count === 0;
  /** A heart pops when the lives come back. */
  const [heartKey, setHeartKey] = useState(0);
  const wasOut = useRef(false);
  useEffect(() => {
    if (wasOut.current && !noLife) setHeartKey((k) => k + 1);
    wasOut.current = noLife;
  }, [noLife]);
  // A life is at stake only when lives exist; a streak is at stake when a level can be failed (a life lost, or the limit passed).
  const atStake = level ? lifeCosts(level.id, isDailyNow) : false;
  const atStakeRef = useLatestRef(atStake);
  // The daily challenge is played with the ball and the paint of the day (the same for everyone); the rest of the game with the player's.
  const dailyKit = useMemo(() => (isDailyNow ? dailyLoadout(dayKeyOf(new Date())) : null), [isDailyNow]);
  const equippedBall = dailyKit?.ball.id ?? profile.equipped.ball;
  const equippedPaint = dailyKit?.paint.id ?? profile.equipped.paint;
  const paintConfetti = useMemo(
    () => (level ? particlePalette(equippedPaint, parseInt(level.color.replace('#', ''), 16)).map((n) => `#${n.toString(16).padStart(6, '0')}`) : []),
    [level, equippedPaint],
  );
  const menuOpenRef = useLatestRef(menuOpen);
  const tourRunning = useTourRunning();
  const tourRunningRef = useLatestRef(tourRunning);
  const tutorialRef = useLatestRef(tutorial);
  const blockedRef = useLatestRef(popup !== null || dailyResult !== null || menuOpen || noLife || tourRunning);
  /** The tour offer waits for the chest of the step to be closed (the fifth level ends a step). */
  const pendingTour = useRef(false);
  /** The VIP paywall that comes by itself at the end of a step, once the chest popup is closed. */
  const pendingPaywall = useRef<PaywallSource | null>(null);
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
    [],
  );

  // Free band for the board: below the header, above the buttons.
  const margins = useMemo(
    () => ({ top: insets.top + HEADER_H + STARS_H, bottom: insets.bottom + BUTTONS_H }),
    [insets.top, insets.bottom],
  );

  const prepare = useCallback(
    (id: number): PreparedLevel | null => {
      if (!viewport || !settings) return null;
      // Already prepared when the player opened the pop-up of the level on the map?
      const p = takePrepared(id, viewport, margins, settings.decor) ?? prepareLevel(levelOfId(id), viewport, margins, settings.decor);
      everPrepared.current.add(p);
      return p;
    },
    [viewport, settings, margins],
  );

  /** The same preparation, as steps to run a little at a time (see prepareLevelSteps). */
  const prepareSteps = useCallback(
    (id: number) => (viewport && settings ? prepareLevelSteps(levelOfId(id), viewport, margins, settings.decor) : null),
    [viewport, settings, margins],
  );

  // The counter in the header follows the profile, except while coins are still flying to it.
  useEffect(() => {
    if (flights.current === 0) setShownCoins(profile.coins);
  }, [profile.coins]);

  /** Something was added to the profile that should reach the counter after `ms` (with a little pop). */
  /** Coins picked up during the slide in progress: they reach the profile in ONE write when it ends (not one redraw per coin). */
  const slideAwards = useRef<number[]>([]);
  const slideProfile = useRef<Profile | null>(null);
  const arriveLater = useCallback((ms: number) => {
    flights.current++;
    setTimeout(() => {
      flights.current--;
      if (flights.current === 0) setShownCoins(getProfile().coins + slideAwards.current.length);
      else setShownCoins((c) => c + 1);
      setCoinBump((b) => b + 1);
    }, ms);
  }, []);

  // The card that ends a trial comes once nothing else is on screen.
  useEffect(() => {
    if (!trialEndId || popup !== null || tourRunning || menuOpen || end !== null) return;
    const t = setTimeout(() => {
      setPopup({ kind: 'trialEnd', itemId: trialEndId });
      setTrialEndId(null);
    }, 700);
    return () => clearTimeout(t);
  }, [trialEndId, popup, tourRunning, menuOpen, end]);

  // The chests of play time count only real play: a level in progress, nothing hiding it, a swipe in the last 30 seconds.
  useEffect(() => {
    setPlayContext({ levelActive: !!level && end === null && !finished.current, blocked: popup !== null || menuOpen || dailyResult !== null || noLife || tourRunning || showReward });
  }, [level, end, popup, menuOpen, dailyResult, noLife, tourRunning, showReward]);

  // The chronometer of the level stops while a menu, a pop-up, an ad, the tour or the background hides the game.
  const hiddenNow = popup !== null || menuOpen || dailyResult !== null || noLife || tourRunning;
  useEffect(() => {
    const now = Date.now();
    if (hiddenNow) chrono.current.pause(now);
    else chrono.current.resume(now);
  }, [hiddenNow]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const now = Date.now();
      if (st === 'active') chrono.current.resume(now);
      else chrono.current.pause(now);
    });
    return () => sub.remove();
  }, []);

  // The ambient music plays while the game is on screen.
  useEffect(() => {
    wantMusic(focused, 'game');
    if (focused) setMusicContext('game');
    return () => wantMusic(false, 'game');
  }, [focused]);

  // Settings, then which level to start on: today's challenge, the one picked in the list, else where the player left off.
  useEffect(() => {
    loadSettings().then((s) => {
      setAudioSettings(s);
      setHapticsEnabled(s.vibrations);
      initAudio();
      setSettings(s);
    });
  }, []);
  useEffect(() => {
    loadProgress().then((p) => setDoneStars(p.stars));
  }, [resetParam]);
  useEffect(() => {
    if (isDaily) {
      // A developer can play any of the 366 challenges (dev menu); the player always gets today's.
      const picked = testerTools() ? Number(challengeParam) : NaN;
      setLevelId(Number.isFinite(picked) && picked >= 1 && picked <= DAILY_LEVELS.length ? DAILY_LEVELS[Math.round(picked) - 1].id : dailyLevelForDay(dayKeyOf(new Date())).id);
      return;
    }
    const picked = Number(levelParam);
    if (levelParam && Number.isFinite(picked) && picked >= 1) {
      // A developer can go to any number: past the stored campaign the level is generated on the phone (game/infinite.ts).
      setLevelId(testerTools() ? Math.round(picked) : Math.min(Math.round(picked), LEVEL_COUNT));
    } else {
      loadProgress().then((p) => setLevelId(p.current));
    }
  }, [levelParam, isDaily, challengeParam, resetParam]);

  // Prepare the level to play (geometry, decor plan, island, camera) once everything it needs is known.
  useEffect(() => {
    if (levelId === null || current?.id === levelId) return;
    if (needsGeneration(levelId)) {
      generateInfiniteLevel(levelId).then(() => setGenerated((n) => n + 1));
      return;
    }
    const p = prepare(levelId);
    if (p) {
      setCurrent(p);
      // The level was chosen from outside (a jump, a reset, the daily challenge): the board prepared as "next" is no longer the one that follows.
      setNext(null);
    }
  }, [levelId, current, prepare, generated]);

  // ...and the next one, while the current one is being played (a daily challenge has no next level).
  useEffect(() => {
    if (!current || next || isDailyLevelId(current.id)) return;
    const nextId = current.id + 1;
    if (needsGeneration(nextId)) {
      // Past the stored levels: built on the phone, a few milliseconds at a time, while this level is played.
      generateInfiniteLevel(nextId).then(() => setGenerated((n) => n + 1));
      return;
    }
    // Already prepared in the background? Then there is nothing to build at all.
    if (viewport && settings) {
      const ahead = takePrepared(nextId, viewport, margins, settings.decor);
      if (ahead) {
        everPrepared.current.add(ahead);
        const t = setTimeout(() => setNext(ahead), 50);
        return () => clearTimeout(t);
      }
    }
    // Built a piece at a time (one per tick) so no single frame pays for all of it.
    const steps = prepareSteps(nextId);
    if (!steps) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      // Only in calm frames: while the ball slides, the board is being left or the crossing runs, nothing is built; it waits a moment
      // and goes on when the ball is still. (When the crossing is already waiting for this very level, it goes on at full speed.)
      const waiting = bus.transitionRequested;
      if (!waiting && (busy.current || bus.exiting || bus.transitioning)) {
        timer = setTimeout(run, CALM_RETRY_MS);
        return;
      }
      const r = benchTimed('prepare step', () => steps.next());
      if (r.done) {
        everPrepared.current.add(r.value);
        setNext(r.value);
        // ...and the one after it, so a slow phone is never caught waiting.
        if (nextId + 1 > LEVEL_COUNT) generateInfiniteLevel(nextId + 1);
      } else timer = setTimeout(run, waiting ? 3 : STEP_GAP_MS);
    };
    // It starts as soon as the ball has landed on this level, so the next one is ready long before the end of this one.
    timer = setTimeout(run, PREPARE_NEXT_DELAY_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [current, next, prepareSteps, generated, viewport, settings, margins, bus]);

  // While a level is played, the 8 after the next one are prepared in the background, a piece at a time; what is behind is released.
  useEffect(() => {
    if (!current || !viewport || !settings || isDailyLevelId(current.id)) return;
    pruneBefore(current.id);
    const t = setTimeout(() => warmAhead(current.id + 2, AHEAD, viewport, margins, settings.decor), 600);
    return () => clearTimeout(t);
  }, [current, viewport, settings, margins]);

  // While nothing moves (a reward, a pop-up, the menu, the tour) the levels ahead are prepared at full speed.
  const idleNow = popup !== null || menuOpen || tourRunning || dailyResult !== null || noLife;
  // (Not when the gate opens: that is the start of the window of the bridge, where nothing else may be built.)
  useEffect(() => {
    setWarmIdle(idleNow);
    return () => setWarmIdle(false);
  }, [idleNow]);

  // Free the geometry of boards that are neither current nor next any more.
  useEffect(() => {
    for (const p of [...everPrepared.current]) {
      if (p !== current && p !== next) {
        // Freed once the ball has landed, one board at a time (never during the crossing).
        runWhenIdle(() => p.dispose());
        everPrepared.current.delete(p);
      }
    }
  }, [current, next]);
  useEffect(
    () => () => {
      everPrepared.current.forEach((p) => p.dispose());
      everPrepared.current.clear();
      if (watchdog.current) clearTimeout(watchdog.current);
    },
    [],
  );

  /** Shows the first explanation of this level that the player has not seen (none when there is nothing left to explain). */
  const showNextTutorial = useCallback(
    (lv: NonNullable<typeof level>) => {
      const wanted: Tutorial[] = isDailyLevelId(lv.id) ? newMechanicsOf(lv) : lv.tutorial ? [lv.tutorial] : [];
      if (wanted.length === 0) return;
      loadSeenTutorials().then((seen) => {
        const first = wanted.find((m) => !seen.includes(m));
        if (first && levelRef.current === lv) setTutorial(first);
      });
    },
    [levelRef],
  );

  // (Re)start the current level: fresh logic state, idle scene, one-time tutorial bubble.
  useEffect(() => {
    if (!level) return;
    state.current = createState(level);
    played.current = '';
    busy.current = false;
    queued.current = null;
    finished.current = false;
    pendingCoins.current = [];
    bus.clearInput();
    startedAt.current = Date.now();
    chrono.current.reset();
    hintUsed.current = false;
    adMovesUsed.current = false;
    pickedCount.current = 0;
    setExtraMoves(0);
    setMoves(0);
    setHintMessage(null);
    setTutorial(null);
    lastActivity.current = Date.now();
    arrowShown.current = false;
    setGuideShow({ show: 'none' });
    refreshGuide();
    if (runKey === 0) track('level_start', { level: level.id, daily: isDailyLevelId(level.id) });
    // The lessons of this level: its own tutorial (a mechanic of the campaign), or, in a daily challenge, one for each of the newest
    // mechanics it holds that the player has not met yet. Each is shown once, one after the other.
    showNextTutorial(level);
  }, [level, runKey, bus, levelRef, showNextTutorial]);

  // ---- The help of the first levels. The solver works in the background after every swipe, so the arrow is ready when it is due.
  const guideRef = useRef<Guide | null>(null);
  const lastActivity = useRef(0);
  const arrowShown = useRef(false);

  const evaluateGuide = useCallback(() => {
    const lv = levelRef.current;
    if (!lv || !guideMode(lv.id, isDailyLevelId(lv.id))) {
      if (arrowShown.current) {
        arrowShown.current = false;
        bus.hint = null;
      }
      setGuideShow((p) => (p.show === 'none' ? p : { show: 'none' }));
      return;
    }
    const v = guideView({
      levelId: lv.id,
      daily: isDailyLevelId(lv.id),
      idleMs: Date.now() - lastActivity.current,
      busy: busy.current || bus.transitioning || finished.current || bus.rolling,
      blocked: blockedRef.current,
      guide: guideRef.current,
      allPainted: !!state.current && state.current.layers >= lv.layers,
    });
    if (v.show === 'arrow') {
      if (!arrowShown.current || bus.hint === null) bus.showHint(v.dir, Infinity);
      arrowShown.current = true;
    } else if (arrowShown.current) {
      arrowShown.current = false;
      bus.hint = null;
    }
    setGuideShow((p) => (p.show === v.show && (p.show !== 'arrow' || (v.show === 'arrow' && p.dir === v.dir)) ? p : v));
  }, [bus, levelRef, blockedRef]);

  const evaluateRef = useLatestRef(evaluateGuide);
  /** Works out the next good swipe from the position now (in the background), then looks again at what to show. */
  const cancelGuide = useRef<(() => void) | null>(null);
  const refreshGuide = useCallback(() => {
    guideRef.current = null;
    cancelGuide.current?.();
    cancelGuide.current = null;
    const lv = levelRef.current;
    const st = state.current;
    // Nothing to work out once the level is won (the ball is on its way out through the gate).
    if (!lv || !st || st.finished || !guideMode(lv.id, isDailyLevelId(lv.id))) return;
    // The search runs a few milliseconds at a time between frames, so the rolling ball never stutters; a swipe cancels it.
    cancelGuide.current = startGuide(lv, st, (g) => {
      cancelGuide.current = null;
      guideRef.current = g;
      evaluateRef.current();
    });
  }, [levelRef, evaluateRef, state]);

  useEffect(() => {
    const id = setInterval(evaluateGuide, 400);
    return () => clearInterval(id);
  }, [evaluateGuide]);

  const dismissTutorial = useCallback(() => {
    const shown = tutorialRef.current;
    setTutorial(null);
    if (shown) {
      markTutorialSeen(shown).then(() => {
        const lv = levelRef.current;
        if (lv) showNextTutorial(lv);
      });
    }
  }, [levelRef, tutorialRef, showNextTutorial]);

  /**
   * The ball dropped off the board through the exit: pay the rewards and hand over to the transition. Everything here is
   * synchronous and in memory (the progress is read once, at the start); the profile is written ONCE; the saves, the analytics and
   * the sounds that are not needed at once are queued for after the ball has landed (see services/idleQueue.ts).
   */
  const handleVictory = useCallback(
    async (lvl: NonNullable<typeof level>) => {
      const s = state.current;
      if (!s) return;
      // From here until the ball has landed, nothing that can wait runs; the levels being prepared in the background stop too.
      holdIdle();
      setWarmPaused(true);
      traceStart();
      const now = Date.now();
      chrono.current.stop(now);
      const seconds = chrono.current.seconds(now);
      const optimum = lvl.solution.length;
      const earned = starsFor(s.moves, optimum);
      earnedStars.current = earned;
      notify(Haptics.NotificationFeedbackType.Success);
      const duration = Math.round((now - startedAt.current) / 1000);

      if (isDailyLevelId(lvl.id)) {
        // Today's challenge: streak, coins, maybe an exclusive ball, and the score. No next level: the result card closes it.
        const day = dayKeyOf(new Date());
        const won = traced('settleDaily', () => settleDaily(getProfile(), { day, moves: s.moves, optimum, seconds, hintUsed: hintUsed.current }));
        updateProfile(() => won.profile);
        if (won.trialEnded) trialEnded.current = won.trialEnded;
        runWhenIdle(() => {
          track('level_complete', { level: lvl.id, moves: s.moves, stars: earned, duration });
          if (!won.result.alreadyDone) track('daily_challenge_complete', { streak: won.result.streak, moves: s.moves, stars: earned });
          void submitScore({ day, score: won.score.total, moves: s.moves, seconds });
        });
        playSfx('win');
        // An isolated level: the ball only rolls off along a short bridge.
        bus.exitOnly = true;
        arriveLater(900);
        setDailyScore({ score: won.score, moves: s.moves, optimum, seconds, best: won.newBestScore });
        setTimeout(() => setDailyResult(won.result), 700);
        // No crossing to a next level: the queue and the preparation start again a little later.
        setTimeout(() => {
          releaseIdle();
          setWarmPaused(false);
          traceEnd('daily');
        }, 1800);
        return;
      }

      // The progress is read once (when the screen opens) and kept in memory: nothing is awaited here.
      const before = peekProgress() ?? (await loadProgress());
      const previousBest = before.moves[lvl.id];
      const previousStars = (before.stars[lvl.id] ?? 0) as 0 | 1 | 2 | 3;
      // A record is only announced when an existing one is beaten: never at the first pass of a level.
      const newRecord = previousBest !== undefined && s.moves < previousBest;
      // In the first five levels the header is minimal (no counter): the gain is paid (nothing, in fact) but not shown.
      const wasMinimal = lvl.id <= 5 && !((before.stars[5] ?? 0) > 0);
      // Level 5 won for the first time: the header stays as it is until the tour has brought the rest in.
      if (lvl.id === 5 && wasMinimal && shouldOfferTour(getProfile(), 5, false)) holdHud();
      const { picture } = pictureForLevel(lvl.id);
      const piecesBefore = piecesEarned(before.stars, picture);
      const after = completeLevelNow(lvl.id, earned, s.moves);
      setDoneStars({ ...after.stars });
      const piecesAfter = piecesEarned(after.stars, picture);
      const won: VictoryResult = traced('settleVictory', () =>
        settleVictory(getProfile(), { levelId: lvl.id, stars: earned, previousStars, picked: pickedCount.current, moves: s.moves, optimum, seconds, hintUsed: hintUsed.current }),
      );
      updateProfile(() => won.profile);
      if (won.trialEnded) trialEnded.current = won.trialEnded;
      if (won.reward) pendingReward.current = won.reward;
      runWhenIdle(() => {
        track('streak_up', { streak: won.streak.after, multiplier: won.streak.mult });
        track('level_complete', { level: lvl.id, moves: s.moves, stars: earned, duration });
      });
      if (won.streak.tierUp) setTimeout(() => playSfx('tier'), 1700);
      const timings = resultTimings(earned);
      if (won.total > 0 && !wasMinimal) arriveLater(timings.flyAt + 650);
      // The streak has multiplied the gain: the flame in the header does a little animation as the coins leave.
      if (!wasMinimal && won.streak.mult > 1 && won.total > 0) setTimeout(() => setFlameBoost((b) => b + 1), timings.flyAt);
      playSfx('win');
      setEnd({
        key: now,
        stars: earned,
        levelId: lvl.id,
        newRecord,
        streak: won.streak.after,
        mult: won.streak.mult,
        total: won.total,
        showGain: !wasMinimal,
        score: won.score,
        moves: s.moves,
        optimum,
        seconds,
        newBestScore: won.newBestScore && !wasMinimal,
        picture,
        piecesBefore,
        piecesAfter,
      });

      // A full-screen ad between two levels, when the rules allow it (never inside a level, never during the tour).
      const ctx = { completedLevel: lvl.id, inTour: isTourRunning(), ...playContext() };
      if (!benchLabelRef.current && shouldShowInterstitial(getProfile(), ctx)) {
        track('ad_interstitial_shown', { level: lvl.id, since_last_ad_s: ctx.lastAdAt === null ? null : ctx.playSeconds - ctx.lastAdAt });
        await ads.showInterstitial();
        updateProfile((p) => registerInterstitial(p, Date.now()));
      }
      bus.transitioning = true;
      bus.transitionRequested = true;
      benchMark('transitionRequested', nextRef.current !== null);
    },
    [bus, arriveLater, nextRef],
  );

  // Scene -> screen events.
  useEffect(() => {
    if (!level) return;
    bus.onEvent = (event, strength) => {
      timed(`event ${event}`, () => react(event, strength));
      if (event === 'exitOpen') {
        // The board is full and the gate opens. Nothing is built or re-rendered for that: the next level has been ready for a while.
        setConfetti((n) => n + 1);
        setTimeout(() => setConfetti(0), 2600);
      }
      if ((event === 'impact' || event === 'stop') && strength !== undefined) {
        const word = slideWord(strength);
        if (word) showWord(word, slideThrill(strength));
      }
      if (event === 'coin') {
        const index = pendingCoins.current.shift();
        if (index !== undefined) {
          const picked = pickUpCoin(slideProfile.current ?? getProfile(), level.id, index);
          if (picked.awarded) {
            pickedCount.current++;
            slideProfile.current = picked.profile;
            slideAwards.current.push(index);
            arriveLater(COIN_FLIGHT_MS);
          }
        }
      }
    };
    bus.onSlideDone = (exited) => {
      busy.current = false;
      lastActivity.current = Date.now();
      if (state.current) setMoves(state.current.moves);
      // The coins picked up during the slide are paid now, in a single write.
      if (slideAwards.current.length > 0) {
        const awards = slideAwards.current;
        slideAwards.current = [];
        slideProfile.current = null;
        updateProfile((p) => awards.reduce((acc, i) => pickUpCoin(acc, level.id, i).profile, p));
      }
      if (watchdog.current) clearTimeout(watchdog.current);
      if (!exited) {
        const max = limitRef.current;
        if (max !== null && state.current && state.current.moves >= max) {
          // The last move is used and the level is not done.
          queued.current = null;
          playSfx('fail');
          noteEvent();
          setPopup({ kind: 'outOfMoves' });
          return;
        }
        const queuedDir = queued.current;
        queued.current = null;
        if (queuedDir) swipeRef.current(queuedDir);
        return;
      }
      finished.current = true;
      benchMark('handoff');
      handleVictory(level);
    };
    bus.onTransitionStart = () => {
      // The end-of-level UI is already prepared (setEnd); it simply stays until the new board has landed.
    };
    bus.onTransitionDone = () => {
      const n = nextRef.current;
      if (!n) return;
      const finishedId = levelRef.current?.id ?? n.id - 1;
      // The ball has landed: the saves, the analytics and the freeing of the old board that were waiting may now run, one at a time,
      // and the levels ahead start to be prepared again.
      releaseIdle();
      setWarmPaused(false);
      if (trialEnded.current) {
        setTrialEndId(trialEnded.current);
        trialEnded.current = null;
      }
      setTimeout(() => traceEnd(`${finishedId} -> ${n.id}`), 450);
      // The next board is already on screen and the ball has landed on it: make it the current level.
      setCurrent(n);
      setNext(null);
      setLevelId(n.id);
      setRunKey(0);
      setTimeout(() => setEnd(null), END_UI_EXTRA_MS);

      // After level 5 (and again after level 6 if the player said "later"): the offer of the guided tour.
      const offerTour = shouldOfferTour(getProfile(), finishedId, isDailyLevelId(finishedId));

      // The last level of a step: the chest.
      // (The first step, levels 1 to 5, has no chest: nothing is paid before level 6, and the tour comes instead.)
      if (endsStep(finishedId) && stepOf(finishedId) >= 1 && !isDailyLevelId(finishedId)) {
        const chest = earnPlayed(getProfile(), chestCoins(stepOf(finishedId)));
        const coins = chest.gained;
        updateProfile(() => chest.profile);
        playSfx('chest');
        const info = endRef.current;
        pendingTour.current = offerTour;
        const ctxPlay = playContext();
        pendingPaywall.current = autoOffer(
          getProfile(),
          { completedLevel: finishedId, endsStep: true, inTour: tourRunningRef.current, inTutorial: !!tutorialRef.current, sinceAdSec: ctxPlay.lastAdAt === null ? null : ctxPlay.playSeconds - ctxPlay.lastAdAt },
          Date.now(),
        );
        setPopup({ kind: 'step', step: stepOf(finishedId) + 1, coins, progress: info ? { levelId: info.levelId, picture: info.picture, pieces: info.piecesAfter } : null });
        return;
      }
      if (offerTour) {
        setPopup({ kind: 'tourIntro' });
        return;
      }

      // At most one pop-up per level: a new world, else the starter-pack offer; the notification
      // permission is asked once the player has played a little.
      if (pendingReward.current) {
        setPopup({ kind: 'reward', item: pendingReward.current });
        pendingReward.current = null;
      } else if (isNewWorldStart(n.id)) {
        setPopup({ kind: 'world', levelId: n.id });
      } else if (shouldAskNotificationPermission(getProfile(), finishedId)) {
        updateProfile(notificationPermissionAsked);
        requestNotificationPermission().then(() => syncNotifications(getProfile()));
      }
    };
    return () => {
      bus.onEvent = undefined;
      bus.onSlideDone = undefined;
      bus.onTransitionStart = undefined;
      bus.onTransitionDone = undefined;
    };
  }, [level, bus, handleVictory, arriveLater, router, showWord]);

  const swipe = useCallback(
    (dir: Dir) => {
      const s = state.current;
      if (!level || !s || finished.current || blockedRef.current) return;
      if (limitRef.current !== null && s.moves >= limitRef.current) return;
      if (busy.current) {
        queued.current = dir;
        return;
      }
      const res = applyMove(level, s, dir);
      if (!res) return; // blocked by a wall: not a move
      played.current += dir;
      busy.current = true;
      // Safety net: if the scene never reports the end of a slide, do not stay locked forever.
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        busy.current = false;
      }, 4000);
      for (const [r, c] of res.coins) {
        pendingCoins.current.push(level.features.coins.findIndex(([cr, cc]) => cr === r && cc === c));
      }
      chrono.current.start(Date.now());
      notePlaySwipe();
      bus.hint = null;
      arrowShown.current = false;
      setGuideShow((p) => (p.show === 'none' ? p : { show: 'none' }));
      lastActivity.current = Date.now();
      refreshGuide();
      slideNote = 0;
      setLogoOn((on) => (on ? false : on));
      // Nothing of the interface is redrawn while the ball rolls: the move counter changes when the slide ends.
      setHintMessage((m) => (m === null ? m : null));
      if (tutorial) dismissTutorial();
      bus.slide({ result: res });
    },
    [level, bus, tutorial, dismissTutorial, refreshGuide],
  );

  useLayoutEffect(() => {
    swipeRef.current = swipe;
  });

  // Direction is read once, when the finger lifts, from the whole stroke (and its
  // velocity for very quick flicks): far more reliable than guessing from the first pixels.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(10)
        .maxPointers(1)
        .onEnd((e) => {
          let dx = e.translationX;
          let dy = e.translationY;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) {
            dx = e.velocityX / 20;
            dy = e.velocityY / 20;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
          }
          swipeRef.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
        }),
    [],
  );

  // Developer tool: the bench of the bridge plays levels in a row by itself and writes the report (see render/bench.ts).
  const benchLabel = benchParam ?? '';
  const bench = useBridgeBench({ label: benchLabel, levelRef, state, busy, swipe: (dir) => swipeRef.current(dir), bus });

  // Developer tool: turn round the board with two fingers instead of swiping.
  const { freeCamera } = useFeatures();
  const freeGesture = useMemo(() => freeCameraGesture(bus), [bus]);

  // The scene failed (a render error, or an error of its frame loop): the level is loaded again, the player loses nothing.
  const reloadScene = useCallback(() => {
    bus.clearInput();
    setRunKey((k) => k + 1);
  }, [bus]);
  useFrameErrorGuard(reloadScene);

  const restart = useCallback(() => {
    if (bus.transitioning || finished.current) return;
    // Starting again after having played costs a life (never in the first levels or the daily challenge).
    if ((state.current?.moves ?? 0) > 0 && atStakeRef.current) {
      setPopup({ kind: 'confirmRestart' });
      return;
    }
    setRunKey((k) => k + 1);
  }, [bus]);

  /** The life is lost, and the streak with it (unless the player kept it). */
  const settleLoss = useCallback((keepStreak: boolean) => {
    if (livesOn()) spendLife();
    if (keepStreak) return;
    const r = resetStreak(getProfile());
    if (r.lost > 0) track('streak_lost', { value: r.lost });
    updateProfile(() => r.profile);
  }, []);

  /** Loses a life, after asking about the streak when it is worth keeping; `then` runs once that is settled. */
  const loseLifeThen = useCallback(
    (then: () => void) => {
      const p = getProfile();
      if (protectionOffered(p)) {
        afterLoss.current = then;
        setPopup({ kind: 'saveStreak', value: p.winStreak.current });
        return;
      }
      settleLoss(false);
      then();
    },
    [settleLoss],
  );

  const finishLoss = useCallback(
    (keep: boolean, method?: 'ad' | 'coins') => {
      const value = getProfile().winStreak.current;
      settleLoss(keep);
      if (keep && method) track('streak_saved', { value, method });
      setPopup(null);
      const then = afterLoss.current;
      afterLoss.current = null;
      then?.();
    },
    [settleLoss],
  );

  const saveStreakWithAd = useCallback(() => {
    ads.showRewarded('keep_streak').then((ok) => {
      if (!ok) return;
      const next = saveWithAd(getProfile(), dayKeyOf(new Date()));
      if (!next) return;
      updateProfile(() => next);
      playSfx('streak_saved');
      finishLoss(true, 'ad');
    });
  }, [finishLoss]);

  const saveStreakWithCoins = useCallback(() => {
    const next = saveWithCoins(getProfile());
    if (!next) return;
    updateProfile(() => next);
    playSfx('streak_saved');
    finishLoss(true, 'coins');
  }, [finishLoss]);

  const restartPaid = useCallback(() => {
    setPopup(null);
    loseLifeThen(() => setRunKey((k) => k + 1));
  }, [loseLifeThen]);

  const giveUp = useCallback(() => {
    setPopup(null);
    // Failing a level costs the streak, and a life when there are lives; the first levels and the daily challenge cost nothing.
    const failedLevel = levelRef.current;
    const costs = failedLevel ? failureCostsStreak(failedLevel.id, isDailyLevelId(failedLevel.id)) : false;
    if (!costs) {
      setRunKey((k) => k + 1);
      return;
    }
    loseLifeThen(() => setRunKey((k) => k + 1));
  }, [loseLifeThen]);

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

  // The back button of the phone closes the menu or a pop-up (the level itself is the home screen: there is nothing to leave).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpenRef.current) {
        setMenuOpen(false);
        return true;
      }
      if (popupRef.current) {
        if (popupRef.current.kind === 'tourIntro') {
          // The back button on the tour offer is "later".
          updateProfile(postponeTour);
          releaseHud(true);
        }
        if (popupRef.current.kind !== 'outOfMoves') setPopup(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  /** Shows the next good swipe (an arrow next to the ball). The hint itself is already paid. */
  const showHint = useCallback(
    (method: 'coins' | 'ad') => {
      const s = state.current;
      if (!level || !s || busy.current || finished.current) return;
      hintUsed.current = true;
      track('hint_used', { level: level.id, method });
      // Still on the optimal line? Then the stored solution already knows the answer.
      if (level.solution.startsWith(played.current)) {
        bus.showHint(level.solution[played.current.length] as Dir, 4000);
        return;
      }
      setHintMessage(t('game.searching'));
      setTimeout(() => {
        // The exact search first; on a big open board it gives up, and a quick best-effort search takes over.
        const res = solveFrom(level, s, { maxStates: HINT_MAX_STATES }) ?? solveBeam(level, s, { width: 300, timeMs: 700, maxDepth: 70 });
        const max = limitRef.current;
        if (res && max !== null && s.moves + res.moves.length > max) {
          setHintMessage(t('game.impossible', { count: max }));
        } else if (res) {
          setHintMessage(null);
          bus.showHint(res.moves[0] as Dir, 4000);
        } else {
          setHintMessage(t('game.noHint'));
        }
      }, 30);
    },
    [level, bus],
  );

  const askHint = useCallback(() => {
    if (!level || busy.current || finished.current || bus.transitioning) return;
    // Every tile is painted: there is no arrow to show (and nothing to pay for), only the way out is left.
    if (state.current && state.current.layers >= level.layers) {
      const allPainted = t('game.allPainted');
      setHintMessage(allPainted);
      setTimeout(() => setHintMessage((m) => (m === allPainted ? null : m)), 2500);
      return;
    }
    setPopup({ kind: 'hint' });
  }, [level, bus]);

  const hintWithCoins = useCallback(() => {
    const paid = payHint(getProfile());
    setPopup(null);
    if (!paid) return;
    updateProfile(() => paid);
    showHint('coins');
  }, [showHint]);

  const hintWithAd = useCallback(() => {
    setPopup(null);
    ads.showRewarded(MONETIZATION.hint.adPlacement).then((ok) => ok && showHint('ad'));
  }, [showHint]);

  /** The chest of a step, doubled for a rewarded ad. */
  const doubleChest = useCallback(() => {
    const p = popupRef.current;
    if (!p || p.kind !== 'step') return;
    ads.showRewarded('double_reward').then((ok) => {
      if (!ok) return;
      updateProfile((pr) => earnCoins(pr, p.coins));
      arriveLater(300);
    });
  }, [arriveLater]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((v) => (v && v.width === width && v.height === height ? v : { width, height }));
  }, []);

  // Where the coin counter is (right side of the header), so picked-up coins can fly to it.
  useEffect(() => {
    if (!viewport) return;
    const px = viewport.width - MARGIN - 44;
    const py = insets.top + 8 + HUD_H / 2;
    bus.coinTarget = { x: (2 * px) / viewport.width - 1, y: 1 - (2 * py) / viewport.height };
  }, [bus, viewport, insets.top]);

  // Text bubbles of the level go in the free band above or under the board, never over the walls.
  const bubbleTop = useMemo(() => {
    if (!level || !viewport) return insets.top + HEADER_H + 6;
    const band = boardBandPx(level, viewport.width, viewport.height, margins);
    return bubbleSlot(band, { top: insets.top + HEADER_H, bottom: viewport.height - margins.bottom }, 44);
  }, [level, viewport, margins, insets.top]);
  const decor = (settings ?? DEFAULT_SETTINGS).decor;
  const daily = level ? isDailyLevelId(level.id) : isDaily;
  const hidingButtons = dailyResult !== null;
  // The first five levels, first time: only the title and the bar of the steps (the tour brings the rest in after level 5).
  const minimal = !!level && !daily && level.id <= 5 && !((doneStars[5] ?? 0) > 0);
  // The help of the first levels (see game/guide.ts): an arrow and a hand, or "start again" when the position is lost.
  const guideOn = guideShow.show === 'arrow' && !tourRunning;
  const stuck = guideShow.show === 'restart' && !tourRunning;

  // The moves counter and the menu button are made once per change, so the memoized header is not rebuilt for nothing.
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const movesNode = useMemo(
    () => (
      <HudPop id="moves" index={9} minimal={minimal}>
        <Target id="moves">
          <MovesText moves={moves} limit={limit} />
        </Target>
      </HudPop>
    ),
    [moves, limit, minimal],
  );
  useLayoutEffect(() => {
    if (tracing()) traceWork('GameScreen render+commit', performance.now() - renderStart);
  });

  const startedLevel = moves > 0 && atStake && !end;
  const audio = settings ?? DEFAULT_SETTINGS;
  const setPref = (patch: Partial<Settings>) => {
    const next = { ...audio, ...patch };
    setSettings(next);
    setAudioSettings(next);
    setHapticsEnabled(next.vibrations);
    saveSettings(next);
  };
  const pauseActions: PauseAction[] = [
    { key: 'resume', label: t('pause.resume'), icon: 'play', variant: 'primary', onPress: () => setMenuOpen(false) },
    {
      key: 'restart',
      label: t('lives.restart'),
      icon: 'restart',
      hint: startedLevel ? t('pause.minusLife') : undefined,
      onPress: () => {
        setMenuOpen(false);
        restart();
      },
    },
    {
      key: 'tutorial',
      label: t('settings.replayTutorial'),
      icon: 'school',
      onPress: async () => {
        await replayTutorial();
        setMenuOpen(false);
        router.setParams({ level: '1', daily: '', reset: String(Date.now()) });
      },
    },
    {
      key: 'tour',
      label: t('dev.replayTour'),
      icon: 'hand-wave',
      onPress: () => {
        setMenuOpen(false);
        setTimeout(startTour, 350);
      },
    },
    { key: 'reset', label: t('settings.reset'), icon: 'delete-forever', onPress: () => setResetOpen(true) },
    { key: 'more', label: t('pause.volumes'), icon: 'cog', onPress: () => router.push('/settings') },
  ];
  const pauseToggles: PauseToggle[] = [
    { key: 'music', icon: 'music', offIcon: 'music-off', label: t('settings.music'), on: audio.music, onToggle: () => setPref({ music: !audio.music }) },
    { key: 'sound', icon: 'volume-high', offIcon: 'volume-off', label: t('settings.sfx'), on: audio.sound, onToggle: () => setPref({ sound: !audio.sound }) },
    { key: 'vibrations', icon: 'vibrate', offIcon: 'vibrate-off', label: t('settings.vibrations'), on: audio.vibrations, onToggle: () => setPref({ vibrations: !audio.vibrations }) },
  ];
  // The way into the tester tools (the grid of levels, the challenges, the economy, the clock...) from the menu.
  const pauseDev: PauseAction[] | undefined = testerTools()
    ? [
        { key: 'levels', label: t('tester.pickLevel'), icon: 'flask-outline', onPress: () => router.push('/levels') },
        { key: 'tester', label: t('tester.title'), icon: 'wrench', onPress: () => router.push('/tester') },
      ]
    : undefined;
  const [record, setRecord] = useState<number | null>(null);
  useEffect(() => {
    if (!menuOpen || !level) return;
    loadProgress().then((p) => setRecord(p.moves[level.id] ?? null));
  }, [menuOpen, level?.id]);
  const pauseLines = [
    daily ? t('hud.dailyTitle') : level ? t('hud.level', { id: level.id }) : '',
    limit !== null ? t('game.movesOf', { moves, limit }) : t('game.moves', { count: moves }),
    ...(level && !daily ? [t('map.minimum', { count: level.solution.length })] : []),
    ...(record !== null && !daily ? [t('map.record', { count: record })] : []),
    ...(level && !daily && profile.bestScores[level.id] !== undefined ? [t('pause.bestScore', { score: formatNumber(profile.bestScores[level.id]) })] : []),
    ...(daily && profile.dailyScores[dayKeyOf(new Date())] !== undefined ? [t('pause.bestScoreToday', { score: formatNumber(profile.dailyScores[dayKeyOf(new Date())]) })] : []),
    t('settings.totalScore', { score: formatNumber(totalScore(profile.bestScores)) }),
    ...(!daily && profile.winStreak.current > 0 ? [t('pause.currentStreak', { count: profile.winStreak.current })] : []),
  ].filter(Boolean);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={freeCamera ? freeGesture : gesture}>
        <View style={styles.canvasWrap} onLayout={onLayout}>
          {current && (
            <SceneErrorBoundary onError={reloadScene}>
            <GameCanvas
              current={current}
              next={next}
              runKey={runKey}
              bus={bus}
              decor={decor}
              active={focused && !menuOpen}
              ballSkin={equippedBall}
              paintEffect={equippedPaint}
              onReady={drawn}
              freeCamera={freeCamera}
            />
            </SceneErrorBoundary>
          )}
        </View>
      </GestureDetector>

      {confetti > 0 && viewport && (
        <Confetti key={confetti} width={viewport.width} height={viewport.height} count={44} palette={paintConfetti} />
      )}

      {words.map((w) => (
        <FloatingWord key={w.id} text={w.text} x={w.x} y={w.y} thrill={w.thrill} />
      ))}

      {bench.running && (
        <View pointerEvents="none" style={styles.benchBadge}>
          <Text style={styles.benchText}>{`BENCH ${benchProgress()}`}</Text>
        </View>
      )}
      {bench.summary && (
        <View style={styles.benchBadge}>
          <Text style={styles.benchText}>{bench.summary}</Text>
        </View>
      )}
      {testerTools() && settings?.showPerf && <FpsCounter top={insets.top + 8 + HUD_H + 6} />}

      {level && (
        <>
          <LevelHud
            top={insets.top + 8}
            levelId={level.id}
            daily={daily}
            moves={movesNode}
            shownCoins={shownCoins}
            stars={doneStars}
            onMenu={openMenu}
            minimal={minimal}
            flameBoost={flameBoost}
          />
          <LaunchLogo show={logoOn} top={insets.top + 8 + 45 + 8} />

          {tutorial && !tourRunning && <TutorialBubble text={TUTORIAL_TEXT[tutorial]} top={bubbleTop} onPress={dismissTutorial} />}

          {hintMessage && (
            <View style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{hintMessage}</Text>
            </View>
          )}

          {guideOn && level.id === 1 && moves === 0 && <TutorialBubble text={t('game.swipeToMove')} top={bubbleTop} />}
          {profile.rewards.trial && !end && <TrialBadge levelsLeft={profile.rewards.trial.levelsLeft} bottom={insets.bottom + 12 + 52 + 12 + adsBannerHeight} />}
          {stuck && <TutorialBubble text={t('game.tryAgain')} top={bubbleTop} />}
          {!end && <AdBanner bottom={insets.bottom} levelId={level.id} />}

          {!hidingButtons && (
            <View style={[styles.buttons, { paddingBottom: insets.bottom + 12 + adsBannerHeight }]} pointerEvents="box-none">
              <HudPop id="restart" index={10} minimal={minimal} force={stuck} style={styles.flex}>
                <Attention active={stuck}>
                  <Button3D block variant={stuck ? 'primary' : 'neutral'} icon="restart" label={t('lives.restart')} onPress={restart} />
                </Attention>
              </HudPop>
              <HudPop id="hint" index={11} minimal={minimal} style={styles.flex}>
                <Button3D block variant="primary" icon="lightbulb-on-outline" label={t('game.hint')} onPress={askHint} tourId="hint">
                  <View style={styles.hintCost}>
                    <Text style={styles.hintCostText}>{MONETIZATION.hint.coinCost}</Text>
                    <CoinIcon size={16} />
                  </View>
                </Button3D>
              </HudPop>
            </View>
          )}
        </>
      )}

      {noLife && <NoLivesCard />}
      <HeartPop trigger={heartKey} />

      <Modal visible={showReward} transparent animationType="fade" onRequestClose={() => setShowReward(false)}>
        <DailyRewardCard onClose={() => setShowReward(false)} />
      </Modal>

      {end && viewport && end.showGain && end.total > 0 && (
        // The gain, a single number under the stars, goes to the counter as coins; nothing else is written over the board.
        <RewardBurst
          key={`burst${end.key}`}
          total={end.total}
          count={Math.min(9, Math.max(3, end.total))}
          showLabel={false}
          delay={resultTimings(end.stars).flyAt}
          from={{ x: viewport.width / 2, y: insets.top + HEADER_H + 8 + 62 + 6 + 22 }}
          to={{ x: viewport.width - 56, y: insets.top + 8 + 45 + 8 + 22 }}
        />
      )}

      {end && (
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
      )}

      {dailyResult && (
        <Overlay>
          <Text style={styles.popKicker}>{t('daily.kicker')}</Text>
          <Text style={styles.popTitle}>{dailyResult.alreadyDone ? t('game.alreadyDone') : t('game.challengeDone')}</Text>
          <View style={styles.streakRow}>
            <Icon name="fire" size={24} color={colors.flame} />
            <Text style={styles.popBody}>
              {t('daily.streak', { count: dailyResult.streak })}
            </Text>
          </View>
          {dailyScore && (
            <Text style={styles.popBody}>
              {t('game.scoreLine', { score: formatNumber(dailyScore.score.total) })}{dailyScore.score.perfect ? ` · ${t('result.perfect')}` : ''}{dailyScore.best ? ` · ${t('result.bestScore')}` : ''}
            </Text>
          )}
          {dailyResult.coins > 0 && <CoinAmount amount={`+${dailyResult.coins}`} size={30} textStyle={{ color: colors.coin }} />}
          {dailyResult.skin && <Text style={styles.popBody}>{t('daily.reward.newBall', { name: itemName(dailyResult.skin) })}</Text>}
          {!loadoutLater && <LoadoutOffer day={dayKeyOf(new Date())} onLater={() => setLoadoutLater(true)} />}
          <PrimaryButton
            label={t('common.continue')}
            onPress={() => {
              // Back to the level the player was on, with the result of the challenge on top.
              router.setParams({ daily: '' });
              setDailyResult(null);
              router.push('/daily');
            }}
          />
        </Overlay>
      )}

      <ResetFlow
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirmed={async () => {
          await resetProgress();
          resetHud();
          setAudioSettings(await loadSettings());
          syncNotifications(getProfile());
          setResetOpen(false);
          setMenuOpen(false);
          router.setParams({ level: '', daily: '', reset: String(Date.now()) });
        }}
      />

      {menuOpen && <PauseMenu title={t('settings.title')} lines={pauseLines} actions={pauseActions} toggles={pauseToggles} dev={pauseDev} onClose={() => setMenuOpen(false)} />}

      {!current && levelId !== null && needsGeneration(levelId) && (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>{t('game.preparing', { id: levelId })}</Text>
        </View>
      )}

      {popup?.kind === 'reward' && (
        <Overlay onDismiss={() => setPopup(null)}>
          <Text style={styles.popKicker}>{t('game.worldReward')}</Text>
          <Text style={styles.popTitle}>{itemName(popup.item.id)}</Text>
          <Text style={styles.popBody}>{t(popup.item.kind === 'ball' ? 'game.newBallInShop' : 'game.newPaintInShop')}</Text>
          <PrimaryButton label={t('common.great')} onPress={() => setPopup(null)} />
        </Overlay>
      )}
      {popup?.kind === 'world' && <WorldUnlock levelId={popup.levelId} onClose={() => setPopup(null)} />}
      {popup?.kind === 'starter' && <StarterPackOffer onClose={() => setPopup(null)} />}
      {popup?.kind === 'outOfMoves' && limit !== null && (
        <OutOfMoves limit={limit} adUsed={adMovesUsed.current} lifeAtStake={atStake} onAd={moreMovesWithAd} onCoins={moreMovesWithCoins} onGiveUp={giveUp} />
      )}
      {popup?.kind === 'confirmRestart' && (
        <ConfirmLife title={t('game.restartQuestion')} body={t('game.restartCosts')} confirm={t('game.restartConfirm')} onConfirm={restartPaid} onCancel={() => setPopup(null)} />
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
      {popup?.kind === 'trialEnd' && <TrialEndCard itemId={popup.itemId} onClose={() => setPopup(null)} />}
      {popup?.kind === 'tourIntro' && (
        <Overlay>
          <OutlineText style={styles.stepTitle} width={2.5}>
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
      {popup?.kind === 'saveStreak' && (
        <SaveStreak streak={popup.value} onAd={saveStreakWithAd} onCoins={saveStreakWithCoins} onLose={() => finishLoss(false)} />
      )}
      {popup?.kind === 'hint' && (
        <HintChoice coins={profile.coins} free={profile.freeHints} onCoins={hintWithCoins} onAd={hintWithAd} onCancel={() => setPopup(null)} />
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  benchBadge: { position: 'absolute', left: 12, right: 12, bottom: 90, padding: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.75)' },
  benchText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  root: { flex: 1, backgroundColor: SCENE_BG },
  canvasWrap: { flex: 1 },
  flex: { flex: 1 },
  hud: {
    position: 'absolute',
    left: MARGIN,
    right: MARGIN,
    height: HUD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Both pills are exactly as high as the HUD; the title pill is centred on the screen, whatever sits on either side.
  pill: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 12, 34, 0.62)',
  },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillValue: { fontSize: fontSizes.lg },
  // The middle takes the room that is left between the menu and the streak, so it can never go under them.
  hudCenter: { flex: 1, minWidth: 0, height: HUD_H, alignItems: 'center', justifyContent: 'center' },
  titlePill: { alignItems: 'center', paddingHorizontal: 12, maxWidth: '100%' },
  levelText: { fontSize: fontSizes.lg, lineHeight: 22 },
  laterHit: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  later: { color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSizes.sm, fontWeight: '700' },
  stepTitle: { fontSize: fontSizes.xl, textAlign: 'center' },
  stepBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  wordWrap: { position: 'absolute', width: 240, alignItems: 'center' },
  word: { textAlign: 'center', fontSize: fontSizes.xl },
  movesText: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '600', lineHeight: 15 },
  toast: { position: 'absolute', top: '16%', alignSelf: 'center', backgroundColor: colors.overlay, padding: 10, borderRadius: 12 },
  toastText: { color: colors.text, fontSize: fontSizes.sm },
  buttons: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, paddingHorizontal: MARGIN },
  hintCost: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hintCostText: { color: colors.onGold, fontSize: fontSizes.sm, fontWeight: '700' },
  fps: { position: 'absolute', right: MARGIN, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.overlay },
  fpsText: { color: colors.greenLight, fontSize: fontSizes.xs, fontWeight: '700' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  popKicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 2 },
  popTitle: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  popBody: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
});
