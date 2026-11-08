/** The AdMob layer (services/admob.ts): in Expo Go the simulated ads stay; with the module, the real ones are plugged in and test units are used. */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/audio', () => ({ setAdPlaying: jest.fn() }));

describe('without the native module (Expo Go)', () => {
  test('the simulated ads stay', () => {
    jest.resetModules();
    jest.doMock('react-native-google-mobile-ads', () => ({ __esModule: true, default: () => { throw new Error('native module missing'); }, TestIds: {} }), { virtual: true });
    const admob = require('../src/services/admob');
    expect(admob.startAdMob()).toBe(false);
    expect(admob.adsStarted()).toBe(false);
    expect(admob.adsReady()).toBe(false);
  });
});

describe('with the native module', () => {
  beforeEach(() => {
    jest.resetModules();
    // The native part is looked up before the package is loaded (see startAdMob).
    jest.spyOn(require('react-native').TurboModuleRegistry, 'get').mockReturnValue({} as never);
    jest.doMock('react-native-google-mobile-ads', () => ({ __esModule: true, default: () => ({}), TestIds: { INTERSTITIAL: 'test-interstitial', REWARDED: 'test-rewarded', BANNER: 'test-banner' } }), { virtual: true });
  });

  test('plugs the real ads in and uses Google test units while no real id is given', () => {
    const admob = require('../src/services/admob');
    expect(admob.startAdMob()).toBe(true);
    expect(admob.adsStarted()).toBe(true);
    expect(admob.adUnitId('rewarded')).toBe('test-rewarded');
    expect(admob.adUnitId('banner')).toBe('test-banner');
    expect(admob.adUnitId('interstitial')).toBe('test-interstitial');
  });

  test('asks for no ad before the consent and the SDK are ready', () => {
    const admob = require('../src/services/admob');
    admob.startAdMob();
    expect(admob.adsReady()).toBe(false);
  });
});
