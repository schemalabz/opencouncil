import type { Offer } from '@prisma/client';
import { calculateOfferTotals } from '@/lib/pricing';
import { annualizeOffer, getOfferState, getReportContract, periodsOverlap } from '@/lib/offers/state';

const now = new Date('2026-03-01T12:00:00Z');

function offer(id: string, createdAt: string, startDate: string, endDate: string, adam: string | null): Offer {
    return {
        id,
        createdAt: new Date(createdAt),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        adam,
        agreed: false,
    } as unknown as Offer;
}

describe('getReportContract', () => {
    const expired = offer('expired', '2024-08-01', '2024-09-01', '2025-08-31', '24SYMV001');
    const active = offer('active', '2025-08-01', '2025-09-01', '2026-08-31', '25SYMV001');
    const renewal = offer('renewal', '2026-02-01', '2026-09-01', '2027-08-31', null);

    it('picks the in-effect contract over a newer pending renewal', () => {
        expect(getReportContract([renewal, active, expired], now)?.id).toBe('active');
    });

    it('does not depend on the input order', () => {
        expect(getReportContract([expired, active, renewal], now)?.id).toBe('active');
    });

    it('falls back to the most recently created offer when none is in effect', () => {
        expect(getReportContract([expired, renewal], now)?.id).toBe('renewal');
    });

    it('returns undefined for a city without offers', () => {
        expect(getReportContract([], now)).toBeUndefined();
    });
});

describe('contract extension', () => {
    const base = offer('base', '2025-09-01', '2025-10-15', '2026-10-14', '25SYMV001');
    const extended = { ...base, extendedUntil: new Date('2026-12-14') } as Offer;
    const afterEnd = new Date('2026-11-18T12:00:00Z');

    it('keeps the contract active until the extension date', () => {
        expect(getOfferState(base, afterEnd)).toBe('expired');
        expect(getOfferState(extended, afterEnd)).toBe('active');
        expect(getOfferState(extended, new Date('2026-12-16T12:00:00Z'))).toBe('expired');
    });

    it('ignores an extension date that is not after the end date', () => {
        const early = { ...base, extendedUntil: new Date('2026-06-01') } as Offer;
        expect(getOfferState(early, new Date('2026-09-01T12:00:00Z'))).toBe('active');
    });

    it('counts the extension in the coverage period', () => {
        const renewal = offer('renewal', '2026-11-01', '2026-11-01', '2027-10-31', null);
        expect(periodsOverlap(base, renewal)).toBe(false);
        expect(periodsOverlap(extended, renewal)).toBe(true);
        expect(periodsOverlap(renewal, extended)).toBe(true);
    });

    it('spreads the same total over the extended period in the annualized revenue', () => {
        const priced = { ...base, platformPrice: 100, ingestionPerHourPrice: 10, hoursToIngest: 10, discountPercentage: 0, version: 3 } as Offer;
        const pricedExtended = { ...priced, extendedUntil: new Date('2026-12-14') } as Offer;
        // 12 months × 100 + 10 hours × 10 = 1300, in effect for 14 months.
        expect(calculateOfferTotals(pricedExtended).total).toBe(1300);
        expect(annualizeOffer(priced)).toBeCloseTo(1300);
        expect(annualizeOffer(pricedExtended)).toBeCloseTo((1300 / 14) * 12);
    });
});
