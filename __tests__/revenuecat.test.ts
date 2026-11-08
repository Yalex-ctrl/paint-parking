/**
 * The RevenueCat store (services/revenuecat.ts) against a fake SDK: a purchase credits once, a cancelled one nothing, an interrupted
 * one is credited at the next launch (once), the pass is read from the "vip" entitlement, and without a key the simulated store stays.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockSdk = {
  configure: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  getProducts: jest.fn(),
  purchaseStoreProduct: jest.fn(),
  getCustomerInfo: jest.fn(),
  restorePurchases: jest.fn(),
};
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockSdk }), { virtual: true });

const info = (over: Record<string, unknown> = {}) => ({ entitlements: { active: {}, all: {} }, nonSubscriptionTransactions: [], ...over });

let purchases: typeof import('../src/services/purchases');
let subscription: typeof import('../src/services/subscription');
let rc: typeof import('../src/services/revenuecat');
let profile: typeof import('../src/storage/profile');

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  jest.resetModules();
  Object.values(mockSdk).forEach((m) => m.mockReset());
  mockSdk.getCustomerInfo.mockResolvedValue(info());
  mockSdk.getProducts.mockImplementation(async (ids: string[]) => ids.map((id) => ({ identifier: id })));
  purchases = require('../src/services/purchases');
  subscription = require('../src/services/subscription');
  rc = require('../src/services/revenuecat');
  profile = require('../src/storage/profile');
  await profile.loadProfile?.();
});

describe('starting', () => {
  test('without a key the simulated store stays', () => {
    expect(rc.startRevenueCat('')).toBe(false);
    expect(mockSdk.configure).not.toHaveBeenCalled();
  });

  test('with a key the SDK is configured once', () => {
    expect(rc.startRevenueCat('appl_test')).toBe(true);
    expect(rc.startRevenueCat('appl_test')).toBe(true);
    expect(mockSdk.configure).toHaveBeenCalledTimes(1);
    expect(mockSdk.configure).toHaveBeenCalledWith({ apiKey: 'appl_test' });
  });
});

describe('a purchase', () => {
  test('is credited once, and the interrupted copy of it at the next launch is not credited again', async () => {
    rc.startRevenueCat('appl_test');
    const before = profile.getProfile().coins;
    mockSdk.purchaseStoreProduct.mockResolvedValue({ transaction: { transactionIdentifier: 'T1' } });
    expect(await purchases.purchaseProduct('paintparking_coins_1000')).toBe(true);
    const after = profile.getProfile().coins;
    expect(after).toBe(before + 1000);

    // RevenueCat reports the same transaction: nothing more is given.
    const listener = mockSdk.addCustomerInfoUpdateListener.mock.calls[0][0];
    listener(info({ nonSubscriptionTransactions: [{ transactionIdentifier: 'T1', productIdentifier: 'paintparking_coins_1000' }] }));
    await flush();
    expect(profile.getProfile().coins).toBe(after);
  });

  test('an interrupted purchase is credited when it shows up, once', async () => {
    rc.startRevenueCat('appl_test');
    const before = profile.getProfile().coins;
    const listener = mockSdk.addCustomerInfoUpdateListener.mock.calls[0][0];
    const late = info({ nonSubscriptionTransactions: [{ transactionIdentifier: 'T9', productIdentifier: 'paintparking_coins_3000' }] });
    listener(late);
    await flush();
    listener(late);
    await flush();
    expect(profile.getProfile().coins).toBe(before + 3000);
  });

  test('cancelled or failed credits nothing', async () => {
    rc.startRevenueCat('appl_test');
    const before = profile.getProfile().coins;
    mockSdk.purchaseStoreProduct.mockRejectedValueOnce({ userCancelled: true, code: '1' });
    expect(await purchases.purchaseProduct('paintparking_coins_1000')).toBe(false);
    mockSdk.purchaseStoreProduct.mockRejectedValueOnce({ code: '5' });
    expect(await purchases.purchaseProduct('paintparking_coins_1000')).toBe(false);
    expect(profile.getProfile().coins).toBe(before);
  });

  test('restore gives back the permanent products', async () => {
    rc.startRevenueCat('appl_test');
    mockSdk.restorePurchases.mockResolvedValue(info({ entitlements: { active: { paintparking_no_ads: {} }, all: {} }, nonSubscriptionTransactions: [{ transactionIdentifier: 'T2', productIdentifier: 'paintparking_starter_pack' }, { transactionIdentifier: 'T3', productIdentifier: 'paintparking_coins_1000' }] }));
    expect((await purchases.restorePurchases()).sort()).toEqual(['paintparking_no_ads', 'paintparking_starter_pack']);
  });
});

describe('the VIP pass', () => {
  test('is read from the vip entitlement', async () => {
    rc.startRevenueCat('appl_test');
    mockSdk.getCustomerInfo.mockResolvedValue(
      info({ entitlements: { active: {}, all: { vip: { isActive: true, productIdentifier: 'paintparking_vip_yearly', expirationDateMillis: Date.now() + 86_400_000, billingIssueDetectedAtMillis: null } } } }),
    );
    await subscription.checkSubscription();
    const v = profile.getProfile().vip;
    expect(v.plan).toBe('yearly');
  });
});
