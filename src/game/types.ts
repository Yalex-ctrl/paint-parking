export type Dir = 'U' | 'D' | 'L' | 'R';

/** Order matters: a direction's index (0..3) is used by the engine's typed arrays. */
export const DIRS: readonly Dir[] = ['U', 'D', 'L', 'R'];

/** [dRow, dCol] for each direction (row grows downward). */
export const DELTA: Record<Dir, readonly [number, number]> = {
  U: [-1, 0],
  D: [1, 0],
  L: [0, -1],
  R: [0, 1],
};

export const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' };

export type Cell = readonly [row: number, col: number];

export type Exit = {
  /** Position of the exit cell: a cell of the outer wall ring. */
  r: number;
  c: number;
  /** Direction the ball must travel to leave the board through it. */
  dir: Dir;
};

/**
 * Where the ball comes in: an opening in the outer wall ring on `side`. The ball starts on the floor tile right behind it
 * (`Level.start`). While the level is played the opening is closed (a plain wall for the rules).
 */
export type Entry = {
  r: number;
  c: number;
  side: Dir;
};

/** The special tiles that can be introduced one after the other (coins are separate: optional). */
export type Mechanic = 'stop' | 'corner' | 'slide' | 'portal' | 'double' | 'tier' | 'fragile' | 'bomb' | 'collapse';

/** In the order they are introduced. */
export const MECHANICS: readonly Mechanic[] = ['corner', 'stop', 'slide', 'portal', 'double', 'tier', 'fragile', 'bomb', 'collapse'];

/**
 * The three newest mechanics (slides, platforms with ramps, the collapsing floor) belong to the daily challenges only: the levels of
 * the campaign never hold them. A challenge explains each of them, once, the first time the player meets it.
 */
export const DAILY_ONLY: readonly Mechanic[] = ['slide', 'tier', 'collapse'];
export type CampaignMechanic = 'stop' | 'corner' | 'portal' | 'double' | 'fragile' | 'bomb';
/** The mechanics of the campaign, in the order they are introduced. */
export const CAMPAIGN_MECHANICS: readonly CampaignMechanic[] = ['corner', 'stop', 'portal', 'double', 'fragile', 'bomb'];

/** A tutorial bubble: the first level of a mechanic, or (in a daily challenge) the first meeting with one of the newest. */
export type Tutorial = Mechanic | 'slideDown';

/** Level number at which each mechanic of the campaign is introduced (by a tutorial level). */
export const UNLOCK_LEVEL: Record<CampaignMechanic, number> = {
  corner: 3,
  stop: 12,
  portal: 25,
  double: 40,
  fragile: 60,
  bomb: 80,
};

/**
 * A bend on a tile. `a` and `b` are the two open SIDES of the tile: a ball that enters
 * through one leaves through the other (turning 90 degrees, without stopping). Entering
 * or leaving through the two other sides is blocked: from there the bend acts as a wall.
 */
export type Corner = { r: number; c: number; a: Dir; b: Dir };

/** A pair of linked portals: entering one leaves through the other, same direction. */
export type Portal = { a: [number, number]; b: [number, number] };

/**
 * A slide: a raised chute that carries the ball from an ENTRY tile to an EXIT tile, over the walls, one way only.
 * The ball enters when it arrives on the entry tile travelling in the direction of the funnel (`mouth`); it cannot stop in the
 * chute and lands on the exit tile, from where it goes on in `exitDir` like any slide. The chute paints nothing; the entry and the
 * exit are floor tiles to paint. From a platform it may come down to the low floor, never the other way.
 */
export type Slide = {
  entry: [number, number];
  mouth: Dir;
  exit: [number, number];
  exitDir: Dir;
  /** The tiles the chute passes over (walls, never floor), from the mouth to the last one before the exit. */
  path: [number, number][];
  shape: 'line' | 'L' | 'S' | 'spiral';
};

/** A ramp tile: floor that joins a platform tile to a low tile in line with it; `up` is the side of the platform. */
export type Ramp = { r: number; c: number; up: Dir };

export type Features = {
  /** Tiles that halt the ball even with open floor ahead. */
  stops: [number, number][];
  corners: Corner[];
  /** At most 2 pairs per level; the pair's index selects its colour. */
  portals: Portal[];
  /** Floor tiles that need two coats. */
  doubles: [number, number][];
  /** Cracked walls ('#' in the grid): they break when hit and become floor to paint. */
  fragile: [number, number][];
  /** One-shot paint bombs on floor tiles: paint the 3x3 area around. */
  bombs: [number, number][];
  /** Optional coins on floor tiles. */
  coins: [number, number][];
  /** Slides over the walls (from level 20), at most two. */
  slides: Slide[];
  /** Floor tiles of the platform (the raised floor, from level 50); every other floor tile is low. */
  raised: [number, number][];
  /** Ramps between the platform and the low floor. */
  ramps: Ramp[];
  /** Floor tiles that collapse into a hole once the ball has left them (from level 110). */
  collapse: [number, number][];
};

export const emptyFeatures = (): Features => ({
  stops: [],
  corners: [],
  portals: [],
  doubles: [],
  fragile: [],
  bombs: [],
  coins: [],
  slides: [],
  raised: [],
  ramps: [],
  collapse: [],
});

/** A level read from a file made before the three new mechanics: the lists they need are there, empty. */
export const withFeatures = (f: Partial<Features>): Features => ({ ...emptyFeatures(), ...f });

/**
 * A level. `grid` includes the outer wall ring: '#' = wall (fragile walls too), '.' = floor
 * (special floor tiles too: they are listed in `features`). The exit is one of the ring
 * cells; it behaves like a wall until every tile is fully painted.
 */
export type Level = {
  id: number;
  seed: number;
  rows: number;
  cols: number;
  grid: string[];
  start: [number, number];
  exit: Exit;
  /** Absent on the daily challenges (isolated levels) and on levels of the old format. */
  entry?: Entry;
  color: string;
  /** Optimal swipes (exit swipe included), e.g. "RDLU". */
  solution: string;
  difficulty: number;
  /** Tiles that must be painted: floor tiles plus fragile walls (they become floor). */
  floorCount: number;
  /** Coats needed in total: floorCount plus one extra per double tile. */
  layers: number;
  /** Floor cells enclosed on exactly 3 sides. */
  deadEnds: number;
  /** Floor cells open on >= 3 sides. */
  branches: number;
  features: Features;
  /** The mechanics this level really uses (coins excluded). */
  mechanics: Mechanic[];
  /** Set on the first level of a mechanic: shows its one-time explanation. */
  tutorial?: Tutorial;
  /**
   * Degrees the camera is lowered from the usual angle to show the sides of platforms, ramps and chutes (0 to 5). Worked out at
   * generation with the visibility check (scripts/set-camera.ts); absent means the usual angle.
   */
  camTilt?: number;
  /** A daily challenge only: the mechanic it features (the day of the week decides which). */
  star?: Mechanic;
};

/** How many of each special tile a set of features holds (a platform counts as one `tier`, whatever its size). */
export const mechanicCounts = (f: Features): Record<Mechanic, number> => ({
  stop: f.stops.length,
  corner: f.corners.length,
  slide: (f.slides ?? []).length,
  portal: f.portals.length,
  double: f.doubles.length,
  tier: (f.ramps ?? []).length,
  fragile: f.fragile.length,
  bomb: f.bombs.length,
  collapse: (f.collapse ?? []).length,
});

/** The mechanics a level really holds, in the order they are introduced. */
export const mechanicsOf = (f: Features): Mechanic[] => MECHANICS.filter((m) => mechanicCounts(f)[m] > 0);
