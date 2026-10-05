import type { Offer } from '@prisma/client';
import { getReportContract } from '@/lib/offers/state';

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
