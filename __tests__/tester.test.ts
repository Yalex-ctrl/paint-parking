import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { shiftTime } from '../src/core/testerClock';

describe('the tester tools', () => {
  const eas = JSON.parse(readFileSync(resolve(__dirname, '../eas.json'), 'utf8')) as { build: Record<string, { env?: Record<string, string> }> };

  it('are on in the development and preview builds, and OFF in the production one', () => {
    expect(eas.build.development.env?.EXPO_PUBLIC_TESTER_TOOLS).toBe('true');
    expect(eas.build.preview.env?.EXPO_PUBLIC_TESTER_TOOLS).toBe('true');
    // The production profile must name the variable and turn it off: a test that fails the day somebody turns it on.
    expect(eas.build.production.env?.EXPO_PUBLIC_TESTER_TOOLS).toBe('false');
    // No other profile can reach the stores with them.
    for (const [name, profile] of Object.entries(eas.build)) {
      if (!['development', 'preview'].includes(name)) expect({ name, on: profile.env?.EXPO_PUBLIC_TESTER_TOOLS === 'true' }).toEqual({ name, on: false });
    }
  });

  it('do not exist for a player: no flag and not a development build', () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const wasDev = g.__DEV__;
    const wasFlag = process.env.EXPO_PUBLIC_TESTER_TOOLS;
    try {
      g.__DEV__ = false;
      delete process.env.EXPO_PUBLIC_TESTER_TOOLS;
      jest.isolateModules(() => {
        const { testerTools } = require('../src/core/config/tester') as typeof import('../src/core/config/tester');
        const { openLevelsOn, freeCameraOn } = require('../src/core/config/features') as typeof import('../src/core/config/features');
        expect(testerTools()).toBe(false);
        expect(openLevelsOn()).toBe(false);
        expect(freeCameraOn()).toBe(false);
      });
      process.env.EXPO_PUBLIC_TESTER_TOOLS = 'false';
      jest.isolateModules(() => {
        expect((require('../src/core/config/tester') as typeof import('../src/core/config/tester')).testerTools()).toBe(false);
      });
      process.env.EXPO_PUBLIC_TESTER_TOOLS = 'true';
      jest.isolateModules(() => {
        expect((require('../src/core/config/tester') as typeof import('../src/core/config/tester')).testerTools()).toBe(true);
      });
    } finally {
      g.__DEV__ = wasDev;
      if (wasFlag === undefined) delete process.env.EXPO_PUBLIC_TESTER_TOOLS;
      else process.env.EXPO_PUBLIC_TESTER_TOOLS = wasFlag;
    }
  });

  it('move the clock forward by moving every kept date back', () => {
    const now = 1_800_000_000_000;
    const profile = { coins: 12, starter: { offeredAt: now - 1000 }, vip: { dailyClaim: '2026-11-02', expiresAt: now + 86_400_000 }, lives: { since: now } };
    const next = shiftTime(profile, 86_400_000);
    expect(next.coins).toBe(12);
    expect(next.starter.offeredAt).toBe(now - 1000 - 86_400_000);
    expect(next.vip.expiresAt).toBe(now);
    expect(next.vip.dailyClaim).toBe('2026-11-01');
    expect(next.lives.since).toBe(now - 86_400_000);
    // half an hour moves the timers and leaves the days alone
    expect(shiftTime(profile, 1_800_000).vip.dailyClaim).toBe('2026-11-02');
  });
});
