import {
  CURRENT_OFFER_VERSION,
  getCorrectnessPricing,
  getPhysicalPresencePricing,
} from '@/lib/pricing';

describe('getPhysicalPresencePricing', () => {
  it('keeps €25/hour for offers before version 4', () => {
    expect(getPhysicalPresencePricing(1).pricePerHour).toBe(25);
    expect(getPhysicalPresencePricing(3).pricePerHour).toBe(25);
  });

  it('charges €50/hour from version 4', () => {
    expect(getPhysicalPresencePricing(4).pricePerHour).toBe(50);
    expect(getPhysicalPresencePricing(CURRENT_OFFER_VERSION).pricePerHour).toBe(50);
  });

  it('throws below the first version', () => {
    expect(() => getPhysicalPresencePricing(0)).toThrow();
  });
});

describe('getCorrectnessPricing', () => {
  it('returns the entry of the exact version when one exists', () => {
    expect(getCorrectnessPricing(1)).toMatchObject({ pricePerUnit: 80, unit: 'meeting' });
    expect(getCorrectnessPricing(2)).toMatchObject({ pricePerUnit: 20, unit: 'hour' });
    expect(getCorrectnessPricing(3)).toMatchObject({ pricePerUnit: 11, unit: 'hour' });
  });

  it('inherits the latest earlier entry when a version changes other prices only', () => {
    expect(getCorrectnessPricing(4)).toEqual(getCorrectnessPricing(3));
  });

  it('throws below the first version', () => {
    expect(() => getCorrectnessPricing(0)).toThrow();
  });
});
