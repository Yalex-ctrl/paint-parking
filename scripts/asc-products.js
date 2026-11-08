/**
 * Creates (or completes) the in-app purchases and the VIP subscriptions of Paint Parking in App Store Connect, through the API.
 * Safe to run again: whatever exists is found by its product id and only what is missing is added.
 *
 *   node scripts/asc-products.js            # everything
 *   node scripts/asc-products.js coins_1000 # one product
 *
 * Ids and prices must match src/config/monetization.ts (a test compares the two). Base territory: France (EUR); Apple derives the
 * prices of the other territories.
 */
const { api, APP_ID } = require('./asc');

const BASE = 'FRA';

/** name <= 30 characters, description <= 45. [en, fr] */
const IAPS = [
  { id: 'paintparking_coins_1000', ref: '1000 coins', type: 'CONSUMABLE', price: '1.99', en: ['1,000 Coins', 'A pile of coins for the shop.'], fr: ['1 000 pièces', 'Des pièces pour la boutique.'] },
  { id: 'paintparking_coins_3000', ref: '3000 coins', type: 'CONSUMABLE', price: '4.99', en: ['3,000 Coins', 'A big pile of coins (+20%).'], fr: ['3 000 pièces', 'Un gros tas de pièces (+20 %).'] },
  { id: 'paintparking_coins_10000', ref: '10000 coins', type: 'CONSUMABLE', price: '9.99', en: ['10,000 Coins', 'A chest of coins: best value (+65%).'], fr: ['10 000 pièces', 'Un coffre de pièces : meilleure valeur.'] },
  { id: 'paintparking_piggy_bank', ref: 'Piggy bank', type: 'CONSUMABLE', price: '2.99', en: ['Piggy Bank', 'Break the piggy bank and keep the coins.'], fr: ['Tirelire', 'Casse la tirelire et garde les pièces.'] },
  { id: 'paintparking_infinite_lives_1h', ref: 'Infinite lives 1h', type: 'CONSUMABLE', price: '0.99', en: ['Infinite Lives: 1 hour', 'Play without losing lives for 1 hour.'], fr: ['Vies infinies : 1 heure', 'Joue sans perdre de vie pendant 1 h.'] },
  { id: 'paintparking_infinite_lives_24h', ref: 'Infinite lives 24h', type: 'CONSUMABLE', price: '2.99', en: ['Infinite Lives: 24 hours', 'Play without losing lives for 24 hours.'], fr: ['Vies infinies : 24 heures', 'Joue sans perdre de vie pendant 24 h.'] },
  { id: 'paintparking_no_ads', ref: 'No ads', type: 'NON_CONSUMABLE', price: '5.99', en: ['No Ads', 'Removes the ads between levels for good.'], fr: ['Sans pub', 'Supprime pour toujours les pubs entre niveaux.'] },
  { id: 'paintparking_starter_pack', ref: 'Starter pack', type: 'NON_CONSUMABLE', price: '2.99', en: ['Starter Pack', 'A one-time pack to start in style.'], fr: ['Pack de départ', 'Un pack unique pour bien démarrer.'] },
];

const SUBS = [
  { id: 'paintparking_vip_monthly', ref: 'VIP monthly', period: 'ONE_MONTH', level: 1, price: '3.99', en: ['VIP Pass: Monthly', 'No forced ads, daily coins, infinite lives.'], fr: ['Pass VIP : mensuel', 'Sans pub forcée, pièces par jour, vies infinies.'] },
  { id: 'paintparking_vip_yearly', ref: 'VIP yearly', period: 'ONE_YEAR', level: 2, price: '29.99', en: ['VIP Pass: Yearly', 'No forced ads, daily coins, infinite lives.'], fr: ['Pass VIP : annuel', 'Sans pub forcée, pièces par jour, vies infinies.'] },
];

const LOCALES = { en: 'en-US', fr: 'fr-FR' };
const log = (...a) => console.log(...a);

async function allPages(url) {
  const out = [];
  let next = url;
  while (next) {
    const page = await api('GET', next);
    out.push(...page.data);
    next = page.links?.next ?? null;
  }
  return out;
}

let territoriesCache = null;
const territories = async () => (territoriesCache ??= (await allPages('/v1/territories?limit=200')).map((t) => t.id));

/* ------------------------------------------------------------------------------------------------ in-app purchases */

async function ensureIap(p) {
  const found = (await allPages(`/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`)).find((x) => x.attributes.productId === p.id);
  let id = found?.id;
  if (!id) {
    const r = await api('POST', '/v2/inAppPurchases', {
      data: {
        type: 'inAppPurchases',
        attributes: { name: p.ref, productId: p.id, inAppPurchaseType: p.type, reviewNote: 'Test in the sandbox: open the shop (the "Offres" tab) from the level screen after level 5.' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    id = r.data.id;
    log(`  created ${p.id} (${id})`);
  }

  // Texts
  const locs = await allPages(`/v2/inAppPurchases/${id}/inAppPurchaseLocalizations?limit=50`);
  for (const k of ['en', 'fr']) {
    const locale = LOCALES[k];
    const [name, description] = p[k];
    const existing = locs.find((l) => l.attributes.locale === locale);
    if (existing) {
      await api('PATCH', `/v1/inAppPurchaseLocalizations/${existing.id}`, { data: { type: 'inAppPurchaseLocalizations', id: existing.id, attributes: { name, description } } });
    } else {
      await api('POST', '/v1/inAppPurchaseLocalizations', {
        data: { type: 'inAppPurchaseLocalizations', attributes: { locale, name, description }, relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } },
      });
    }
  }

  // Availability: every territory, and the future ones.
  try {
    await api('GET', `/v2/inAppPurchases/${id}/inAppPurchaseAvailability`);
  } catch {
    const all = await territories();
    await api('POST', '/v1/inAppPurchaseAvailabilities', {
      data: {
        type: 'inAppPurchaseAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id } },
          availableTerritories: { data: all.map((t) => ({ type: 'territories', id: t })) },
        },
      },
    });
  }

  // Price: base territory France.
  let hasPrice = false;
  try {
    const sched = await api('GET', `/v2/inAppPurchases/${id}/iapPriceSchedule?include=manualPrices`);
    hasPrice = (sched.included?.length ?? 0) > 0;
  } catch {
    hasPrice = false;
  }
  if (!hasPrice) {
    const points = await allPages(`/v2/inAppPurchases/${id}/pricePoints?filter[territory]=${BASE}&limit=200`);
    const point = points.find((x) => Number(x.attributes.customerPrice) === Number(p.price));
    if (!point) throw new Error(`No price point at ${p.price} EUR for ${p.id}`);
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id } },
          baseTerritory: { data: { type: 'territories', id: BASE } },
          manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] },
        },
      },
      included: [
        {
          type: 'inAppPurchasePrices',
          id: '${price}',
          attributes: { startDate: null },
          relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point.id } } },
        },
      ],
    });
  }
  log(`  ok ${p.id}`);
  return id;
}

/* ------------------------------------------------------------------------------------------------ subscriptions */

async function ensureGroup() {
  const groups = await allPages(`/v1/apps/${APP_ID}/subscriptionGroups?limit=50`);
  let group = groups.find((g) => g.attributes.referenceName === 'VIP');
  if (!group) {
    group = (
      await api('POST', '/v1/subscriptionGroups', {
        data: { type: 'subscriptionGroups', attributes: { referenceName: 'VIP' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
      })
    ).data;
    log(`  created group VIP (${group.id})`);
  }
  const locs = await allPages(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations?limit=50`);
  for (const k of ['en', 'fr']) {
    const locale = LOCALES[k];
    if (locs.some((l) => l.attributes.locale === locale)) continue;
    await api('POST', '/v1/subscriptionGroupLocalizations', {
      data: { type: 'subscriptionGroupLocalizations', attributes: { locale, name: 'VIP', customAppName: 'Paint Parking' }, relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: group.id } } } },
    });
  }
  return group.id;
}

async function ensureSub(s, groupId) {
  const subs = await allPages(`/v1/subscriptionGroups/${groupId}/subscriptions?limit=50`);
  let sub = subs.find((x) => x.attributes.productId === s.id);
  if (!sub) {
    sub = (
      await api('POST', '/v1/subscriptions', {
        data: {
          type: 'subscriptions',
          attributes: { name: s.ref, productId: s.id, subscriptionPeriod: s.period, groupLevel: s.level, familySharable: false },
          relationships: { group: { data: { type: 'subscriptionGroups', id: groupId } } },
        },
      })
    ).data;
    log(`  created ${s.id} (${sub.id})`);
  }
  const id = sub.id;

  const locs = await allPages(`/v1/subscriptions/${id}/subscriptionLocalizations?limit=50`);
  for (const k of ['en', 'fr']) {
    const locale = LOCALES[k];
    const [name, description] = s[k];
    const existing = locs.find((l) => l.attributes.locale === locale);
    if (existing) {
      await api('PATCH', `/v1/subscriptionLocalizations/${existing.id}`, { data: { type: 'subscriptionLocalizations', id: existing.id, attributes: { name, description } } });
    } else {
      await api('POST', '/v1/subscriptionLocalizations', {
        data: { type: 'subscriptionLocalizations', attributes: { locale, name, description }, relationships: { subscription: { data: { type: 'subscriptions', id } } } },
      });
    }
  }

  try {
    await api('GET', `/v1/subscriptions/${id}/subscriptionAvailability`);
  } catch {
    const all = await territories();
    await api('POST', '/v1/subscriptionAvailabilities', {
      data: {
        type: 'subscriptionAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          subscription: { data: { type: 'subscriptions', id } },
          availableTerritories: { data: all.map((t) => ({ type: 'territories', id: t })) },
        },
      },
    });
  }

  // Price: the France price point, then the equivalent point of every other territory.
  const existingPrices = await allPages(`/v1/subscriptions/${id}/prices?limit=200`);
  if (existingPrices.length === 0) {
    const points = await allPages(`/v1/subscriptions/${id}/pricePoints?filter[territory]=${BASE}&limit=200`);
    const point = points.find((x) => Number(x.attributes.customerPrice) === Number(s.price));
    if (!point) throw new Error(`No price point at ${s.price} EUR for ${s.id}`);
    const equal = await allPages(`/v1/subscriptionPricePoints/${point.id}/equalizations?include=territory&limit=200`);
    const targets = [{ point: point.id, territory: BASE }];
    for (const e of equal) {
      const territory = e.relationships?.territory?.data?.id;
      if (territory && territory !== BASE) targets.push({ point: e.id, territory });
    }
    for (const t of targets) {
      await api('POST', '/v1/subscriptionPrices', {
        data: {
          type: 'subscriptionPrices',
          attributes: { startDate: null, preserveCurrentPrice: false },
          relationships: {
            subscription: { data: { type: 'subscriptions', id } },
            subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: t.point } },
            territory: { data: { type: 'territories', id: t.territory } },
          },
        },
      });
    }
  }
  log(`  ok ${s.id}`);
  return id;
}

(async () => {
  const only = process.argv[2];
  for (const p of IAPS) if (!only || only === p.id) await ensureIap(p);
  const subs = SUBS.filter((s) => !only || only === s.id);
  if (subs.length > 0) {
    const group = await ensureGroup();
    for (const s of subs) await ensureSub(s, group);
  }
  log('done');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
