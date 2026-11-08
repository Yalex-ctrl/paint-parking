import { formatNumber, priceText, t } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

import { MONETIZATION } from '../config/monetization';
import { applyProduct, applyRestore, isPermanentProduct } from '../game/economy';
import { KEYS } from '../storage/keys';
import { updateProfile } from '../storage/profile';
import { track } from './analytics';
import { noteEvent } from './playClock';

/**
 * Real-money purchases. The game talks to `purchaseProduct` / `restorePurchases` below; what is behind
 * them (`PurchasesService`) can change.
 *
 * Today (Expo Go): a MOCK. Buying shows a confirmation, then succeeds instantly; permanent purchases
 * are remembered on the device so that "Restore purchases" has something to restore.
 *
 * Later (development build), replace it with RevenueCat (`react-native-purchases`):
 *   1. Create the products in App Store Connect / Google Play Console with the ids of
 *      src/config/monetization.ts (no_ads, starter_pack, coins_500, coins_1500, coins_5000;
 *      coin packs are consumables, the other two are non-consumables) and attach them to an entitlement /
 *      offering in the RevenueCat dashboard.
 *   2. `npx expo install react-native-purchases`, add its config plugin, make a development build.
 *   3. `Purchases.configure({ apiKey })` at start-up; implement `PurchasesService`:
 *      `purchase` -> `Purchases.purchaseStoreProduct` (resolve 'cancelled' on userCancelled),
 *      `restore` -> `Purchases.restorePurchases()` mapped to the product ids the customer owns.
 *   4. Call `setPurchasesImplementation(realPurchases)` once at start-up. Nothing else changes.
 */
export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

export interface PurchasesService {
  init(): Promise<void>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  /** The ids of the permanent products this customer already owns (for "Restore purchases"). */
  restore(): Promise<string[]>;
}

export type Product = { id: string; title: string; description: string; price: string; permanent: boolean; coins?: number };

/** What the shop sells, from the config. */
export function listProducts(): Product[] {
  const { removeAds, starterPack, coinPacks } = MONETIZATION.products;
  return [
    { id: removeAds.id, title: t('products.removeAds.title'), description: t('products.removeAds.description'), price: priceText(removeAds.id, removeAds.priceEur), permanent: true },
    {
      id: starterPack.id,
      title: t('products.starter.title'),
      description: t('products.starter.description', { coins: formatNumber(starterPack.coins) }),
      price: priceText(starterPack.id, starterPack.priceEur),
      permanent: true,
    },
    { id: MONETIZATION.lives.infiniteHour.id, title: t('products.livesHour.title'), description: t('products.livesHour.description'), price: priceText(MONETIZATION.lives.infiniteHour.id, MONETIZATION.lives.infiniteHour.priceEur), permanent: false },
    { id: MONETIZATION.lives.infiniteDay.id, title: t('products.livesDay.title'), description: t('products.livesDay.description'), price: priceText(MONETIZATION.lives.infiniteDay.id, MONETIZATION.lives.infiniteDay.priceEur), permanent: false },
    { id: MONETIZATION.piggy.product.id, title: t('products.piggy.title'), description: t('products.piggy.description'), price: priceText(MONETIZATION.piggy.product.id, MONETIZATION.piggy.product.priceEur), permanent: false },
    ...coinPacks.map((c) => ({ id: c.id, title: t('products.coins.title', { amount: formatNumber(c.coins) }), description: t(`products.coins.blurb.${c.blurb}`), price: priceText(c.id, c.priceEur), permanent: false, coins: c.coins })),
  ];
}

const RECEIPTS_KEY = KEYS.mockReceipts;

class MockPurchases implements PurchasesService {
  async init() {}

  purchase(productId: string): Promise<PurchaseOutcome> {
    const product = listProducts().find((p) => p.id === productId);
    if (!product) return Promise.resolve('failed');
    return new Promise((resolve) => {
      Alert.alert(
        t('purchases.simulated.title'),
        `${product.title} — ${product.price}

${t('purchases.simulated.body')}`,
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancelled') },
          { text: t('common.buy'), onPress: () => resolve('purchased') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancelled') },
      );
    });
  }

  async restore(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
}

let impl: PurchasesService = new MockPurchases();

export function setPurchasesImplementation(next: PurchasesService) {
  impl = next;
}

export const initPurchases = () => impl.init();

async function remember(productId: string) {
  try {
    const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
    const list = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    list.add(productId);
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify([...list]));
  } catch {
    // The profile is already updated for this session.
  }
}

/** Buys a product and grants it. Returns true when the purchase went through. */
export async function purchaseProduct(productId: string): Promise<boolean> {
  const outcome = await impl.purchase(productId);
  if (outcome !== 'purchased') return false;
  if (isPermanentProduct(productId)) await remember(productId);
  updateProfile((p) => applyProduct(p, productId) ?? p);
  // No interstitial right after a purchase.
  noteEvent();
  const product = listProducts().find((p) => p.id === productId);
  track('purchase', { product: productId, price: product?.price });
  return true;
}

/** Tester tool: forgets the purchases of the simulated store and takes back what they gave (no ads removed, no starter pack bought). */
export async function resetPurchases(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECEIPTS_KEY);
  } catch {
    // The profile is reset all the same.
  }
  updateProfile((p) => ({ ...p, adsRemoved: false, starter: { ...p.starter, purchased: false } }));
}

/** "Restore purchases": gives back the permanent products. Returns the ids restored. */
export async function restorePurchases(): Promise<string[]> {
  const ids = await impl.restore();
  if (ids.length > 0) updateProfile((p) => applyRestore(p, ids));
  return ids;
}
