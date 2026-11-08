import { t } from '../i18n';
/** The themes of the daily challenges, by weekday (see funDaily.ts, where they are built). */
export type Theme = 'spiral' | 'symmetry' | 'zigzag' | 'star' | 'heart' | 'circuit' | 'teleport';
/** Every theme there is, for the code that goes through them all. */
export const THEMES: Theme[] = ['spiral', 'symmetry', 'zigzag', 'star', 'heart', 'circuit', 'teleport'];

/**
 * The shapes each weekday draws from (Monday first: `index % 7` of a challenge is the weekday it is played on, Monday = 0). They are
 * the ones that leave room for the star mechanic of the day (see dailyMechanics.ts): the walls between the corridors have to be thick
 * enough for a chute, a bend of the corridor has to make a branch for a platform... The shape of a challenge is the next one of its
 * weekday's list, week after week, so a weekday still changes its figure.
 */
export const DAILY_THEMES: readonly (readonly Theme[])[] = [
  ['zigzag', 'symmetry', 'spiral'],
  ['circuit', 'spiral', 'symmetry'],
  ['symmetry', 'zigzag', 'circuit', 'heart'],
  ['circuit', 'symmetry', 'spiral'],
  ['spiral', 'circuit'],
  ['teleport'],
  ['symmetry', 'circuit', 'zigzag'],
];
export const themeForIndex = (index: number): Theme => {
  const list = DAILY_THEMES[index % 7];
  return list[Math.floor(index / 7) % list.length];
};
/** The French names (the reference of the generator and its tests). */
export const THEME_NAMES: Record<Theme, string> = {
  spiral: 'Spirale',
  symmetry: 'Symétrie',
  zigzag: 'Zigzag',
  star: 'Étoile',
  heart: 'Cœur',
  circuit: 'Grand circuit',
  teleport: 'Téléporteurs et bombes',
};

/** The name of a theme in the language on screen (the French one stays the reference of the tests). */
export const themeName = (theme: Theme): string => t(`daily.themes.${theme}`);
