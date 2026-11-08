/**
 * The design system: every colour, radius, shadow and spacing of the interface lives here.
 * Screens never hard-code a colour; they pick a name from this file.
 */
export const colors = {
  /** Night-blue background behind every screen (also the 3D scene's frame). */
  bg: '#1d1733',
  bgDeep: '#140f26',
  surface: '#2a2250',
  surfaceEdge: '#1a1438',
  surfaceHi: '#3a3170',
  overlay: 'rgba(10, 6, 24, 0.66)',

  text: '#ffffff',
  textSoft: '#cbc3ee',
  textMuted: '#9d93c8',
  /** Dark text for light buttons and badges. */
  ink: '#2a1e33',

  gold: '#ffc93c',
  goldDeep: '#d9951a',
  coin: '#ffd23f',
  coinRim: '#e0961b',
  green: '#6fdc6a',
  greenDeep: '#3a9a3f',
  red: '#ff5468',
  redDeep: '#c32a40',
  violet: '#7a4df0',
  violetDeep: '#4b2bb0',
  blue: '#3d3a78',
  blueDeep: '#24214f',
  flame: '#ff8a3d',
  flameLight: '#ffb347',
  greenLight: '#7fe27a',
  /** Dark text on the gold and green buttons. */
  onGold: '#3a2300',
  equipped: '#2a7a31',
  previewBg: '#241d4d',
  neon: '#19ffb0',
  signInk: '#4a2f12',
  adBg: '#14101f',
  /** The loading screen: a deep violet of the game's night-blue family, a little richer than the backgrounds. */
  loadingBg: '#2b2161',
  cream: '#f4ecd8',

  /** Ink on the dark 3D scene: a soft shadow keeps white text readable on any world. */
  shadow: 'rgba(0, 0, 0, 0.6)',
} as const;

/** Colours of the 3D buttons: the top face, the thick edge under it, and a text colour that always reads. */
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'neutral';

export const buttonColors: Record<ButtonVariant, { face: string; edge: string; text: string }> = {
  primary: { face: '#ffcf3a', edge: '#d9951a', text: '#3a2300' },
  secondary: { face: '#7a4df0', edge: '#4b2bb0', text: '#ffffff' },
  success: { face: '#7fe27a', edge: '#3a9a3f', text: '#0f3a14' },
  danger: { face: '#ff5468', edge: '#c32a40', text: '#ffffff' },
  neutral: { face: '#4a4690', edge: '#272356', text: '#ffffff' },
};

/** Border colour of a shop card by rarity. */
export const rarityColors = { common: '#8a86a0', rare: '#4aa3ff', epic: '#b266ff', legendary: '#ffc93c' } as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Side margin of every screen: nothing touches the edge of the display. */
export const MARGIN = 16;

/**
 * The fonts: Lilita One (thick, round) for titles, big numbers and buttons; Nunito for everything else (600 for the running
 * text, 800 for the labels that matter).
 */
export const fonts = {
  display: 'LilitaOne_400Regular',
  text: 'Nunito_600SemiBold',
  label: 'Nunito_800ExtraBold',
} as const;

/** The scale of sizes. No screen writes a size of its own: it picks one of these. */
export const fontSizes = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 40, huge: 56 } as const;

/** Line height (as a multiple of the size): tight for titles, comfortable for the descriptions. */
export const lineHeights = { title: 1.12, text: 1.35 } as const;

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  soft: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
} as const;

/** Height of the unified header under the status bar. */
export const HEADER_HEIGHT = 56;
