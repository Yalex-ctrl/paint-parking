import AsyncStorage from '@react-native-async-storage/async-storage';

import { MONETIZATION } from '../config/monetization';
import { applyProduct, isPermanentProduct } from '../economy';
import type { VipPlan } from '../vip';
import { setStorePrices } from '../i18n/prices';
import { KEYS } from '../storage/keys';
import { updateProfile } from '../storage/profile';
import { track } from './analytics';
import { setPurchasesImplementation, type PurchaseOutcome, type PurchasesService } from './purchases';
import { setSubscriptionStore, type Entitlement, type SubscriptionStore } from './subscription';

/**
 * The real store, through RevenueCat (react-native-purchases). It plugs into the two interfaces the game already talks to
 * (`PurchasesService` in purchases.ts, `SubscriptionStore` in subscription.ts); nothing else changes.
 *
 * - Only started when the native module is there (a development or production build) AND a public key is given
 *   (EXPO_PUBLIC_REVENUECAT_IOS_KEY, a PUBLIC key made to be shipped in the app). In Expo Go, or without a key, the simulated
 *   store stays.
 * - A consumable is credited ONCE per store transaction: the ids already credited are kept in the storage, and a purchase that
 *   was interrupted (the app closed during the payment) is credited at the next launch from the transactions RevenueCat knows.
 */

type Sdk = typeof import('react-native-purchases').default;

const PRODUCT_IDS = [
  MONETIZATION.products.removeAds.id,
  MONETIZATION.products.starterPack.id,
  MONETIZATION.lives.infiniteHour.id,
  MONETIZATION.lives.infiniteDay.id,
  MONETIZATION.piggy.product.id,
  ...MONETIZATION.products.coinPacks.map((c) => c.id),
];
const SUBSCRIPTION_IDS = [MONETIZATION.vip.products.monthly.id, MONETIZATION.vip.products.yearly.id];

let sdk: Sdk | null = null;
/** True while a purchase of this app is in progress: the listener leaves it alone (the purchase credits it itself). */
let purchasing = 0;

const warn = (what: string, err: unknown) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[revenuecat] ${what} failed:`, err);
};

/** The transaction ids that have already been credited (consumables), so that nothing is credited twice. */
async function creditedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.creditedTransactions);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function markCredited(transactionId: string): Promise<boolean> {
  const done = await creditedIds();
  if (done.has(transactionId)) return false;
  done.add(transactionId);
  try {
    await AsyncStorage.setItem(KEYS.creditedTransactions, JSON.stringify([...done].slice(-500)));
  } catch {
    // The profile is updated for this session all the same.
  }
  return true;
}

const errorCode = (err: unknown): string => String((err as { code?: unknown })?.code ?? '');
const isCancelled = (err: unknown) => (err as { userCancelled?: boolean })?.userCancelled === true || errorCode(err) === '1';

class RevenueCatPurchases implements PurchasesService {
  async init() {}

  async purchase(productId: string): Promise<PurchaseOutcome> {
    if (!sdk) return 'failed';
    purchasing++;
    try {
      const [product] = await sdk.getProducts([productId]);
      if (!product) return 'failed';
      const result = await sdk.purchaseStoreProduct(product);
      // The caller credits this purchase: remember its transaction so that nothing credits it a second time.
      await markCredited(result.transaction.transactionIdentifier);
      return 'purchased';
    } catch (err) {
      if (isCancelled(err)) return 'cancelled';
      // A payment that waits for approval (ask to buy) is not a purchase yet: it will arrive as a transaction later.
      warn(`purchase ${productId}`, err);
      return 'failed';
    } finally {
      purchasing--;
    }
  }

  async restore(): Promise<string[]> {
    if (!sdk) return [];
    try {
      const info = await sdk.restorePurchases();
      const owned = new Set<string>();
      if (info.entitlements.active[MONETIZATION.products.removeAds.id]) owned.add(MONETIZATION.products.removeAds.id);
      for (const t of info.nonSubscriptionTransactions) if (isPermanentProduct(t.productIdentifier)) owned.add(t.productIdentifier);
      return [...owned];
    } catch (err) {
      warn('restore', err);
      return [];
    }
  }
}

/** Credits the consumables bought in a session that was cut short, once each. */
async function creditPending(info: { nonSubscriptionTransactions: { transactionIdentifier: string; productIdentifier: string }[] }) {
  if (purchasing > 0) return;
  for (const t of info.nonSubscriptionTransactions) {
    if (isPermanentProduct(t.productIdentifier) || !PRODUCT_IDS.includes(t.productIdentifier)) continue;
    if (!(await markCredited(t.transactionIdentifier))) continue;
    updateProfile((p) => applyProduct(p, t.productIdentifier) ?? p);
    track('purchase_recovered', { product: t.productIdentifier });
  }
}

const plan = (productId: string): VipPlan => (productId === MONETIZATION.vip.products.yearly.id ? 'yearly' : 'monthly');

function toEntitlement(info: Awaited<ReturnType<Sdk['getCustomerInfo']>>): Entitlement | null {
  const e = info.entitlements.all[MONETIZATION.vip.entitlement];
  if (!e) return null;
  return {
    active: e.isActive,
    plan: plan(e.productIdentifier),
    expiresAt: e.expirationDateMillis ?? 0,
    // A payment that failed while the store retries it: the entitlement stays active in the meantime.
    inGrace: e.isActive && e.billingIssueDetectedAtMillis != null,
  };
}

class RevenueCatSubscription implements SubscriptionStore {
  async purchase(which: VipPlan): Promise<'purchased' | 'cancelled' | 'failed'> {
    if (!sdk) return 'failed';
    purchasing++;
    try {
      const id = MONETIZATION.vip.products[which].id;
      const [product] = await sdk.getProducts([id]);
      if (!product) return 'failed';
      await sdk.purchaseStoreProduct(product);
      return 'purchased';
    } catch (err) {
      if (isCancelled(err)) return 'cancelled';
      warn('subscribe', err);
      return 'failed';
    } finally {
      purchasing--;
    }
  }

  async entitlement(): Promise<Entitlement | null> {
    if (!sdk) return null;
    try {
      return toEntitlement(await sdk.getCustomerInfo());
    } catch {
      // Offline: the cache of the profile is kept until it expires.
      return null;
    }
  }

  async restore(): Promise<Entitlement | null> {
    if (!sdk) return null;
    try {
      return toEntitlement(await sdk.restorePurchases());
    } catch (err) {
      warn('restore pass', err);
      return null;
    }
  }
}

/** The ids of the subscription products, for the tests and the paywall. */
export const SUBSCRIPTION_PRODUCT_IDS = SUBSCRIPTION_IDS;

/** Asks the App Store for the real price of every product (in the player's currency); the screens show them once they arrive. */
async function loadStorePrices(purchases: Sdk): Promise<void> {
  try {
    const products = await purchases.getProducts([...PRODUCT_IDS, ...SUBSCRIPTION_IDS]);
    setStorePrices(products.map((p) => ({ id: p.identifier, text: p.priceString, amount: p.price, currency: p.currencyCode })));
  } catch (err) {
    warn('prices', err);
  }
}

/**
 * Starts RevenueCat and plugs the real store in. Returns false (and leaves the simulated store in place) in Expo Go, without a
 * key, or if the module fails to start.
 */
export function startRevenueCat(apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY): boolean {
  if (sdk || !apiKey) return sdk !== null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-purchases') as { default: Sdk };
    const purchases = module.default;
    purchases.configure({ apiKey });
    sdk = purchases;
    purchases.addCustomerInfoUpdateListener((info) => {
      void creditPending(info);
    });
    void purchases.getCustomerInfo().then(creditPending).catch(() => {});
    void loadStorePrices(purchases);
    setPurchasesImplementation(new RevenueCatPurchases());
    setSubscriptionStore(new RevenueCatSubscription());
    return true;
  } catch (err) {
    warn('start', err);
    sdk = null;
    return false;
  }
}
