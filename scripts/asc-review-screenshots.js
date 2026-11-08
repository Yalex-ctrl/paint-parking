/**
 * Attaches the App Review screenshot (a shop screen) to every in-app purchase and subscription of Paint Parking.
 *   node scripts/asc-review-screenshots.js <path to a PNG/JPEG of the shop>
 * Safe to run again: a product that already has a screenshot is left alone (a failed one is replaced).
 * Accepted sizes include 1242x2688 (the 6.5-inch portrait size): 828x1792 is refused.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { api, APP_ID } = require('./asc');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/asc-review-screenshots.js <image file>');
  process.exit(1);
}
const bytes = fs.readFileSync(file);
const checksum = crypto.createHash('md5').update(bytes).digest('hex');
const fileName = path.basename(file);

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

async function upload(kind, parentType, parentRel, id) {
  const res = await api('POST', `/v1/${kind}`, {
    data: { type: kind, attributes: { fileName, fileSize: bytes.length }, relationships: { [parentRel]: { data: { type: parentType, id } } } },
  });
  for (const op of res.data.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  }
  await api('PATCH', `/v1/${kind}/${res.data.id}`, { data: { type: kind, id: res.data.id, attributes: { uploaded: true, sourceFileChecksum: checksum } } });
}

(async () => {
  for (const p of await allPages(`/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`)) {
    const id = p.id;
    let has = false;
    try {
      const shot = (await api('GET', `/v2/inAppPurchases/${id}/appStoreReviewScreenshot`)).data;
      has = !!shot && shot.attributes.assetDeliveryState?.state !== 'FAILED';
      if (shot && !has) await api('DELETE', `/v1/inAppPurchaseAppStoreReviewScreenshots/${shot.id}`);
    } catch {
      has = false;
    }
    if (!has) await upload('inAppPurchaseAppStoreReviewScreenshots', 'inAppPurchases', 'inAppPurchaseV2', id);
    console.log('  ok', p.attributes.productId);
  }
  for (const g of await allPages(`/v1/apps/${APP_ID}/subscriptionGroups?limit=50`)) {
    for (const s of await allPages(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`)) {
      let has = false;
      try {
        const shot = (await api('GET', `/v1/subscriptions/${s.id}/appStoreReviewScreenshot`)).data;
        has = !!shot && shot.attributes.assetDeliveryState?.state !== 'FAILED';
        if (shot && !has) await api('DELETE', `/v1/subscriptionAppStoreReviewScreenshots/${shot.id}`);
      } catch {
        has = false;
      }
      if (!has) await upload('subscriptionAppStoreReviewScreenshots', 'subscriptions', 'subscription', s.id);
      console.log('  ok', s.attributes.productId);
    }
  }
  console.log('done');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
