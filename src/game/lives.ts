import { livesOn } from '../config/features';
import { MONETIZATION } from '../config/monetization';
import type { DayKey } from './dates';

/**
 * Lives. Everything is worked out from saved timestamps (no timer runs), so lives come back while the app is closed.
 * The functions are pure: they take a state and "now" and return a new state.
 *
 * The clock of the device can be set back: `lastNow` remembers the latest time ever seen, and "now" is never taken to be
 * earlier than that, so moving the clock back gives nothing (it only freezes the countdown until the clock catches up).
 */
export type LivesState = {
  count: number;
  /** When the lives started coming back (the countdown to the next one is counted from there); null when full. */
  since: number | null;
  /** Unlimited lives until this time (ms); 0 or in the past = not unlimited. */
  infiniteUntil: number;
  /** Latest time seen (guards against a clock set back). */
  lastNow: number;
  /** Lives won by rewarded ads today. */
  adDay: DayKey | null;
  adCount: number;
};

const { max: MAX_LIVES, regenMinutes } = MONETIZATION.lives;
export const REGEN_MS = regenMinutes * 60_000;
export { MAX_LIVES };

export const freshLives = (): LivesState => ({ count: MAX_LIVES, since: null, infiniteUntil: 0, lastNow: 0, adDay: null, adCount: 0 });

/** Completes a saved state (older saves have none). */
export function normalizeLives(raw: Partial<LivesState> | null | undefined): LivesState {
  const d = freshLives();
  if (!raw) return d;
  const count = Number.isFinite(raw.count) ? Math.min(MAX_LIVES, Math.max(0, Math.floor(raw.count as number))) : d.count;
  return {
    count,
    since: count >= MAX_LIVES ? null : typeof raw.since === 'number' ? raw.since : null,
    infiniteUntil: typeof raw.infiniteUntil === 'number' ? raw.infiniteUntil : 0,
    lastNow: typeof raw.lastNow === 'number' ? raw.lastNow : 0,
    adDay: raw.adDay ?? null,
    adCount: raw.adCount ?? 0,
  };
}

/** The state brought up to `now`: lives that came back are added. */
export function settle(s: LivesState, now: number): LivesState {
  const t = Math.max(now, s.lastNow);
  let { count, since } = s;
  if (count >= MAX_LIVES) {
    count = MAX_LIVES;
    since = null;
  } else if (since !== null) {
    // A "since" in the future (a clock that was set back before it was saved) counts as now.
    const base = Math.min(since, t);
    const back = Math.floor((t - base) / REGEN_MS);
    if (back > 0) {
      count = Math.min(MAX_LIVES, count + back);
      since = count >= MAX_LIVES ? null : base + back * REGEN_MS;
    } else since = base;
  } else {
    // Not full and nothing counting: start counting now.
    since = t;
  }
  return { ...s, count, since, lastNow: t };
}

export type LivesView = {
  count: number;
  max: number;
  infinite: boolean;
  infiniteLeftMs: number;
  /** Milliseconds until the next life; null when full or unlimited. */
  nextInMs: number | null;
  full: boolean;
  /** The lives are unlimited because of the VIP pass (no countdown to show). */
  vip: boolean;
};

export function viewOf(s: LivesState, now: number, vip = false): LivesView {
  const t = settle(s, now);
  const at = Math.max(now, t.lastNow);
  const infiniteLeftMs = vip ? Infinity : Math.max(0, t.infiniteUntil - at);
  const infinite = infiniteLeftMs > 0;
  const full = t.count >= MAX_LIVES;
  return {
    count: t.count,
    max: MAX_LIVES,
    infinite,
    infiniteLeftMs,
    nextInMs: full || infinite || t.since === null ? null : Math.max(0, t.since + REGEN_MS - at),
    full,
    vip,
  };
}

export const hasLife = (s: LivesState, now: number, vip = false): boolean => {
  const v = viewOf(s, now, vip);
  return v.infinite || v.count > 0;
};

/** One life lost (nothing happens while lives are unlimited). Null when there is none to lose. */
export function loseLife(s: LivesState, now: number): LivesState | null {
  const t = settle(s, now);
  if (Math.max(now, t.lastNow) < t.infiniteUntil) return t;
  if (t.count <= 0) return null;
  const at = Math.max(now, t.lastNow);
  return { ...t, count: t.count - 1, since: t.since ?? at };
}

export function addLives(s: LivesState, n: number, now: number): LivesState {
  const t = settle(s, now);
  const count = Math.min(MAX_LIVES, t.count + n);
  return { ...t, count, since: count >= MAX_LIVES ? null : t.since ?? Math.max(now, t.lastNow) };
}

export const refillLives = (s: LivesState, now: number): LivesState => addLives(s, MAX_LIVES, now);

/** Unlimited lives for `hours` more (added to what is left). */
export function grantInfinite(s: LivesState, hours: number, now: number): LivesState {
  const t = settle(s, now);
  const at = Math.max(now, t.lastNow);
  return { ...t, infiniteUntil: Math.max(t.infiniteUntil, at) + hours * 3_600_000 };
}

/** Rewarded ads may give a life this many times a day. */
export const adLivesLeft = (s: LivesState, day: DayKey): number => Math.max(0, MONETIZATION.lives.adLivesPerDay - (s.adDay === day ? s.adCount : 0));

export function addLifeFromAd(s: LivesState, day: DayKey, now: number): LivesState | null {
  if (adLivesLeft(s, day) <= 0) return null;
  const t = addLives(s, 1, now);
  return { ...t, adDay: day, adCount: (s.adDay === day ? s.adCount : 0) + 1 };
}

/** Developers: moves the clock of the lives forward (the countdown and the unlimited time both run down). */
export function skipMinutes(s: LivesState, minutes: number, now: number): LivesState {
  const t = settle(s, now);
  const ms = minutes * 60_000;
  return settle({ ...t, since: t.since === null ? null : t.since - ms, infiniteUntil: t.infiniteUntil ? t.infiniteUntil - ms : 0 }, now);
}

/** When all the lives will be back (ms), or null when they are full or unlimited. */
export function fullAt(s: LivesState, now: number): number | null {
  const t = settle(s, now);
  if (t.count >= MAX_LIVES || t.since === null) return null;
  return t.since + (MAX_LIVES - t.count) * REGEN_MS;
}

/** Whether losing a life applies at all: not in the first levels (the tutorial), not in the daily challenge. */
export const lifeAtStake = (levelId: number, daily: boolean): boolean => !daily && levelId > MONETIZATION.lives.freeUntilLevel;

/** "12:34" (or "1:02:03" past an hour). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Whether failing or restarting costs a life: only when lives exist, and not in the first levels or the daily challenge. */
export const lifeCosts = (levelId: number, daily: boolean): boolean => livesOn() && lifeAtStake(levelId, daily);

/**
 * Whether failing a level (running out of moves) puts the win streak back to 0: with lives, when a life is lost; without lives,
 * whenever a level can be failed (never in the daily challenge).
 */
export const failureCostsStreak = (levelId: number, daily: boolean): boolean => (livesOn() ? lifeAtStake(levelId, daily) : !daily);
