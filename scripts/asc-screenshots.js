/**
 * Uploads the App Store screenshots through the API: every image of a folder, sorted by name, into the iPhone 6.5-inch set of each
 * language of the version being prepared. A set that already has screenshots is left alone.
 *   node scripts/asc-screenshots.js <folder of 1242x2688 PNG files> [APP_IPHONE_65]
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { api, APP_ID } = require('./asc');

const dir = process.argv[2];
const displayType = process.argv[3] ?? 'APP_IPHONE_65';
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/asc-screenshots.js <folder> [displayType]');
  process.exit(1);
}
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

async function upload(setId, file) {
  const bytes = fs.readFileSync(path.join(dir, file));
  const res = await api('POST', '/v1/appScreenshots', {
    data: { type: 'appScreenshots', attributes: { fileName: file, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } },
  });
  for (const op of res.data.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  }
  await api('PATCH', `/v1/appScreenshots/${res.data.id}`, {
    data: { type: 'appScreenshots', id: res.data.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } },
  });
}

(async () => {
  const [version] = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION`)).data;
  const locs = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
  for (const loc of locs) {
    const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
    let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
    if (!set) {
      set = (
        await api('POST', '/v1/appScreenshotSets', {
          data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } },
        })
      ).data;
    }
    const have = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
    if (have.length > 0) {
      console.log(`  ${loc.attributes.locale}: already has ${have.length} screenshots`);
      continue;
    }
    for (const f of files) await upload(set.id, f);
    console.log(`  ${loc.attributes.locale}: ${files.length} screenshots`);
  }
  console.log('done');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
