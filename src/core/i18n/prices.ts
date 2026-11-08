/**
 * The prices the store really charges, in the currency of the player's App Store (RevenueCat gives them once the real store is
 * started). The screens show these when they are known; until then (and in Expo Go, where there is no store) they show the prices of
 * the config in euros.
 */
export type StorePrice = {
  /** The price as the store writes it: "29,99 €", "$29.99". */
  text: string;
  amount: number;
  /** ISO code of the currency: "EUR", "USD". */
  currency: string;
};

const prices = new Map<string, StorePrice>();
const listeners = new Set<() => void>();
let version = 0;

export const getStorePrice = (id: string): StorePrice | undefined => prices.get(id);

export function setStorePrices(entries: { id: string; text: string; amount: number; currency: string }[]): void {
  let changed = false;
  for (const { id, ...price } of entries) {
    if (!price.text || !(price.amount > 0)) continue;
    const old = prices.get(id);
    if (old && old.text === price.text && old.amount === price.amount && old.currency === price.currency) continue;
    prices.set(id, price);
    changed = true;
  }
  if (!changed) return;
  version++;
  listeners.forEach((l) => l());
}

/** Forgets every price (the tests). */
export function clearStorePrices(): void {
  prices.clear();
  version++;
  listeners.forEach((l) => l());
}

export const subscribePrices = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const pricesVersion = () => version;
