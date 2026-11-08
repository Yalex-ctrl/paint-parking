import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';

import { MONETIZATION } from '../config/monetization';
import { dayKeyOf } from '../dates';
import {
  claimVipDaily,
  autoRenewSimulated,
  enterGrace,
  expireVip,
  isVip,
  renewVip,
  startVip,
  syncVipBalls,
  vipStatus,
  type VipPlan,
} from '../vip';
import { t } from '../i18n';
import { KEYS } from '../storage/keys';
import { getProfile, updateProfile } from '../storage/profile';
import { track } from './analytics';
import { noteEvent } from './playClock';
import { showToast } from './toast';

/**
 * The VIP pass behind the "vip" entitlement of RevenueCat. Today (Expo Go) the store is SIMULATED (`MockStore`): buying shows a
 * confirmation and succeeds, and what was bought is written to a key that a reset keeps, so "Restaurer" has something to find.
 *
 * To plug the real thing in (see docs/SUBSCRIPTION_SETUP.md): implement `SubscriptionStore` with react-native-purchases
 * (`purchase` -> `Purchases.purchasePackage`, `entitlement` -> `Purchases.getCustomerInfo()` read on
 * `entitlements.active[MONETIZATION.vip.entitlement]`, `restore` -> `Purchases.restorePurchases()`) and call
 * `setSubscriptionStore(real)` once at start-up. Nothing else changes: the screens, the rules and the tests only talk to this file.
 */
export type Entitlement = {
  active: boolean;
  plan: VipPlan;
  /** End of the paid period (ms). */
  expiresAt: number;
  /** The store is retrying a payment that failed: the pass keeps working for now. */
  inGrace: boolean;
};

export interface SubscriptionStore {
  /** 'purchased' | 'cancelled' | 'failed'. */
  purchase(plan: VipPlan): Promise<'purchased' | 'cancelled' | 'failed'>;
  /** What the store says about the entitlement right now; null when it cannot be known (offline): the cache is kept. */
  entitlement(): Promise<Entitlement | null>;
  /** "Restaurer les achats": the entitlement of this account, null when there is none. */
  restore(): Promise<Entitlement | null>;
}

class MockStore implements SubscriptionStore {
  purchase(plan: VipPlan): Promise<'purchased' | 'cancelled' | 'failed'> {
    const product = MONETIZATION.vip.products[plan];
    return new Promise((resolve) => {
      Alert.alert(
        t('vip.simulated.title'),
        t('vip.simulated.body', { plan: t(`vip.plan.${plan}`), id: product.id }),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancelled') },
          {
            text: t('vip.subscribe'),
            onPress: async () => {
              try {
                await AsyncStorage.setItem(KEYS.mockVip, JSON.stringify({ plan, expiresAt: Date.now() + product.days * 86_400_000 }));
              } catch {
                // The profile is written all the same.
              }
              resolve('purchased');
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve('cancelled') },
      );
    });
  }

  // Nothing is known without the real store: the cache of the profile is what counts (the dev menu plays with it).
  async entitlement(): Promise<Entitlement | null> {
    return null;
  }

  async restore(): Promise<Entitlement | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.mockVip);
      if (!raw) return null;
      const v = JSON.parse(raw) as { plan: VipPlan; expiresAt: number };
      return { active: v.expiresAt > Date.now(), plan: v.plan, expiresAt: v.expiresAt, inGrace: false };
    } catch {
      return null;
    }
  }
}

let store: SubscriptionStore = new MockStore();
export const setSubscriptionStore = (next: SubscriptionStore) => {
  store = next;
};

/** Tells the analytics and the player about the balls given since `before` (a purchase or a renewal gives the first one at once). */
function announceBalls(before: number): void {
  const after = getProfile().vip.ballsGiven;
  for (let month = before + 1; month <= after; month++) track('vip_ball_unlocked', { ball: MONETIZATION.vip.balls[month - 1], month });
  if (after > before) showToast(t('vip.ballToast'));
}

/** Notices a pass that lapsed (once) and gives the balls of the months that have started. */
export function refreshVip(now = Date.now()): void {
  const before = getProfile();
  const live = isVip(before.vip, now);
  if (before.vip.live && !live) track('subscription_expired', { plan: before.vip.plan });
  const { given } = syncVipBalls(before, now);
  if (given.length === 0 && before.vip.live === live) return;
  updateProfile((p) => {
    const next = syncVipBalls(p, now).profile;
    return { ...next, vip: { ...next.vip, live } };
  });
  const last = getProfile().vip.ballsGiven;
  given.forEach((ball, i) => track('vip_ball_unlocked', { ball, month: last - given.length + i + 1 }));
  if (given.length > 0) showToast(t('vip.ballToast'));
}

/** Brings the cache of the profile up to date with the store (at launch and when the app comes back to the front). */
export async function checkSubscription(now = Date.now()): Promise<void> {
  let e: Entitlement | null = null;
  try {
    e = await store.entitlement();
  } catch {
    e = null;
  }
  if (e) {
    const p = getProfile();
    const wasLive = isVip(p.vip, now);
    if (e.active && (!wasLive || !p.vip.plan)) {
      updateProfile((q) => startVip({ ...q, vip: { ...q.vip, plan: e.plan } }, e.plan, now));
    } else if (e.active && e.expiresAt > p.vip.expiresAt) {
      // The store renewed the period while the app was away.
      updateProfile((q) => renewVip(q, now));
      track('subscription_renewed', { plan: e.plan });
    }
    if (e.active && e.inGrace) updateProfile((q) => enterGrace(q, now));
    if (!e.active && wasLive) updateProfile((q) => expireVip(q, now));
  }
  // The simulated store renews by itself when the period is over (the real one does it on the store's side).
  if (store instanceof MockStore && autoRenewSimulated(getProfile(), now) !== getProfile()) {
    updateProfile((q) => autoRenewSimulated(q, now));
    track('subscription_renewed', { plan: getProfile().vip.plan });
  }
  refreshVip(now);
}

/** Buys the pass. True when it went through. */
export async function subscribe(plan: VipPlan): Promise<boolean> {
  const outcome = await store.purchase(plan);
  if (outcome !== 'purchased') return false;
  const now = Date.now();
  const had = getProfile().vip.ballsGiven;
  updateProfile((p) => startVip(p, plan, now));
  announceBalls(had);
  noteEvent();
  track('subscription_started', { plan });
  track('purchase', { product: MONETIZATION.vip.products[plan].id });
  refreshVip(now);
  return true;
}

/** "Restaurer les achats" for the pass. True when a pass was found. */
export async function restoreSubscription(): Promise<boolean> {
  let e: Entitlement | null = null;
  try {
    e = await store.restore();
  } catch {
    e = null;
  }
  if (!e || !e.active) return false;
  const now = Date.now();
  const had = getProfile().vip.ballsGiven;
  updateProfile((p) => (isVip(p.vip, now) ? p : startVip(p, e.plan, now)));
  announceBalls(had);
  refreshVip(now);
  return true;
}

/** The "Bonus VIP du jour": the 100 coins, once a day. Returns the coins, null when there was nothing to take. */
export function claimVipBonus(): number | null {
  const got = claimVipDaily(getProfile(), dayKeyOf(new Date()), Date.now());
  if (!got) return null;
  updateProfile(() => got.profile);
  track('vip_daily_claimed', { coins: got.coins });
  return got.coins;
}

/** Re-checks the pass when the app comes back to the front. */
export function startSubscriptionWatch(): () => void {
  void checkSubscription();
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void checkSubscription();
  });
  return () => sub.remove();
}

export const vipStatusNow = () => vipStatus(getProfile().vip, Date.now());

/* Developers (the dev menu of the settings) */
export const devVip = {
  activate: (plan: VipPlan) => updateProfile((p) => startVip(p, plan, Date.now())),
  expire: () => updateProfile((p) => expireVip(p, Date.now())),
  renew: () => {
    updateProfile((p) => renewVip(p, Date.now()));
    track('subscription_renewed', { plan: getProfile().vip.plan });
  },
  grace: () => updateProfile((p) => enterGrace(expireVip(p, Date.now()), Date.now())),
  reset: () => updateProfile((p) => ({ ...p, vip: { ...p.vip, plan: null, expiresAt: 0, graceUntil: 0, startedAt: 0, monthsBefore: 0, dailyClaim: null, expiredSeen: false, live: false, expiredByTools: false } })),
};
