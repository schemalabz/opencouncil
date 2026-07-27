import { PETITION_DISPLAY_THRESHOLD, petitionBucket, petitionIntensities } from './petitions';

describe('petitionBucket', () => {
    it('hides counts below the display threshold', () => {
        expect(petitionBucket(0)).toBeNull();
        expect(petitionBucket(9)).toBeNull();
    });

    it('maps counts to their coarse public bucket', () => {
        expect(petitionBucket(10)).toBe(10);
        expect(petitionBucket(24)).toBe(10);
        expect(petitionBucket(25)).toBe(25);
        expect(petitionBucket(49)).toBe(25);
        expect(petitionBucket(50)).toBe(50);
        expect(petitionBucket(99)).toBe(50);
        expect(petitionBucket(100)).toBe(100);
        expect(petitionBucket(5000)).toBe(100);
    });
});

describe('petitionIntensities', () => {
    it('spreads a long-tailed distribution across the ramp on a log scale', () => {
        const [a, b, c] = petitionIntensities([10, 100, 1000]);
        expect(a).toBe(0); // at the threshold — bottom of the ramp
        expect(c).toBe(1); // the max — top of the ramp
        expect(b).toBeCloseTo(0.5, 5); // log-middle, not linear-middle (which would be ~0.09)
    });

    it('gives a lone displayed municipality the full colour', () => {
        expect(petitionIntensities([PETITION_DISPLAY_THRESHOLD])).toEqual([1]);
    });

    it('clamps to the 0..1 ramp', () => {
        for (const v of petitionIntensities([10, 17, 300, 42])) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('handles an empty input', () => {
        expect(petitionIntensities([])).toEqual([]);
    });
});
