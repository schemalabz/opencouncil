import { deriveWindowDays } from '@/lib/tasks/decisionWindow';

describe('deriveWindowDays', () => {
    it('defaults to 30 when there is too little history', () => {
        expect(deriveWindowDays([])).toBe(30);
        expect(deriveWindowDays([3, 5, 7])).toBe(30);
    });

    it('uses p95 of the lags with 1.5x headroom', () => {
        // 20 lags of 10 days: p95 = 10, x1.5 = 15
        expect(deriveWindowDays(Array(20).fill(10))).toBe(15);
    });

    it('clamps to at least 14 days', () => {
        expect(deriveWindowDays(Array(20).fill(2))).toBe(14);
    });

    it('clamps to at most 45 days', () => {
        expect(deriveWindowDays(Array(20).fill(60))).toBe(45);
    });

    it('ignores negative lags (bad data)', () => {
        expect(deriveWindowDays([-5, ...Array(20).fill(10)])).toBe(15);
    });
});
