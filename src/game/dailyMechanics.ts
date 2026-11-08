import { DAILY_ONLY, type Level, type Mechanic, type Tutorial } from './types';

/**
 * The mechanic each weekday of the daily challenges puts forward (Monday = 0, like the themes of dailyThemes.ts). The three newest
 * mechanics (slides, platforms and ramps, the collapsing floor) live here and nowhere else.
 *   Monday slides, Tuesday platforms, Wednesday the collapsing floor, Thursday slides and platforms together, Friday bends in a
 *   spiral, Saturday portals and bombs, Sunday a bit of everything: a slide and the collapsing floor on top of the x2 tiles every challenge has (three kinds, never more).
 * The first one is the "star" of the day: the one the intro of the challenge announces.
 */
export const DAILY_STARS: readonly (readonly Mechanic[])[] = [
  ['slide'],
  ['tier'],
  ['collapse'],
  ['slide', 'tier'],
  ['corner'],
  ['portal', 'bomb'],
  ['slide', 'collapse'],
];

/** The mechanics a challenge of this weekday is built around (`index % 7` of the challenge). */
export const starsForIndex = (index: number): readonly Mechanic[] => DAILY_STARS[((index % 7) + 7) % 7];

/** An icon for each mechanic (Material Community Icons), for the intro of a challenge. */
export const MECHANIC_ICONS: Record<Mechanic, string> = {
  slide: 'slide',
  tier: 'stairs-up',
  collapse: 'image-broken-variant',
  corner: 'reload',
  portal: 'orbit',
  bomb: 'bomb',
  double: 'numeric-2-box-outline',
  stop: 'stop-circle-outline',
  fragile: 'wall',
};

/** The kinds of special tile that count toward the limit of three per challenge: the bends and the stop tiles are the basics. */
const BASICS: readonly Mechanic[] = ['corner', 'stop'];
export const MAX_KINDS = 3;
export const MAX_SLIDES = 2;

/** How many kinds of mechanic a level holds, not counting the bends and the stop tiles that every challenge has. */
export const kindsOf = (level: Level): number => level.mechanics.filter((m) => !BASICS.includes(m)).length;

/** The newest mechanics a level holds, in the order of the explanations (a challenge shows one bubble for each, once). */
export const newMechanicsOf = (level: Level): Tutorial[] => DAILY_ONLY.filter((m) => level.mechanics.includes(m));
