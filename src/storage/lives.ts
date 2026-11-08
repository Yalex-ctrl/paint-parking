import { useEffect, useState } from 'react';

import { MONETIZATION } from '../config/monetization';
import { dayKeyOf } from '../game/dates';
import { spendCoins } from '../game/economy';
import {
  addLifeFromAd,
  addLives,
  grantInfinite,
  hasLife,
  loseLife,
  refillLives,
  settle,
  skipMinutes,
  viewOf,
  type LivesView,
} from '../game/lives';
import { isVip } from '../game/vip';
import { syncNotifications } from '../services/notifications';
import { getProfile, updateProfile, useProfile } from './profile';

/** The lives as they are right now, refreshed every second while something is counting down (else every 20 s). */
export function useLivesView(): LivesView {
  const profile = useProfile();
  const [now, setNow] = useState(() => Date.now());
  const view = viewOf(profile.lives, now, isVip(profile.vip, now));
  const ticking = (!view.full || view.infinite) && !view.vip;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ticking ? 1000 : 20_000);
    return () => clearInterval(id);
  }, [ticking, profile.lives]);
  return view;
}

/** The lives right now, outside a component. */
export const currentLives = (): LivesView => viewOf(getProfile().lives, Date.now(), isVip(getProfile().vip, Date.now()));

export const canPlay = (): boolean => hasLife(getProfile().lives, Date.now(), isVip(getProfile().vip, Date.now()));

/** One life lost. False when there was none to lose. */
export function spendLife(): boolean {
  // The VIP pass: no life is ever lost.
  if (isVip(getProfile().vip, Date.now())) return true;
  const next = loseLife(getProfile().lives, Date.now());
  if (!next) return false;
  updateProfile((p) => ({ ...p, lives: next }));
  // The "lives are back" reminder is planned again for the new time.
  void syncNotifications(getProfile());
  return true;
}

/** Writes back the lives that came back since the last time (so a later read starts from the settled state). */
export function settleLives() {
  updateProfile((p) => ({ ...p, lives: settle(p.lives, Date.now()) }));
}

export function refillWithCoins(): boolean {
  const paid = spendCoins(getProfile(), MONETIZATION.lives.refillCoinCost);
  if (!paid) return false;
  updateProfile(() => ({ ...paid, lives: refillLives(paid.lives, Date.now()) }));
  return true;
}

/** A life for a watched rewarded ad (limited per day). False when today's ads are used up. */
export function addLifeForAd(): boolean {
  const next = addLifeFromAd(getProfile().lives, dayKeyOf(new Date()), Date.now());
  if (!next) return false;
  updateProfile((p) => ({ ...p, lives: next }));
  return true;
}

/* Developers */
export const devRefill = () => updateProfile((p) => ({ ...p, lives: refillLives({ ...p.lives, infiniteUntil: 0 }, Date.now()) }));
export const devEmpty = () => updateProfile((p) => ({ ...p, lives: { ...settle(p.lives, Date.now()), count: 0, since: Date.now(), infiniteUntil: 0 } }));
export const devToggleInfinite = () =>
  updateProfile((p) => {
    const now = Date.now();
    const on = p.lives.infiniteUntil > now;
    return { ...p, lives: on ? { ...p.lives, infiniteUntil: 0 } : grantInfinite(p.lives, 24, now) };
  });
export const devSkip30 = () => updateProfile((p) => ({ ...p, lives: skipMinutes(p.lives, MONETIZATION.lives.regenMinutes, Date.now()) }));
export const devGiveLife = () => updateProfile((p) => ({ ...p, lives: addLives(p.lives, 1, Date.now()) }));
