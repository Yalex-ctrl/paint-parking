jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import fs from 'fs';
import path from 'path';

import { MONETIZATION } from '../src/core/config/monetization';
import { THEMES } from '../src/game/dailyThemes';
import { TIPS } from '../src/core/loadingRules';
import { SHOP_ITEMS } from '../src/core/shopItems';
import { MECHANICS } from '../src/game/types';
import { TOUR_STEPS } from '../src/core/tour/steps';
import i18n, { currentLanguage, formatDecimal, formatEur, formatNumber, loadLanguage, setLanguage, t } from '../src/core/i18n';
import { FALLBACK_LANGUAGE, LANGUAGES, resolveLanguage } from '../src/core/i18n/languages';
import { KEYS } from '../src/core/storage/keys';
import { loadSettings } from '../src/core/storage/settings';

type Tree = { [key: string]: string | Tree };
const fr = LANGUAGES[0].resources as Tree;
const en = LANGUAGES[1].resources as Tree;

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else Object.assign(out, flatten(v, `${prefix}${k}.`));
  }
  return out;
}
const flatFr = flatten(fr);
const flatEn = flatten(en);
const variablesOf = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

beforeEach(async () => {
  await AsyncStorage.clear();
  await i18n.changeLanguage('fr');
});

describe('the language files', () => {
  it('have the same keys: every French key has an English one, and the other way round', () => {
    const missingInEn = Object.keys(flatFr).filter((k) => !(k in flatEn));
    const missingInFr = Object.keys(flatEn).filter((k) => !(k in flatFr));
    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] });
  });

  it('no text is empty, and the English is never the French left as it was (but for names and numbers)', () => {
    for (const [k, v] of Object.entries(flatEn)) expect({ k, empty: v.trim() === '' }).toEqual({ k, empty: false });
    const same = Object.keys(flatFr).filter((k) => flatFr[k] === flatEn[k] && /[a-zà-ÿ]{4,}/i.test(flatFr[k]));
    // Names that are the same in both languages are fine; a sentence that was not translated is not.
    const sentences = same.filter((k) => /\s/.test(flatFr[k].trim()) && flatFr[k].split(/\s+/).length > 2);
    expect(sentences).toEqual([]);
  });

  it('use the same variables in both languages ({{name}}, {{count}}...)', () => {
    for (const k of Object.keys(flatFr)) {
      if (k in flatEn) expect({ k, vars: variablesOf(flatEn[k]) }).toEqual({ k, vars: variablesOf(flatFr[k]) });
    }
  });

  it('every key written in the code exists (t(\'a.b\') anywhere in src)', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) {
          const src = fs.readFileSync(p, 'utf8');
          for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
        }
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    const exists = (key: string) => key in flatFr || Object.keys(flatFr).some((k) => k.startsWith(`${key}_`));
    expect([...used].filter((k) => !exists(k)).sort()).toEqual([]);
  });

  it('cover the families of texts that are built from an id: items, worlds, pictures, themes, tour steps, tips, mechanics', () => {
    const need: string[] = [];
    for (const i of SHOP_ITEMS) need.push(`items.${i.id}`);
    for (const w of ['forest', 'meadow', 'autumn', 'snow', 'desert', 'daily']) need.push(`worlds.${w}`);
    for (let i = 0; i < 25; i++) need.push(`gallery.pictures.${i}`);
    for (const th of THEMES) need.push(`daily.themes.${th}`);
    for (const s of TOUR_STEPS) need.push(`tour.steps.${s.text}`);
    for (const tip of TIPS) need.push(`loading.tips.${tip}`);
    for (const m of MECHANICS) need.push(`tutorial.${m}`);
    for (const r of ['common', 'rare', 'epic', 'legendary']) need.push(`shop.rarity.${r}`);
    for (const e of ['starter', 'day7', 'streak7', 'streak30', 'chest', 'world', 'ads', 'vip']) need.push(`shop.how.${e}`);
    for (const b of ['noAds', 'coins', 'lives', 'ball', 'spin']) need.push(`vip.benefit.${b}`, `vip.benefit.${b}Sub`);
    for (const f of ['all', 'owned', 'common', 'rare', 'epic', 'legendary']) need.push(`shop.filter.${f}`);
    expect(need.filter((k) => !(k in flatFr) || !(k in flatEn))).toEqual([]);
  });

  it('adding a language is one file and one line: the registry lists them all', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['fr', 'en']);
    expect(LANGUAGES.map((l) => l.label)).toEqual(['Français', 'English']);
  });
});

describe('the language of the app', () => {
  it('a phone in French gives French; any other phone gives English', () => {
    expect(resolveLanguage(null, ['fr-FR'])).toBe('fr');
    expect(resolveLanguage(null, ['fr'])).toBe('fr');
    expect(resolveLanguage(null, ['fr-CA', 'en-US'])).toBe('fr');
    expect(resolveLanguage(null, ['en-GB'])).toBe('en');
    expect(resolveLanguage(null, ['de-DE', 'ja-JP'])).toBe('en');
    expect(resolveLanguage(null, [])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(undefined, ['es'])).toBe('en');
  });

  it('a French phone with English chosen in the settings stays in English', () => {
    expect(resolveLanguage('en', ['fr-FR'])).toBe('en');
    expect(resolveLanguage('xx', ['fr-FR'])).toBe('fr'); // a language that does not exist is ignored
  });

  it('the choice applies at once, is saved, and is found again at the next launch', async () => {
    expect(currentLanguage()).toBe('fr');
    expect(t('common.play')).toBe('Jouer');
    await setLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(t('common.play')).toBe('Play');
    expect((await loadSettings()).language).toBe('en');
    expect(await AsyncStorage.getItem(KEYS.settings)).toContain('"language":"en"');
    // the next launch: the app starts in the language of the phone, then reads the choice
    await i18n.changeLanguage('fr');
    expect(await loadLanguage()).toBe('en');
    expect(t('common.play')).toBe('Play');
    await setLanguage('fr');
    expect(t('common.play')).toBe('Jouer');
  });
});

describe('plurals and variables, in both languages', () => {
  it('say 1 day / 2 days, 1 jour / 2 jours', async () => {
    expect(t('daily.streak', { count: 1 })).toBe('Série : 1 jour');
    expect(t('daily.streak', { count: 2 })).toBe('Série : 2 jours');
    expect(t('trial.badge', { count: 1 })).toBe('Essai : 1 niveau restant');
    expect(t('trial.badge', { count: 3 })).toBe('Essai : 3 niveaux restants');
    expect(t('gallery.done', { count: 3 })).toBe('3 tableaux terminés');
    await i18n.changeLanguage('en');
    expect(t('daily.streak', { count: 1 })).toBe('Streak: 1 day');
    expect(t('daily.streak', { count: 2 })).toBe('Streak: 2 days');
    expect(t('trial.badge', { count: 1 })).toBe('Trial: 1 level left');
    expect(t('trial.badge', { count: 3 })).toBe('Trial: 3 levels left');
    expect(t('game.moves', { count: 1 })).toBe('1 move');
    expect(t('game.moves', { count: 12 })).toBe('12 moves');
    expect(t('notifications.streak', { count: 3 })).toBe('Your 3-day streak is in danger 🔥');
  });

  it('put the variables in the sentence, never glue pieces together', () => {
    expect(t('tour.steps.shopBalls', { balls: 59, paints: 37 })).toBe('Plus de 59 balles à débloquer.');
    expect(t('lives.adLife', { count: 2 })).toBe('+1 vie (pub) · 2 aujourd’hui');
  });
});

describe('numbers, prices and dates go through Intl', () => {
  it('1 240 in French, 1,240 in English; 2,99 € / €2.99', async () => {
    expect(formatNumber(1240)).toMatch(/^1[\s  ]240$/);
    expect(formatEur(2.99)).toMatch(/^2,99[\s ]€$/);
    expect(formatDecimal(0.7, 1)).toBe('0,7');
    await i18n.changeLanguage('en');
    expect(formatNumber(1240)).toBe('1,240');
    expect(formatEur(2.99)).toBe('€2.99');
    expect(formatDecimal(0.7, 1)).toBe('0.7');
  });

  it('the VIP prices read the same way in both languages', async () => {
    expect(formatEur(MONETIZATION.vip.products.monthly.priceEur)).toMatch(/3,99/);
    await i18n.changeLanguage('en');
    expect(formatEur(MONETIZATION.vip.products.yearly.priceEur)).toBe('€29.99');
  });
});

describe('the store texts', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  it('the app.json lists both languages for the native texts of iOS, with the same app name', () => {
    const app = JSON.parse(read('app.json')).expo;
    expect(Object.keys(app.locales).sort()).toEqual(['en', 'fr']);
    for (const lang of ['fr', 'en']) {
      const file = JSON.parse(read(app.locales[lang].replace('./', '')));
      expect(file.ios.CFBundleDisplayName).toBe('Paint Parking');
      expect(file.ios.NSUserTrackingUsageDescription.length).toBeGreaterThan(20);
    }
  });

  it('docs/store/fr.md and en.md respect the limits of the App Store', () => {
    const labels = {
      fr: { name: 'Nom', subtitle: 'Sous-titre', keywords: 'Mots-clés', promo: 'Texte promotionnel' },
      en: { name: 'Name', subtitle: 'Subtitle', keywords: 'Keywords', promo: 'Promotional text' },
    } as const;
    for (const lang of ['fr', 'en'] as const) {
      const md = read(`docs/store/${lang}.md`);
      const field = (label: string) => {
        const m = md.match(new RegExp(String.raw`\*\*${label}[^\n]*\*\*\s*\n+([^\n]+)`));
        return m ? m[1].trim() : '';
      };
      const l = labels[lang];
      expect(field(l.name)).toBe('Paint Parking');
      expect(field(l.subtitle).length).toBeGreaterThan(0);
      expect(field(l.subtitle).length).toBeLessThanOrEqual(30);
      const keywords = field(l.keywords);
      expect(keywords.length).toBeGreaterThan(20);
      expect(keywords.length).toBeLessThanOrEqual(100);
      expect(keywords).not.toMatch(/,\s|\s,/);
      expect(field(l.promo).length).toBeGreaterThan(50);
      expect(field(l.promo).length).toBeLessThanOrEqual(170);
      // five captions for the screenshots
      expect(md.match(/^[1-5]\. .+$/gm)).toHaveLength(5);
      // every in-app purchase: a name of 30 characters or less and a description of 45 or less, the VIP pass included
      const rows = [...md.matchAll(/^\| `([a-z_0-9]+)` \| ([^|]+) \| ([^|]+) \|$/gm)];
      expect(rows.map((r) => r[1])).toEqual(expect.arrayContaining(['paintparking_vip_monthly', 'paintparking_vip_yearly', 'paintparking_no_ads', 'paintparking_starter_pack', 'paintparking_coins_1000', 'paintparking_coins_3000', 'paintparking_coins_10000', 'paintparking_piggy_bank', 'paintparking_infinite_lives_1h', 'paintparking_infinite_lives_24h']));
      for (const r of rows) {
        expect({ id: r[1], ok: r[2].trim().length <= 30 }).toEqual({ id: r[1], ok: true });
        expect({ id: r[1], ok: r[3].trim().length <= 45 }).toEqual({ id: r[1], ok: true });
      }
      // the links of the paywall are in the description
      expect(md).toContain(MONETIZATION.vip.links.terms);
      expect(md).toContain(MONETIZATION.vip.links.privacy);
    }
  });
});
