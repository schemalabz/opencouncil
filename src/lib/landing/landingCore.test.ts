import { SUBJECT_DOT_EXIT_RATIO, SUBJECT_DOT_THRESHOLD, nextDotMode } from './landingCore';

describe('nextDotMode', () => {
    const enter = SUBJECT_DOT_THRESHOLD;
    const exit = SUBJECT_DOT_THRESHOLD * SUBJECT_DOT_EXIT_RATIO;

    it('enters dot mode only at the entry threshold', () => {
        expect(nextDotMode(enter - 1, false)).toBe(false);
        expect(nextDotMode(enter, false)).toBe(true);
    });

    it('leaves dot mode only below the exit threshold', () => {
        expect(nextDotMode(enter - 1, true)).toBe(true); // still above exit — stays dots
        expect(nextDotMode(Math.ceil(exit), true)).toBe(true);
        expect(nextDotMode(Math.ceil(exit) - 1, true)).toBe(false);
    });

    it('is hysteretic: the band between the thresholds preserves whichever mode is active', () => {
        for (let n = Math.ceil(exit); n < enter; n++) {
            expect(nextDotMode(n, true)).toBe(true);
            expect(nextDotMode(n, false)).toBe(false);
        }
    });
});
