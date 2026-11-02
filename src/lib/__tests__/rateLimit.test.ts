import { createRateLimiter } from '../rateLimit';

describe('createRateLimiter', () => {
    it('admits a key up to the limit inside one window and refuses the next', () => {
        const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
        expect(limiter.take('a', 0)).toBe(true);
        expect(limiter.take('a', 10)).toBe(true);
        expect(limiter.take('a', 20)).toBe(false);
    });

    it('starts a new window once the old one has passed', () => {
        const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
        expect(limiter.take('a', 0)).toBe(true);
        expect(limiter.take('a', 999)).toBe(false);
        expect(limiter.take('a', 1000)).toBe(true);
    });

    it('counts keys apart', () => {
        const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
        expect(limiter.take('a', 0)).toBe(true);
        expect(limiter.take('b', 0)).toBe(true);
        expect(limiter.take('a', 0)).toBe(false);
    });

    it('bounds cleanup scans during rejected traffic above 5000 keys', () => {
        const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
        for (let i = 0; i < 5001; i++) limiter.take(String(i), 0);
        const scans = jest.spyOn(Map.prototype, Symbol.iterator);
        try {
            for (let i = 0; i < 100; i++) expect(limiter.take('0', 1)).toBe(false);
            expect(scans.mock.calls.length).toBeLessThanOrEqual(1);
            scans.mockClear();
            expect(limiter.take('new', 60_001)).toBe(true);
            expect(scans).toHaveBeenCalledTimes(1);
            expect(limiter.take('0', 60_001)).toBe(true);
        } finally {
            scans.mockRestore();
        }
    });
});
