import { readFileSync } from 'fs';
import { join } from 'path';

import { realYearlySaving, priceText, yearlyMonthlyText } from '../src/core/i18n';
import { clearStorePrices, setStorePrices } from '../src/core/i18n/prices';

const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');

beforeEach(() => clearStorePrices());

describe('the prices shown are the ones of the App Store', () => {
  it('shows the config price in euros until the store has answered', () => {
    expect(priceText('paintparking_vip_yearly', 29.99)).toMatch(/29[.,]99/);
    expect(priceText('paintparking_vip_yearly', 29.99)).toContain('€');
  });

  it('shows the price the store gives (another currency, another amount) once it is known', () => {
    setStorePrices([
      { id: 'paintparking_vip_yearly', text: '$34.99', amount: 34.99, currency: 'USD' },
      { id: 'paintparking_vip_monthly', text: '$4.99', amount: 4.99, currency: 'USD' },
    ]);
    expect(priceText('paintparking_vip_yearly', 29.99)).toBe('$34.99');
    expect(yearlyMonthlyText('paintparking_vip_yearly', 29.99)).toMatch(/2[.,]92/);
    expect(yearlyMonthlyText('paintparking_vip_yearly', 29.99)).toContain('$');
    expect(realYearlySaving('paintparking_vip_yearly', 'paintparking_vip_monthly')).toBeCloseTo(1 - 34.99 / (12 * 4.99), 5);
  });

  it('ignores an empty answer and gives no saving without both prices', () => {
    setStorePrices([{ id: 'paintparking_vip_yearly', text: '', amount: 0, currency: 'EUR' }]);
    expect(priceText('paintparking_vip_yearly', 29.99)).toContain('€');
    expect(realYearlySaving('paintparking_vip_yearly', 'paintparking_vip_monthly')).toBeNull();
  });

  it('no screen writes a price of the config in euros by itself any more', () => {
    for (const f of ['app/vip.tsx', 'app/piggy.tsx', 'core/components/ShopOffers.tsx', 'core/components/Modals.tsx', 'core/components/NoLivesCard.tsx', 'core/components/VipParts.tsx', 'core/components/VipCards.tsx', 'core/services/purchases.ts']) {
      expect(read(f)).not.toMatch(/formatEur\(/);
    }
  });

  it('RevenueCat asks the store for the prices of every product at start-up', () => {
    const rc = read('core/services/revenuecat.ts');
    expect(rc).toMatch(/loadStorePrices\(purchases\)/);
    expect(rc).toMatch(/getProducts\(\[\.\.\.PRODUCT_IDS, \.\.\.SUBSCRIPTION_IDS\]\)/);
  });
});
