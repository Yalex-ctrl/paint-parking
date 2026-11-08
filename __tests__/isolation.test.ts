import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { MONETIZATION } from '../src/core/config/monetization';
import { KEPT_KEYS, KEYS, PROGRESS_KEYS } from '../src/core/storage/keys';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(root, rel)).isDirectory() ? files(rel) : /\.(ts|tsx|js|json|md)$/.test(name) ? [rel] : [];
  });
}

describe('no data is shared with Paint Maze on the same phone', () => {
  it('every storage key has the Paint Parking prefix', () => {
    for (const key of Object.values(KEYS)) expect(key.startsWith('paint-parking/')).toBe(true);
    expect([...PROGRESS_KEYS, ...KEPT_KEYS].sort()).toEqual(Object.values(KEYS).sort());
  });

  it('the app has its own identity: slug, scheme, bundle id and package', () => {
    const app = JSON.parse(read('app.json')).expo;
    expect(app.slug).toBe('paint-parking');
    expect(app.scheme).toBe('paintparking');
    expect(app.ios.bundleIdentifier).toBe('com.alexgoepfert.paintparking');
    expect(app.android.package).toBe('com.alexgoepfert.paintparking');
    expect(app.name).toBe('Paint Parking');
  });

  it('the products of the stores have their own identifiers', () => {
    const ids = [
      MONETIZATION.vip.products.monthly.id,
      MONETIZATION.vip.products.yearly.id,
      MONETIZATION.piggy.product.id,
      MONETIZATION.lives.infiniteHour.id,
      MONETIZATION.lives.infiniteDay.id,
      MONETIZATION.products.removeAds.id,
      MONETIZATION.products.coinPacks.map((p) => p.id),
    ].flat();
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) expect(id.startsWith('paintparking_')).toBe(true);
  });

  it('no identifier, key or address of Paint Maze is left in the code, the scripts or the config', () => {
    const list = [...files('src'), ...files('scripts'), ...files('__tests__'), 'app.json', 'eas.json', 'package.json', 'languages/en.json', 'languages/fr.json'].filter((f) => !f.endsWith('isolation.test.ts'));
    for (const f of list) {
      const text = read(f);
      expect({ f, hit: /paint-maze|paintmaze/i.test(text) }).toEqual({ f, hit: false });
    }
  });

  it('the name shown to players is Paint Parking everywhere', () => {
    for (const f of ['src/core/i18n/fr.json', 'src/core/i18n/en.json', 'languages/en.json', 'languages/fr.json', 'app.json', 'docs/store/fr.md', 'docs/store/en.md']) {
      expect({ f, hit: /Paint Maze/.test(read(f)) }).toEqual({ f, hit: false });
    }
  });

  it('none of the production identifiers of Paint Maze was carried over', () => {
    const eas = read('eas.json');
    const app = read('app.json');
    for (const forbidden of ['appl_', 'ca-app-pub-4162283159262767', '6830656968', '9894C946R8', 'AuthKey_', '93c4c7bb']) {
      expect(eas.includes(forbidden)).toBe(false);
      expect(app.includes(forbidden)).toBe(false);
    }
  });
});

describe('the builds', () => {
  it('turn the tester tools on in development and preview, and never in production', () => {
    const { build } = JSON.parse(read('eas.json'));
    expect(build.development.env.EXPO_PUBLIC_TESTER_TOOLS).toBe('true');
    expect(build.preview.env.EXPO_PUBLIC_TESTER_TOOLS).toBe('true');
    expect(build.production.env.EXPO_PUBLIC_TESTER_TOOLS).toBe('false');
  });
});
