import { t } from '../i18n';
/**
 * The steps of the guided tour, in order. Each one points at an element (the id it registered with useTourTarget / Target).
 * A step with a `screen` is on another screen: the hand presses the button that opens it, the screen opens, the consecutive steps
 * of the same screen are shown there, then the hand presses the cross and the level comes back.
 * Steps that depend on a game rule are left out when the rule is off, and the "x / N" count follows.
 */
export type TourBubble = {
  id: string;
  target: string;
  /** Key of the text in the language files (tour.steps.<id>); `tourSteps` fills `text`. */
  text: string;
  /** Left out unless this rule is on (`notVip`: left out for a subscriber). */
  needs?: 'lives' | 'moveLimit' | 'notVip';
  /** The hand presses the target first and what it does really happens (the tab of the shop opens). */
  pressFirst?: boolean;
  /** The side the bubble prefers, when the one the placement would take puts its arrow over a text. */
  side?: 'below' | 'above' | 'right' | 'left';
  /** On another screen (a key of TOUR_SCREENS): the hand opens it before the first step of the group and closes it after the last. */
  screen?: keyof typeof TOUR_SCREENS;
};

/** The screens the tour opens: the button of the level that opens each one (a target id) and its route. */
export const TOUR_SCREENS = {
  shop: { from: 'shop', route: '/shop' },
  daily: { from: 'daily', route: '/daily' },
  gallery: { from: 'gallery', route: '/gallery' },
  gifts: { from: 'gifts', route: '/gifts' },
} as const;

export type TourRules = { lives: boolean; moveLimit: boolean; vip?: boolean };

export const TOUR_STEPS: TourBubble[] = [
  { id: 'steps', target: 'stepbar', text: 'steps' },
  { id: 'moves', target: 'moves', text: 'moves' },
  { id: 'lives', target: 'lives', needs: 'lives', text: 'lives' },
  { id: 'streak', target: 'streak', text: 'streak' },
  { id: 'coins', target: 'coins', text: 'coins' },
  { id: 'shop-balls', target: 'shop-tab-ball', screen: 'shop', text: 'shopBalls' },
  { id: 'shop-paints', target: 'shop-tab-paint', screen: 'shop', text: 'shopPaints' },
  { id: 'shop-offers', target: 'shop-tab-offers', screen: 'shop', text: 'shopOffers', pressFirst: true },
  { id: 'offers-free', target: 'offers-free', screen: 'shop', text: 'offersFree' },
  { id: 'offers-packs', target: 'offers-packs', screen: 'shop', text: 'offersPacks' },
  { id: 'offers-lives', target: 'offers-lives', screen: 'shop', needs: 'lives', text: 'offersLives' },
  { id: 'offers-piggy', target: 'offers-piggy', screen: 'shop', text: 'offersPiggy' },
  { id: 'offers-vip', target: 'offers-vip', screen: 'shop', needs: 'notVip', text: 'offersVip' },
  { id: 'daily', target: 'daily-card', screen: 'daily', text: 'daily' },
  { id: 'daily-calendar', target: 'daily-calendar', screen: 'daily', text: 'dailyCalendar' },
  { id: 'gallery', target: 'gallery-picture', screen: 'gallery', text: 'gallery', side: 'above' },
  { id: 'gifts', target: 'gifts-panel', screen: 'gifts', text: 'gifts' },
  { id: 'piggy', target: 'piggy', text: 'piggy' },
  { id: 'hint', target: 'hint', text: 'hint' },
];

/** The steps that apply to the rules in force (the move-limit warning is added to the moves step). */
export function tourSteps(rules: TourRules, counts: { balls: number; paints: number }): TourBubble[] {
  const on = { lives: rules.lives, moveLimit: rules.moveLimit, notVip: !rules.vip };
  return TOUR_STEPS.filter((s) => !s.needs || on[s.needs]).map((s) => ({
    ...s,
    text: t(`tour.steps.${s.text}`, { balls: counts.balls, paints: counts.paints }) + (s.id === 'moves' && rules.moveLimit ? ` ${t('tour.steps.movesLimited')}` : ''),
  }));
}
