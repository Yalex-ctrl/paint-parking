/**
 * Minimal App Store Connect API client (no dependency, no secret in the repository).
 *
 * The private key (.p8) lives OUTSIDE the repository; this file only reads its path and the ids from the environment, with the
 * non-secret ids of this project as defaults:
 *   ASC_KEY_PATH   C:\Users\<you>\.appstoreconnect\private_keys\AuthKey_<KEYID>.p8
 *   ASC_KEY_ID     32J6W4WF36
 *   ASC_ISSUER_ID  25b8fa20-4d7c-4a63-ba6a-b17c02176b15
 *
 * Usage from another script:  const { api } = require('./asc');  await api('GET', '/v1/apps/6830656968');
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KEY_ID = process.env.ASC_KEY_ID ?? '32J6W4WF36';
const ISSUER_ID = process.env.ASC_ISSUER_ID ?? '25b8fa20-4d7c-4a63-ba6a-b17c02176b15';
const KEY_PATH = process.env.ASC_KEY_PATH ?? path.join(os.homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`);
const APP_ID = process.env.ASC_APP_ID ?? '6830656968';

const b64 = (input) => Buffer.from(input).toString('base64url');

function token() {
  const header = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: fs.readFileSync(KEY_PATH), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64(signature)}`;
}

/** One call to the API; throws with Apple's own error text. Returns the parsed JSON (or null for an empty answer). */
async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.appstoreconnect.apple.com${url}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}\n${JSON.stringify(json?.errors ?? json, null, 2)}`);
  return json;
}

module.exports = { api, APP_ID };

if (require.main === module) {
  api('GET', `/v1/apps/${APP_ID}`)
    .then((r) => console.log(`OK: ${r.data.attributes.name} (${r.data.attributes.bundleId})`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
