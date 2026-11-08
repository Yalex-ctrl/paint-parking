import { t } from '../i18n';
/**
 * The rules of the sounds that are not about playing a file: which note of the scale a tile gets, how hard a wall hit is,
 * how many sounds can play at once, how often one may repeat, and the words shown for a long slide. All pure (tested).
 */

/** The paint "plip" comes in 12 pitches: the notes of a C major pentatonic scale over two octaves, low to high. */
export const PLIP_NOTES = 12;

/** Note (0-11) of the n-th tile painted in one slide (from 0): it climbs, and stays on the top note if the slide is longer. */
export const plipIndex = (nthTile: number): number => Math.max(0, Math.min(PLIP_NOTES - 1, Math.floor(nthTile)));

/** Notes of the three stars: C, E, G of the upper octave, in the same scale (so a win sounds like the paint did). */
export const STAR_NOTES = [5, 7, 8] as const;

/** Volume (0.45-1) of a wall hit after a slide of `cells` tiles: a long slide hits harder. */
export const impactVolume = (cells: number): number => Math.min(1, 0.45 + 0.1 * Math.max(0, cells));
/** A slide of this many tiles or more hits with the heavy "toc". */
export const HEAVY_IMPACT_FROM = 5;

/** The word floating over the ball after a long slide (null when it was short). */
export function slideWord(cells: number): string | null {
  if (cells >= 12) return t('words.unbelievable');
  if (cells >= 9) return t('words.awesome');
  if (cells >= 6) return t('words.great');
  return null;
}

/** 0 = nothing special, 1-3 = the vibration and the arrival splash grow with the slide. */
export function slideThrill(cells: number): 0 | 1 | 2 | 3 {
  if (cells >= 12) return 3;
  if (cells >= 9) return 2;
  if (cells >= 6) return 1;
  return 0;
}

/** At most this many sounds play at the same time. */
export const MAX_VOICES = 8;
/** The same sound is never started more than this many times a second. */
export const MAX_PER_SECOND = 20;

/** Anti-spam: lets a sound through at most `MAX_PER_SECOND` times in any second. */
export class RateLimiter {
  private times = new Map<string, number[]>();
  allow(name: string, now: number): boolean {
    const list = (this.times.get(name) ?? []).filter((t) => now - t < 1000);
    if (list.length >= MAX_PER_SECOND) {
      this.times.set(name, list);
      return false;
    }
    list.push(now);
    this.times.set(name, list);
    return true;
  }
}

/** The sounds playing now, with the moment each one ends and how important it is. */
export class VoiceBudget {
  private voices: { until: number; priority: number }[] = [];
  /**
   * Asks for a voice. When all 8 are busy, the new sound only gets in if it matters more than the least important one
   * playing, which it then replaces (the replaced one is simply left to finish: only the count is capped).
   */
  request(now: number, durationMs: number, priority: number): boolean {
    this.voices = this.voices.filter((v) => v.until > now);
    if (this.voices.length >= MAX_VOICES) {
      let low = 0;
      for (let i = 1; i < this.voices.length; i++) if (this.voices[i].priority < this.voices[low].priority) low = i;
      if (this.voices[low].priority >= priority) return false;
      this.voices.splice(low, 1);
    }
    this.voices.push({ until: now + durationMs, priority });
    return true;
  }
  get count() {
    return this.voices.length;
  }
}

/** The volumes a player starts with (the sliders of the settings), and what a missing or broken saved value goes back to. */
export const DEFAULT_MUSIC_SLIDER = 0.8;
export const DEFAULT_SFX_SLIDER = 0.8;
/** Music volume (0-1) by what the player is doing, before the volume slider of the settings. */
export const MUSIC_VOLUME = { menu: 0.35, game: 0.25, ad: 0.12 } as const;
/** Seconds the music takes to go from one volume to the next. */
export const MUSIC_FADE_SECONDS = 0.5;
