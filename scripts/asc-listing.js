/**
 * Fills the App Store listing of Paint Parking through the API, from docs/store/en.md and docs/store/fr.md: subtitle, keywords, promotional
 * text, description, URLs, category, copyright, age rating answers, price (free) and availability. Safe to run again.
 *   node scripts/asc-listing.js
 * Not done here (App Store Connect has no API for them): the "App Privacy" answers, the screenshots (see asc-screenshots.js), the
 * review contact phone number.
 */
const fs = require('node:fs');
const path = require('node:path');
const { api, APP_ID } = require('./asc');

const SITE = 'https://yalex-ctrl.github.io/paint-parking-site';
const URLS = { privacy: `${SITE}/privacy.html`, support: `${SITE}/support.html`, marketing: `${SITE}/index.html` };
const OLD_LINKS = /https:\/\/paintparking\.example\.com\/(terms|privacy)/g;
const NEW_LINKS = (_, kind) => `${SITE}/${kind}.html`;
const NAME = 'Paint Parking: Roll & Color';

/** Text of a "**Heading ...**" block of the markdown files, up to the next heading. */
function field(md, startsWith) {
  const lines = md.split('\n');
  const at = lines.findIndex((l) => l.startsWith('**') && l.replace(/\*/g, '').toLowerCase().startsWith(startsWith.toLowerCase()));
  if (at < 0) throw new Error(`Missing "${startsWith}"`);
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].startsWith('**') || lines[i].startsWith('## ')) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

const read = (f) => fs.readFileSync(path.resolve(__dirname, '../docs/store', f), 'utf8');
const LOCALES = [
  { locale: 'en-US', md: read('en.md'), sub: 'Subtitle', keys: 'Keywords', promo: 'Promotional text' },
  { locale: 'fr-FR', md: read('fr.md'), sub: 'Sous-titre', keys: 'Mots-clés', promo: 'Texte promotionnel' },
];

async function upsert(listUrl, createType, parentRel, parentType, parentId, locale, attributes, patchType) {
  const list = (await api('GET', `${listUrl}?limit=50`)).data;
  const existing = list.find((x) => x.attributes.locale === locale);
  if (existing) {
    await api('PATCH', `/v1/${patchType}/${existing.id}`, { data: { type: patchType, id: existing.id, attributes } });
    return existing.id;
  }
  const r = await api('POST', `/v1/${patchType}`, {
    data: { type: patchType, attributes: { locale, ...attributes }, relationships: { [parentRel]: { data: { type: parentType, id: parentId } } } },
  });
  return r.data.id;
}

(async () => {
  const [info] = (await api('GET', `/v1/apps/${APP_ID}/appInfos`)).data;
  const [version] = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION`)).data;

  for (const l of LOCALES) {
    const subtitle = field(l.md, l.sub);
    await upsert(`/v1/appInfos/${info.id}/appInfoLocalizations`, 'appInfoLocalizations', 'appInfo', 'appInfos', info.id, l.locale, { name: NAME, subtitle, privacyPolicyUrl: URLS.privacy }, 'appInfoLocalizations');
    const description = field(l.md, 'Description').replace(OLD_LINKS, NEW_LINKS);
    await upsert(
      `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
      'appStoreVersionLocalizations',
      'appStoreVersion',
      'appStoreVersions',
      version.id,
      l.locale,
      { description, keywords: field(l.md, l.keys), promotionalText: field(l.md, l.promo), supportUrl: URLS.support, marketingUrl: URLS.marketing },
      'appStoreVersionLocalizations',
    );
    console.log(`  texts ${l.locale} ok`);
  }

  // Category: Games > Puzzle, and Casual.
  await api('PATCH', `/v1/appInfos/${info.id}`, {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
        primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_PUZZLE' } },
        primarySubcategoryTwo: { data: { type: 'appCategories', id: 'GAMES_CASUAL' } },
      },
    },
  });
  console.log('  category ok');

  await api('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: '2026 Alexandre Goepfert' } } });

  // Age rating: no violence, no mature content, no real-money gambling, no loot box; the game shows ads.
  const age = (await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
  const none = 'NONE';
  await api('PATCH', `/v1/ageRatingDeclarations/${age.id}`, {
    data: {
      type: 'ageRatingDeclarations',
      id: age.id,
      attributes: {
        alcoholTobaccoOrDrugUseOrReferences: none,
        contests: none,
        gamblingSimulated: none,
        gunsOrOtherWeapons: none,
        horrorOrFearThemes: none,
        matureOrSuggestiveThemes: none,
        medicalOrTreatmentInformation: none,
        profanityOrCrudeHumor: none,
        sexualContentGraphicAndNudity: none,
        sexualContentOrNudity: none,
        violenceCartoonOrFantasy: none,
        violenceRealistic: none,
        violenceRealisticProlongedGraphicOrSadistic: none,
        healthOrWellnessTopics: false,
        gambling: false,
        lootBox: false,
        messagingAndChat: false,
        parentalControls: false,
        unrestrictedWebAccess: false,
        userGeneratedContent: false,
        socialMedia: false,
        advertising: true,
        ageAssurance: false,
      },
    },
  });
  console.log('  age rating ok');

  // Price: free, everywhere.
  const points = (await api('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=FRA&limit=200`)).data;
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('No free price point');
  try {
    await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule`);
  } catch {
    await api('POST', '/v1/appPriceSchedules', {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          baseTerritory: { data: { type: 'territories', id: 'FRA' } },
          manualPrices: { data: [{ type: 'appPrices', id: '${price}' }] },
        },
      },
      included: [{ type: 'appPrices', id: '${price}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } } }],
    });
  }
  console.log('  price ok');
  console.log('done');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
