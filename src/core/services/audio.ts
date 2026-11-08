import { benchTimed } from '../render/bench';
import { testerTools } from '../config/tester';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import { AppState } from 'react-native';

import { runWhenIdle } from './idleQueue';
import { DEFAULT_MUSIC_SLIDER, DEFAULT_SFX_SLIDER, MAX_VOICES, MUSIC_FADE_SECONDS, MUSIC_VOLUME, PLIP_NOTES, RateLimiter, STAR_NOTES, VoiceBudget } from '../soundRules';

/**
 * The sound engine (expo-audio). Every effect is a short AAC file made by scripts/prepare-audio.js. EVERY player is a native object
 * that the phone must keep loaded, and it only keeps a handful: with about fifty players made at start-up (what this engine used to
 * do) most of them never loaded, and the game was silent most of the time. So there are few players: the music first, two files for
 * the paint "plip" (the 12 notes are these two played at different speeds), and the effects on demand, at most `SFX_POOLS` sounds
 * alive at once (the least recently used is let go). Playing is a quick call to the native player; it never waits.
 *
 * - at most 8 sounds at once (the least important are the ones left out), and the same sound at most 20 times a second;
 * - the music loops, with its own level for the menus, the game and the simulated ads, glides between them in 0.5 s, stops
 *   when the app goes to the background and comes back with it;
 * - the silent switch of the phone is respected (silent: no game sound, the vibrations stay), and the music of another app is not cut
 *   ("mix with others");
 * - the session is set up again (and the music relaunched) every time the app comes back to the foreground, after an ad, after a
 *   panel closes, and whenever a light check finds the music stopped while it should play; a player in error is built again in the
 *   background (see `rebuild`), never during a transition; every failure is kept for the tester's audio diagnostic.
 */

// Metro needs static require() paths.
const PLIP_A = require('../../../assets/audio/sfx/plip_a.m4a');
const PLIP_B = require('../../../assets/audio/sfx/plip_b.m4a');
/** Semitones of the 12 notes above the plip file A (C major pentatonic over two octaves, taken down 7 semitones). */
const PLIP_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26].map((n) => n - 7);

const SOURCES = {
  impact_soft: require('../../../assets/audio/sfx/impact_soft.m4a'),
  impact_hard: require('../../../assets/audio/sfx/impact_hard.m4a'),
  coin: require('../../../assets/audio/sfx/coin.m4a'),
  door_open: require('../../../assets/audio/sfx/door_open.m4a'),
  win: require('../../../assets/audio/sfx/win.m4a'),
  fail: require('../../../assets/audio/sfx/fail.m4a'),
  teleport: require('../../../assets/audio/sfx/teleport.m4a'),
  break: require('../../../assets/audio/sfx/break.m4a'),
  bomb: require('../../../assets/audio/sfx/bomb.m4a'),
  stop: require('../../../assets/audio/sfx/stop.m4a'),
  click: require('../../../assets/audio/sfx/click.m4a'),
  popup_open: require('../../../assets/audio/sfx/popup_open.m4a'),
  popup_close: require('../../../assets/audio/sfx/popup_close.m4a'),
  purchase: require('../../../assets/audio/sfx/purchase.m4a'),
  chest: require('../../../assets/audio/sfx/chest.m4a'),
  world: require('../../../assets/audio/sfx/world.m4a'),
  tier: require('../../../assets/audio/sfx/tier.m4a'),
  piggy_break: require('../../../assets/audio/sfx/piggy_break.m4a'),
  streak_saved: require('../../../assets/audio/sfx/streak_saved.m4a'),
  plop: require('../../../assets/audio/sfx/plop.m4a'),
  rumble: require('../../../assets/audio/sfx/rumble.m4a'),
  clac: require('../../../assets/audio/sfx/clac.m4a'),
  tok: require('../../../assets/audio/sfx/tok.m4a'),
} as const;
/** The air of the ball in a chute: one looped player, whose speed follows the ball (see `setWhoosh`). */
const WHOOSH_SOURCE = require('../../../assets/audio/sfx/whoosh.m4a');
const MUSIC_SOURCE = require('../../../assets/audio/paint_maze_ambiance_douce.m4a');

export type SfxName = keyof typeof SOURCES;

/** Whether the silent switch of the iPhone mutes the game: yes (the vibrations are not sound, they stay). */
const RESPECT_SILENT_SWITCH = true;

/** What went wrong, newest last (the audio diagnostic of the tester tools shows it). */
const MAX_ERRORS = 8;
const errors: string[] = [];
const warn = (what: string, err: unknown) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${what}: ${err instanceof Error ? err.message : String(err)}`;
  errors.push(line);
  if (errors.length > MAX_ERRORS) errors.shift();
  if (testerTools()) console.log(`[audio] ${what} failed:`, err);
};

/** Length of each sound (ms), to count the voices in use; and how much each one matters when all 8 are busy. */
const DURATION: Record<SfxName | 'plip', number> = {
  impact_soft: 270, impact_hard: 320, coin: 300, door_open: 550, win: 1150, fail: 380, teleport: 620, break: 790, bomb: 540, stop: 190,
  click: 200, popup_open: 230, popup_close: 220, purchase: 500, chest: 620, world: 1330, tier: 1000, piggy_break: 810, streak_saved: 880, plip: 300, plop: 200, rumble: 800, clac: 120, tok: 160,
};
const PRIORITY: Record<SfxName | 'plip', number> = {
  win: 9, world: 9, tier: 8, piggy_break: 8, streak_saved: 8, purchase: 7, chest: 7, fail: 7, door_open: 7, bomb: 6, break: 6,
  impact_hard: 5, impact_soft: 5, stop: 5, teleport: 5, plop: 5, rumble: 6, clac: 4, tok: 5, coin: 4, popup_open: 3, popup_close: 3, click: 2, plip: 1,
};
/** Players kept for each sound: one, two for the ones that overlap most. The two plip files have 2 each. */
const VOICES: Partial<Record<SfxName | 'plip', number>> = { plip: 2 };
/** How many different effects may be alive at once (see the header): the least recently used one is let go. */
const SFX_POOLS = 6;
/** Effects made at start-up (the ones heard first and most often); the others are made the first time they are needed. */
const WARM: SfxName[] = ['impact_soft', 'impact_hard', 'coin', 'click'];

export type AudioSettings = { music: boolean; sound: boolean; musicVolume: number; sfxVolume: number };

type Pool = { players: AudioPlayer[]; next: number };
/** The effect pools, in order of use (the first is the least recently used). */
const pools = new Map<SfxName, Pool>();
/** The two plip pools: file A, file B. */
let plipPools: Pool[] = [];
let music: AudioPlayer | null = null;
let whoosh: AudioPlayer | null = null;
let ready: Promise<void> | null = null;

let settings: AudioSettings = { music: true, sound: true, musicVolume: DEFAULT_MUSIC_SLIDER, sfxVolume: DEFAULT_SFX_SLIDER };
/** Which screens want music, and what the player is doing (the menu level, the game level, or an ad). */
const wanted = new Set<string>();
let context: keyof typeof MUSIC_VOLUME = 'menu';
let adPlaying = false;
let inBackground = false;

/**
 * The plip plays once per painted tile: dozens of native calls in a long slide. If one of them turns out to block (a player
 * that has to wake up, a slow phone), the plips are dropped for the rest of the session rather than make the slide stutter;
 * the other sounds are rare enough to stay.
 */
const SLOW_CALL_MS = 8;
const SLOW_CALLS_ALLOWED = 3;
let slowCalls = 0;
export const plipsDisabled = () => slowCalls >= SLOW_CALLS_ALLOWED;
/** The last volume set on each player: setting the same one again is a native call for nothing. */
const lastVolume = new WeakMap<AudioPlayer, number>();

const limiter = new RateLimiter();
const budget = new VoiceBudget();

/** What each player plays: a player that throws is built again from the same file. */
const sourceOf = new WeakMap<AudioPlayer, number>();

const bornAt = new WeakMap<AudioPlayer, number>();

function makePlayer(source: number): AudioPlayer {
  const p = createAudioPlayer(source);
  sourceOf.set(p, source);
  bornAt.set(p, Date.now());
  return p;
}
const makePool = (source: number, count: number): Pool => ({ players: Array.from({ length: count }, () => makePlayer(source)), next: 0 });

/** The two plip pools (file A and file B), made at start-up and again if the effects were let go. */
function makePlipPools() {
  try {
    plipPools = [PLIP_A, PLIP_B].map((src) => {
      const pool = makePool(src, VOICES.plip ?? 1);
      // The note is the speed of the file: no pitch correction when the rate changes.
      pool.players.forEach((p) => {
        p.shouldCorrectPitch = false;
      });
      return pool;
    });
  } catch (err) {
    warn('loading the plips', err);
    plipPools = [];
  }
}

/** The pool of an effect: made the first time it is needed, and moved to the end of the line of use; the oldest one is let go. */
function getPool(name: SfxName): Pool | undefined {
  const existing = pools.get(name);
  if (existing) {
    pools.delete(name);
    pools.set(name, existing);
    return existing;
  }
  try {
    const pool = makePool(SOURCES[name], VOICES[name] ?? 1);
    pools.set(name, pool);
    if (pools.size > SFX_POOLS) {
      const oldest = pools.keys().next().value as SfxName;
      const gone = pools.get(oldest);
      pools.delete(oldest);
      // Let go of it when the game is quiet (never in the middle of a transition).
      runWhenIdle(() =>
        gone?.players.forEach((p) => {
          try {
            p.remove();
          } catch {
            // Already gone.
          }
        }),
      );
    }
    return pool;
  } catch (err) {
    warn(`making the player of ${name}`, err);
    return undefined;
  }
}

/** The session: 'ok' once it has been set up, 'error' when the last attempt failed. */
let sessionState: 'none' | 'ok' | 'error' = 'none';
let lastSound = '';
let lastSoundAt = 0;
let rebuilt = 0;

/** (Re)sets the audio session up: ambient (silent switch respected), mixing with other apps, no playback in the background. */
export async function configureSession(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: !RESPECT_SILENT_SWITCH, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    await setIsAudioActiveAsync(true);
    sessionState = 'ok';
  } catch (err) {
    sessionState = 'error';
    warn('audio session', err);
  }
}

/** Loads everything once. Safe to call from several places. */
export function initAudio(): Promise<void> {
  ready ??= (async () => {
    await configureSession();
    // The music first: it is the one that must never be missing.
    try {
      music = makePlayer(MUSIC_SOURCE);
      music.loop = true;
      music.volume = 0;
    } catch (err) {
      warn('loading the music', err);
      music = null;
    }
    makePlipPools();
    for (const name of WARM) getPool(name);
    primePlayers();
    // Only the real background counts: "inactive" is a system panel passing over the game (the tracking question, the consent form,
    // the notification centre...) and must not stop the music.
    AppState.addEventListener('change', (state) => {
      inBackground = state === 'background';
      if (state === 'active') reviveAudio('foreground');
      else if (state === 'background') applyMusic();
    });
    applyMusic();
    startWatchdog();
  })();
  return ready;
}

/**
 * Wakes every effect player once, silently, a few at a time right after start-up: the first time a player is played is the slow
 * one (the system has to open and decode the file), and it must not happen in the middle of a slide.
 */
function primePlayers() {
  const all: AudioPlayer[] = [...plipPools, ...pools.values()].flatMap((p) => p.players);
  let i = 0;
  const step = () => {
    for (const p of all.slice(i, i + 3)) {
      try {
        p.volume = 0;
        p.play();
        setTimeout(() => {
          try {
            p.pause();
            p.seekTo(0).catch(() => {});
          } catch {
            // Gone.
          }
        }, 60);
      } catch {
        // A player that cannot be primed will simply be slow once.
      }
    }
    i += 3;
    if (i < all.length) setTimeout(step, 80);
  };
  setTimeout(step, 600);
}

/** The music settings and the effects settings, from the storage (and again whenever they change). */
export function setAudioSettings(next: Partial<AudioSettings>) {
  settings = { ...settings, ...next };
  applyMusic();
}
export const getAudioSettings = (): AudioSettings => settings;

/* ------------------------------------------------------------------------------------------------ effects */

function play(pool: Pool | undefined, key: string, volume: number, priority: number, duration: number, rate?: number) {
  if (!settings.sound || !pool) return;
  const now = Date.now();
  if (!limiter.allow(key, now) || !budget.request(now, duration, priority)) return;
  const index = pool.next;
  const p = pool.players[index];
  pool.next = (index + 1) % pool.players.length;
  const t0 = performance.now();
  try {
    const v = Math.round(Math.max(0, Math.min(1, volume * settings.sfxVolume)) * 20) / 20;
    if (lastVolume.get(p) !== v) {
      p.volume = v;
      lastVolume.set(p, v);
    }
    if (rate !== undefined) p.setPlaybackRate(rate);
    // Always from the start: a player that has played before is at its end (or in the middle, when it is played again quickly).
    p.seekTo(0).catch(() => {});
    p.play();
    lastSound = key;
    lastSoundAt = now;
  } catch (err) {
    warn(`playing ${key}`, err);
    rebuild(pool, index, key, 'threw');
  }
  if (performance.now() - t0 > SLOW_CALL_MS && key === 'plip') slowCalls++;
}

const rebuilding = new WeakSet<AudioPlayer>();
/** Replaces the player at `index` by a new one made from the same file, when the game is quiet (never during a transition). */
function rebuild(pool: Pool, index: number, label: string, why: string) {
  const old = pool.players[index];
  if (rebuilding.has(old)) return;
  rebuilding.add(old);
  if (why !== 'restart') warn(`${label} player to rebuild`, why);
  runWhenIdle(() => {
    const source = sourceOf.get(old);
    if (source === undefined || pool.players[index] !== old) return;
    try {
      old.remove();
    } catch {
      // Already gone.
    }
    try {
      const fresh = makePlayer(source);
      pool.players[index] = fresh;
      rebuilt++;
      wake(fresh);
    } catch (err) {
      warn(`${label} rebuild`, err);
    }
  });
}

/** Wakes one player silently (see primePlayers). */
function wake(p: AudioPlayer) {
  try {
    p.volume = 0;
    p.play();
    setTimeout(() => {
      try {
        p.pause();
        p.seekTo(0).catch(() => {});
      } catch {
        // Gone.
      }
    }, 60);
  } catch {
    // It will simply be slow once.
  }
}

/** Plays a sound effect. `volume` (0-1) is relative to the effects volume of the settings. */
export function playSfx(name: SfxName, volume = 1) {
  benchTimed(`sfx ${name}`, () => play(getPool(name), name, volume, PRIORITY[name], DURATION[name]));
  // A panel has just closed: a good moment to check that the audio session is still alive (light: at most every 2 s).
  if (name === 'popup_close') reviveAudio('panel', false);
}

/**
 * The whoosh of a ball in a chute: call it every frame of the ride with the speed of the ball (0 to 1); the loop starts the first time,
 * its volume and its pitch follow the speed, and `stopWhoosh` ends it. One player, never created during a game; a call is cheap
 * because the volume and the rate are only set when they have changed enough to be heard.
 */
let whooshOn = false;
let whooshVolume = -1;
let whooshRate = -1;
export function setWhoosh(speed: number) {
  if (!settings.sound) return;
  try {
    // Made the first time a ball rides a chute (it is rare, and one more player kept loaded all game long is one too many).
    if (!whoosh) {
      whoosh = createAudioPlayer(WHOOSH_SOURCE);
      whoosh.loop = true;
      whoosh.volume = 0;
      whoosh.shouldCorrectPitch = false;
    }
    const w = whoosh;
    const volume = Math.round(Math.min(1, 0.35 + 0.65 * speed) * 0.5 * settings.sfxVolume * 20) / 20;
    const rate = Math.round((0.8 + 0.7 * speed) * 20) / 20;
    if (!whooshOn) {
      whooshOn = true;
      w.volume = volume;
      w.setPlaybackRate(rate);
      w.play();
    } else {
      if (volume !== whooshVolume) w.volume = volume;
      if (rate !== whooshRate) w.setPlaybackRate(rate);
    }
    whooshVolume = volume;
    whooshRate = rate;
  } catch (err) {
    warn('whoosh', err);
  }
}

export function stopWhoosh() {
  const w = whoosh;
  if (!w || !whooshOn) return;
  whooshOn = false;
  whooshVolume = -1;
  whooshRate = -1;
  try {
    w.volume = 0;
    w.pause();
    w.seekTo(0).catch(() => {});
  } catch (err) {
    warn('stopping the whoosh', err);
  }
}

/** The pool and the speed of a note (0-11): the low half is file A, the high half file B (an octave higher), each at its own speed. */
function plipNote(note: number): { pool: Pool | undefined; rate: number } {
  if (plipPools.length === 0) makePlipPools();
  const i = Math.max(0, Math.min(PLIP_NOTES - 1, note));
  const semitones = PLIP_SEMITONES[i];
  const high = semitones > 5;
  return { pool: plipPools[high ? 1 : 0], rate: Math.pow(2, (semitones - (high ? 12 : 0)) / 12) };
}

/** The paint plip of the `note`-th step (0-11) of the scale. */
export function playPlip(note: number) {
  if (plipsDisabled()) return;
  const { pool, rate } = plipNote(note);
  benchTimed('sfx plip', () => play(pool, 'plip', 0.9, PRIORITY.plip, DURATION.plip, rate));
}

/** The note of a star (0, 1, 2) when it appears: three rising notes of the paint scale. */
export function playStarNote(star: 0 | 1 | 2) {
  const { pool, rate } = plipNote(STAR_NOTES[star]);
  play(pool, `star${star}`, 1, 6, 300, rate);
}

/* ------------------------------------------------------------------------------------------------ music */

let level = 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

const targetVolume = () => (adPlaying ? MUSIC_VOLUME.ad : MUSIC_VOLUME[context]) * settings.musicVolume;

function fadeTo(target: number, then?: () => void) {
  if (!music) return;
  if (fadeTimer) clearInterval(fadeTimer);
  const from = level;
  const started = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - started) / (MUSIC_FADE_SECONDS * 1000));
    level = from + (target - from) * k;
    try {
      if (music) music.volume = Math.max(0, Math.min(1, level));
    } catch {
      // Gone.
    }
    if (k >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      then?.();
    }
  }, 40);
}

const musicShouldPlay = () => settings.music && wanted.size > 0 && !inBackground && settings.musicVolume > 0;
/**
 * Whether the music has been told to play. NOT the `playing` flag of the player: natively it is only true once the sound is really
 * coming out (AVPlayer `.playing`), so it is false for a moment after every `play()` (loading, buffering). `paused` (the speed is 0)
 * is the one that says the player was stopped, by us or by the system.
 */
const musicRunning = (m: AudioPlayer) => !m.paused;

/** Starts, stops or re-levels the music for what the player is doing now. */
function applyMusic() {
  const m = music;
  if (!m) return;
  try {
    if (musicShouldPlay()) {
      if (!musicRunning(m)) {
        level = 0;
        m.volume = 0;
        m.play();
      }
      fadeTo(targetVolume());
    } else if (musicRunning(m)) {
      fadeTo(0, () => {
        try {
          if (!musicShouldPlay()) m.pause();
        } catch {
          // Gone.
        }
      });
    }
  } catch (err) {
    warn('music', err);
  }
}

/**
 * Sets the session up again and relaunches the music when it should be playing: the system can stop it without telling us (a call, an
 * alarm, Siri, the app coming back from the background, the end of an ad) and the flag `playing` of the player is then not to be
 * trusted. `hard` pauses and plays again (used when the music is known to have been stopped); the light one only plays.
 */
let lastReviveAt = 0;
let lastRevive = '';
export function reviveAudio(reason: string, hard = true) {
  const now = Date.now();
  if (!hard && now - lastReviveAt < 2000) return;
  lastReviveAt = now;
  lastRevive = reason;
  void configureSession().then(() => {
    const m = music;
    if (!m || !musicShouldPlay()) return;
    try {
      if (hard) {
        if (musicRunning(m)) m.pause();
        level = 0;
        m.volume = 0;
      }
      m.play();
      fadeTo(targetVolume());
    } catch (err) {
      warn(`reviving the music (${reason})`, err);
      rebuildMusic('threw');
    }
  });
}

/** Every few seconds: the music that should play but does not (or is stuck on the same second) is started again; a player that throws is replaced. */
const WATCHDOG_MS = 4000;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastMusicTime = -1;
let musicHeals = 0;

/** Lets go of every effect player (the plips and the effects are made again by the next sound). */
function releaseEffects() {
  const all = [...plipPools, ...pools.values()].flatMap((pool) => pool.players);
  pools.clear();
  plipPools = [];
  for (const p of all) {
    try {
      p.remove();
    } catch {
      // Already gone.
    }
  }
  if (whoosh) {
    try {
      whoosh.remove();
    } catch {
      // Already gone.
    }
    whoosh = null;
  }
}

function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    const m = music;
    if (!m || !musicShouldPlay()) {
      lastMusicTime = -1;
      return;
    }
    try {
      // A music player that is still not loaded 5 seconds after it was made means the phone could not load it (too many players
      // alive): every effect is let go (they are made again when needed) and the music is made again, alone.
      if (!m.isLoaded && Date.now() - (bornAt.get(m) ?? Date.now()) > 5000 && musicHeals < 3) {
        musicHeals++;
        warn('music not loaded', `letting the effects go (try ${musicHeals})`);
        releaseEffects();
        rebuildMusic('not loaded');
        return;
      }
      const t = m.currentTime;
      const stuck = musicRunning(m) && t === lastMusicTime;
      lastMusicTime = t;
      if (!musicRunning(m) || stuck) {
        warn('music', stuck ? 'stuck, started again' : 'stopped, started again');
        reviveAudio('watchdog');
      }
    } catch (err) {
      warn('music check', err);
      rebuildMusic('threw');
    }
  }, WATCHDOG_MS);
}

/** The music player is replaced by a new one (never two at once: the old one is removed first). */
function rebuildMusic(why: string) {
  warn('music player to rebuild', why);
  runWhenIdle(() => {
    try {
      music?.remove();
    } catch {
      // Gone.
    }
    try {
      const m = makePlayer(MUSIC_SOURCE);
      m.loop = true;
      m.volume = 0;
      music = m;
      level = 0;
      rebuilt++;
      applyMusic();
    } catch (err) {
      music = null;
      warn('music rebuild', err);
    }
  });
}

/** A screen asks for the music or lets it go. Going from one screen to the next does not restart it. */
export function wantMusic(on: boolean, screen: string) {
  if (on) wanted.add(screen);
  else wanted.delete(screen);
  applyMusic();
}

/** The music is a little quieter in a level than in the menus. */
export function setMusicContext(next: keyof typeof MUSIC_VOLUME) {
  context = next;
  applyMusic();
}

/** During a (simulated) rewarded ad the music goes down to make room. */
export function setAdPlaying(on: boolean) {
  const was = adPlaying;
  adPlaying = on;
  applyMusic();
  // The ad (real or simulated) may have taken the session: when it ends, take it back.
  if (was && !on) reviveAudio('ad');
}

export const MAX_SIMULTANEOUS_SOUNDS = MAX_VOICES;

/* ------------------------------------------------------------------------------------------------ diagnostic (tester tools) */

export type AudioDiagnostic = {
  session: string;
  musicPlaying: boolean;
  musicWanted: boolean;
  musicLevel: number;
  musicSetting: boolean;
  musicVolume: number;
  sfxSetting: boolean;
  sfxVolume: number;
  lastSound: string;
  lastSoundAgoMs: number;
  players: number;
  rebuilt: number;
  lastRevive: string;
  errors: string[];
};

export function audioDiagnostic(): AudioDiagnostic {
  let musicPlaying = false;
  try {
    musicPlaying = music ? musicRunning(music) : false;
  } catch {
    // Gone.
  }
  const players = [...plipPools, ...pools.values()].reduce((n, p) => n + p.players.length, 0);
  return {
    session: sessionState,
    musicPlaying,
    musicWanted: musicShouldPlay(),
    musicLevel: Math.round(level * 100) / 100,
    musicSetting: settings.music,
    musicVolume: settings.musicVolume,
    sfxSetting: settings.sound,
    sfxVolume: settings.sfxVolume,
    lastSound: lastSound || '-',
    lastSoundAgoMs: lastSoundAt ? Date.now() - lastSoundAt : -1,
    players,
    rebuilt,
    lastRevive: lastRevive || '-',
    errors: [...errors],
  };
}

/** "Tester un son": plays a coin, whatever the rate limiter says. */
export function testSound() {
  limiter.allow('coin', Date.now() + 1000);
  play(getPool('coin'), 'coin', 1, 9, DURATION.coin);
}

/** "Relancer l'audio": the session again, the music again, and every effect player built again in the background. */
export function restartAudio() {
  slowCalls = 0;
  reviveAudio('manual');
  for (const pool of [...plipPools, ...pools.values()]) pool.players.forEach((_, i) => rebuild(pool, i, 'manual', 'restart'));
}
