/**
 * The sound engine (services/audio.ts) against a fake expo-audio: the session, the settings that apply at once, the music that comes
 * back (foreground, ad, panel, a system stop), the effects wound back before each play, a dead player built again, and the defaults.
 */
type FakePlayer = {
  playing: boolean;
  paused: boolean;
  currentTime: number;
  volume: number;
  loop: boolean;
  isLoaded: boolean;
  calls: string[];
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  setPlaybackRate: jest.Mock;
  shouldCorrectPitch: boolean;
};

const mockCreated: FakePlayer[] = [];
const mockSetAudioMode = jest.fn(() => Promise.resolve());
const mockSetActive = jest.fn(() => Promise.resolve());

jest.mock('expo-audio', () => ({
  setAudioModeAsync: (...a: unknown[]) => (mockSetAudioMode as unknown as (...x: unknown[]) => Promise<void>)(...a),
  setIsAudioActiveAsync: (...a: unknown[]) => (mockSetActive as unknown as (...x: unknown[]) => Promise<void>)(...a),
  createAudioPlayer: () => {
    const p: FakePlayer = {
      playing: false,
      paused: true,
      currentTime: 0,
      volume: 1,
      loop: false,
      isLoaded: true,
      calls: [],
      shouldCorrectPitch: true,
      play: jest.fn(() => {
        p.calls.push('play');
        p.playing = true;
        p.paused = false;
      }),
      pause: jest.fn(() => {
        p.calls.push('pause');
        p.playing = false;
        p.paused = true;
      }),
      seekTo: jest.fn(() => {
        p.calls.push('seekTo');
        return Promise.resolve();
      }),
      remove: jest.fn(),
      setPlaybackRate: jest.fn(),
    };
    mockCreated.push(p);
    return p;
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

type Audio = typeof import('../src/core/services/audio');
type Settings = typeof import('../src/core/storage/settings');

let audio: Audio;
let appStateHandler: ((state: string) => void) | null = null;

const flush = async (ms = 0) => {
  await jest.advanceTimersByTimeAsync(ms);
};

/** The two players that loop are the music (made first) and the whoosh. */
const musicPlayer = () => mockCreated.filter((p) => p.loop)[0];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.resetModules();
  mockCreated.length = 0;
  mockSetAudioMode.mockClear();
  mockSetActive.mockClear();
  appStateHandler = null;
  // The same registry as the engine's (the modules were just reset).
  const { AppState } = require('react-native') as typeof import('react-native');
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appStateHandler = fn;
    return { remove: jest.fn() };
  }) as never);
  audio = require('../src/core/services/audio');
  audio.wantMusic(true, 'app');
  await audio.initAudio();
  await flush(5000);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the audio session', () => {
  test('is set up at start: silent switch respected, mixing with other apps, nothing in the background', () => {
    expect(mockSetAudioMode).toHaveBeenCalledWith({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    expect(mockSetActive).toHaveBeenCalledWith(true);
    expect(audio.audioDiagnostic().session).toBe('ok');
  });

  test('the music starts when the app wants it', () => {
    expect(musicPlayer().playing).toBe(true);
    expect(musicPlayer().loop).toBe(true);
  });
});

describe('settings apply at once', () => {
  test('music off stops it, music on plays it again', async () => {
    const m = musicPlayer();
    audio.setAudioSettings({ music: false });
    await flush(800);
    expect(m.playing).toBe(false);
    audio.setAudioSettings({ music: true });
    await flush(100);
    expect(m.playing).toBe(true);
  });

  test('effects off is silent, effects on is heard at the next sound', async () => {
    audio.setAudioSettings({ sound: false });
    const before = mockCreated.reduce((n, p) => n + p.play.mock.calls.length, 0);
    audio.playSfx('coin');
    expect(mockCreated.reduce((n, p) => n + p.play.mock.calls.length, 0)).toBe(before);
    audio.setAudioSettings({ sound: true });
    await flush(100);
    audio.playSfx('coin');
    expect(mockCreated.reduce((n, p) => n + p.play.mock.calls.length, 0)).toBe(before + 1);
  });
});

describe('the music comes back', () => {
  test('on return to the foreground, even if the system stopped it behind our back', async () => {
    const m = musicPlayer();
    appStateHandler?.('background');
    await flush(800);
    expect(m.playing).toBe(false);
    mockSetAudioMode.mockClear();
    appStateHandler?.('active');
    await flush(800);
    expect(mockSetAudioMode).toHaveBeenCalled();
    expect(m.playing).toBe(true);
  });

  test('after an ad', async () => {
    const m = musicPlayer();
    audio.setAdPlaying(true);
    await flush(800);
    // The ad took the session: the music is stopped by the system.
    m.playing = false;
    m.paused = true;
    mockSetAudioMode.mockClear();
    audio.setAdPlaying(false);
    await flush(800);
    expect(mockSetAudioMode).toHaveBeenCalled();
    expect(m.playing).toBe(true);
  });

  test('after a panel closes', async () => {
    const m = musicPlayer();
    m.playing = false;
    m.paused = true;
    mockSetAudioMode.mockClear();
    audio.playSfx('popup_close');
    await flush(800);
    expect(mockSetAudioMode).toHaveBeenCalled();
    expect(m.playing).toBe(true);
  });

  test('the light check starts it again when it stopped for no reason', async () => {
    const m = musicPlayer();
    m.playing = false;
    m.paused = true;
    await flush(4500);
    expect(m.playing).toBe(true);
    expect(audio.audioDiagnostic().errors.join(' ')).toContain('music');
  });
});

describe('few players, the music first', () => {
  test('the music is the first player made, and only a handful exist after start-up', () => {
    expect(mockCreated[0].loop).toBe(true);
    expect(mockCreated.length).toBeLessThanOrEqual(14);
  });

  test('however many different effects are played, no more than the cap are alive', async () => {
    const names = ['impact_soft', 'impact_hard', 'coin', 'click', 'stop', 'win', 'fail', 'teleport', 'break', 'bomb', 'chest', 'world', 'tier'] as const;
    for (const n of names) {
      audio.playSfx(n);
      await flush(150);
    }
    await flush(2000);
    const alive = mockCreated.filter((p) => p.remove.mock.calls.length === 0).length;
    // music + 4 plip players + at most 6 effects (+1 for the whoosh when it is used)
    expect(alive).toBeLessThanOrEqual(12);
  });

  test('a note of the plip is a speed of one of two files, not a file of its own', () => {
    const before = mockCreated.length;
    for (let i = 0; i < 12; i++) audio.playPlip(i);
    expect(mockCreated.length).toBe(before);
  });
});

describe('the effects', () => {
  test('are wound back to the start before each play', () => {
    audio.playSfx('coin');
    const p = mockCreated.find((q) => q.calls.slice(-2).join() === 'seekTo,play' && !q.loop);
    expect(p).toBeDefined();
  });

  test('a player that throws is replaced and the failure is kept for the diagnostic', async () => {
    const effects = mockCreated.filter((p) => !p.loop);
    effects.forEach((p) =>
      p.play.mockImplementation(() => {
        throw new Error('native player released');
      }),
    );
    audio.playSfx('coin');
    await flush(500);
    const d = audio.audioDiagnostic();
    expect(d.errors.some((e) => e.includes('native player released'))).toBe(true);
    expect(d.rebuilt).toBeGreaterThan(0);
    expect(effects.some((p) => p.remove.mock.calls.length > 0)).toBe(true);
  });

  test('"Relancer l\'audio" builds the players again and starts the session again', async () => {
    mockSetAudioMode.mockClear();
    audio.restartAudio();
    await flush(5000);
    expect(mockSetAudioMode).toHaveBeenCalled();
    expect(audio.audioDiagnostic().rebuilt).toBeGreaterThan(5);
  });

  test('the diagnostic says what was played last', () => {
    audio.testSound();
    const d = audio.audioDiagnostic();
    expect(d.lastSound).toBe('coin');
    expect(d.players).toBeGreaterThan(5);
  });
});

describe('the saved settings', () => {
  let settings: Settings;
  beforeEach(() => {
    settings = require('../src/core/storage/settings');
  });

  test('nothing saved, or garbage: the defaults', () => {
    expect(settings.sanitizeSettings(null)).toEqual(settings.DEFAULT_SETTINGS);
    expect(settings.sanitizeSettings({})).toEqual(settings.DEFAULT_SETTINGS);
    expect(settings.sanitizeSettings('x')).toEqual(settings.DEFAULT_SETTINGS);
  });

  test('a missing field takes its default, the others are kept', () => {
    const s = settings.sanitizeSettings({ music: false, sfxVolume: 0.4 });
    expect(s.music).toBe(false);
    expect(s.sfxVolume).toBe(0.4);
    expect(s.sound).toBe(settings.DEFAULT_SETTINGS.sound);
    expect(s.musicVolume).toBe(settings.DEFAULT_SETTINGS.musicVolume);
    expect(s.vibrations).toBe(true);
  });

  test('corrupt volumes are put right: not a number, out of range, or stuck at 0 with the switch on', () => {
    const d = settings.DEFAULT_SETTINGS;
    expect(settings.sanitizeSettings({ musicVolume: 'loud', sfxVolume: Number.NaN }).musicVolume).toBe(d.musicVolume);
    expect(settings.sanitizeSettings({ musicVolume: 'loud', sfxVolume: Number.NaN }).sfxVolume).toBe(d.sfxVolume);
    expect(settings.sanitizeSettings({ musicVolume: 7, sfxVolume: -3, sound: false }).musicVolume).toBe(1);
    expect(settings.sanitizeSettings({ musicVolume: 0, music: true }).musicVolume).toBe(d.musicVolume);
    expect(settings.sanitizeSettings({ sfxVolume: 0, sound: true }).sfxVolume).toBe(d.sfxVolume);
    // Switched off, a volume of 0 is left alone.
    expect(settings.sanitizeSettings({ sfxVolume: 0, sound: false }).sfxVolume).toBe(0);
  });

  test('the engine starts from the same defaults', () => {
    const d = audio.getAudioSettings();
    expect(d.musicVolume).toBe(settings.DEFAULT_SETTINGS.musicVolume);
    expect(d.sfxVolume).toBe(settings.DEFAULT_SETTINGS.sfxVolume);
    expect(d.music && d.sound).toBe(true);
  });
});

describe('the door of the exit', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  test('has its own sound, played at the moment the exit opens, and there is no slow motion any more', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'assets/audio/sfx/door_open.m4a'))).toBe(true);
    expect(read('src/services/audio.ts')).toContain("door_open: require('../../assets/audio/sfx/door_open.m4a')");
    expect(read('src/screens/GameScreen.tsx')).toMatch(/case 'exitOpen':[\s\S]{0,120}playSfx\('door_open'\)/);
    expect(read('src/render/Board.tsx')).not.toMatch(/slowUntil|SLOW_MOTION/);
    expect(read('src/render/Ball.tsx')).not.toMatch(/slowUntil|SLOW_MOTION/);
    expect(read('src/render/bus.ts')).not.toContain('slowUntil');
  });

  test('the ball moves with the real time of the frame, capped for a very long one', () => {
    expect(read('src/render/Ball.tsx')).toContain('const dt = Math.min(rawDt, 1 / 20);');
  });
});
