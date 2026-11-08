jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

describe('first launch', () => {
  it('sends the player straight into level 1 once, then shows the home screen from the 2nd launch on', async () => {
    jest.resetModules();
    const mod = require('@react-native-async-storage/async-storage');
    const storage = mod.default ?? mod;
    await storage.clear();

    // 1st launch of the app ever.
    let launch = require('../src/storage/launch') as typeof import('../src/storage/launch');
    let profile = require('../src/storage/profile') as typeof import('../src/storage/profile');
    expect(await launch.takeFirstLaunch()).toBe(true);
    expect(await launch.takeFirstLaunch()).toBe(false); // coming back to the home in the same session
    expect(profile.getProfile().launches).toBe(1);
    await profile.flushProfile();

    // 2nd launch (a fresh process reading what was saved).
    const saved = await storage.getItem('paint-parking/profile/v1');
    jest.resetModules();
    const mod2 = require('@react-native-async-storage/async-storage');
    await (mod2.default ?? mod2).setItem('paint-parking/profile/v1', saved);
    launch = require('../src/storage/launch');
    profile = require('../src/storage/profile');
    expect(await launch.takeFirstLaunch()).toBe(false);
    expect(profile.getProfile().launches).toBe(2);
  });
});
