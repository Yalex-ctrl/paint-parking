import { defaultProfile } from '../src/game/economy';
import { DAY_MS, autoRenewSimulated, expireVip, startVip } from '../src/game/vip';

describe('the simulated pass renews by itself', () => {
  const t0 = Date.UTC(2026, 9, 1);

  it('moves the date of the renewal forward, as many periods as it takes, so it is always in the future', () => {
    const started = startVip(defaultProfile(), 'monthly', t0);
    const later = t0 + 100 * DAY_MS;
    const renewed = autoRenewSimulated(started, later);
    expect(renewed.vip.expiresAt).toBeGreaterThan(later);
    expect(renewed.vip.expiresAt - later).toBeLessThanOrEqual(30 * DAY_MS);
    expect(renewed.vip.plan).toBe('monthly');
  });

  it('does nothing while the period is not over, and for a pass that never existed', () => {
    const started = startVip(defaultProfile(), 'yearly', t0);
    expect(autoRenewSimulated(started, t0 + DAY_MS)).toBe(started);
    const none = defaultProfile();
    expect(autoRenewSimulated(none, t0)).toBe(none);
  });

  it('does not renew a pass that the test tools made expire', () => {
    const expired = expireVip(startVip(defaultProfile(), 'monthly', t0), t0 + DAY_MS);
    expect(autoRenewSimulated(expired, t0 + 40 * DAY_MS)).toBe(expired);
  });
});
