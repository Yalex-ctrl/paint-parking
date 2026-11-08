/* eslint-disable import/no-named-as-default-member -- i18n is the default instance of i18next, used as its docs do */
import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, LANGUAGES, resolveLanguage, type LanguageCode } from './languages';
import { getStorePrice, pricesVersion, subscribePrices } from './prices';

export { useTranslation } from 'react-i18next';
export { LANGUAGES, type LanguageCode } from './languages';

function phoneLanguages(): string[] {
  try {
    // Read when asked, so the rules that only translate a text can run in plain Node (scripts, tests) without the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    return getLocales().map((l) => l.languageCode ?? l.languageTag);
  } catch {
    return [];
  }
}

const resources = Object.fromEntries(LANGUAGES.map((l) => [l.code, { translation: l.resources }]));

/** Starts i18next with the language of the phone (the one the player chose is read right after, see `loadLanguage`). */
void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(null, phoneLanguages()),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

/** The translation function, for what is not a component (toasts, the ad wrapper, notifications). */
export const t = i18n.t.bind(i18n);

export const currentLanguage = (): LanguageCode => resolveLanguage(i18n.language, []);

const listeners = new Set<() => void>();
i18n.on('languageChanged', () => listeners.forEach((l) => l()));

/** Re-renders when the language changes (the formatters below depend on it), and when the store's real prices arrive. */
export function useLanguage(): LanguageCode {
  useSyncExternalStore(subscribePrices, pricesVersion, pricesVersion);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentLanguage,
    currentLanguage,
  );
}

/** At launch: the language the player chose in the settings, if any. */
// (The settings are loaded when needed: the pure rules that only translate texts must not pull the storage in with them.)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const settingsStore = async () => require('../storage/settings') as typeof import('../storage/settings');

export async function loadLanguage(): Promise<LanguageCode> {
  const settings = await (await settingsStore()).loadSettings();
  const code = resolveLanguage(settings.language, phoneLanguages());
  if (code !== currentLanguage()) await i18n.changeLanguage(code);
  return code;
}

/** The player's choice in the settings: applies at once and is kept. */
export async function setLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  const { loadSettings, saveSettings } = await settingsStore();
  await saveSettings({ ...(await loadSettings()), language: code });
}

/* Numbers, prices and dates always go through Intl, in the language on screen: 1 240 / 1,240. */
export const formatNumber = (n: number): string => new Intl.NumberFormat(currentLanguage()).format(n);
export const formatDecimal = (n: number, digits = 1): string => new Intl.NumberFormat(currentLanguage(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const formatEur = (n: number): string => new Intl.NumberFormat(currentLanguage(), { style: 'currency', currency: 'EUR' }).format(n);
/** The price of a product: the one the App Store charges when it is known, else the one of the config in euros. */
export const priceText = (id: string, eur: number): string => getStorePrice(id)?.text ?? formatEur(eur);

const formatMoney = (n: number, currency: string): string => new Intl.NumberFormat(currentLanguage(), { style: 'currency', currency }).format(n);

/** What the yearly plan costs by the month, in the currency of the store when it is known. */
export function yearlyMonthlyText(yearlyId: string, yearlyEur: number): string {
  const real = getStorePrice(yearlyId);
  return real ? formatMoney(real.amount / 12, real.currency) : formatEur(yearlyEur / 12);
}

/** The share the yearly plan saves against twelve monthly ones, from the real prices when both are known. */
export function realYearlySaving(yearlyId: string, monthlyId: string): number | null {
  const y = getStorePrice(yearlyId);
  const m = getStorePrice(monthlyId);
  return y && m && y.currency === m.currency ? 1 - y.amount / (12 * m.amount) : null;
}

export const formatPercent =(fraction: number): string => new Intl.NumberFormat(currentLanguage(), { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
export const formatDate = (d: Date | number, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string => new Intl.DateTimeFormat(currentLanguage(), options).format(d);

export default i18n;
