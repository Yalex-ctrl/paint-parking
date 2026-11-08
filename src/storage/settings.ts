import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_MUSIC_SLIDER, DEFAULT_SFX_SLIDER } from '../game/soundRules';
import { KEYS } from './keys';

const KEY = KEYS.settings;

export type Settings = {
  /** 3D scenery around the board; turn off on older phones. */
  decor: boolean;
  /** Sound effects. */
  sound: boolean;
  /** The ambient music of the game. */
  music: boolean;
  /** Volume of the music and of the effects (0 to 1). */
  musicVolume: number;
  sfxVolume: number;
  /** Developers: show the frame rate and the slowest events (only ever read in __DEV__). */
  showPerf: boolean;
  /** Vibrations (haptics). */
  vibrations: boolean;
  /** The language the player chose ('fr', 'en'...); null: the one of the phone. */
  language: string | null;
};

export const DEFAULT_SETTINGS: Settings = { decor: true, sound: true, music: true, musicVolume: DEFAULT_MUSIC_SLIDER, sfxVolume: DEFAULT_SFX_SLIDER, showPerf: false, vibrations: true, language: null };

/**
 * What is read from the storage is never trusted: a missing or broken field takes its default, a volume is a number from 0 to 1, and a
 * volume stuck at 0 while its switch is on (the sound would be on and silent) goes back to the default.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const volume = (v: unknown, d: number, on: boolean) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return d;
    const clamped = Math.max(0, Math.min(1, v));
    return on && clamped < 0.01 ? d : clamped;
  };
  const sound = bool(r.sound, DEFAULT_SETTINGS.sound);
  const music = bool(r.music, DEFAULT_SETTINGS.music);
  return {
    decor: bool(r.decor, DEFAULT_SETTINGS.decor),
    sound,
    music,
    musicVolume: volume(r.musicVolume, DEFAULT_SETTINGS.musicVolume, music),
    sfxVolume: volume(r.sfxVolume, DEFAULT_SETTINGS.sfxVolume, sound),
    showPerf: bool(r.showPerf, DEFAULT_SETTINGS.showPerf),
    vibrations: bool(r.vibrations, DEFAULT_SETTINGS.vibrations),
    language: typeof r.language === 'string' ? r.language : DEFAULT_SETTINGS.language,
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // A setting that fails to persist just resets next launch.
  }
}

/** The sound part of the settings: what "Remettre à zéro" puts back (the other preferences stay). */
export const AUDIO_DEFAULTS = { sound: DEFAULT_SETTINGS.sound, music: DEFAULT_SETTINGS.music, musicVolume: DEFAULT_SETTINGS.musicVolume, sfxVolume: DEFAULT_SETTINGS.sfxVolume };

export async function resetAudioSettings(): Promise<Settings> {
  const next = { ...(await loadSettings()), ...AUDIO_DEFAULTS };
  await saveSettings(next);
  return next;
}
