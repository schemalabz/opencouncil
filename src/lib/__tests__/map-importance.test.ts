import { deriveImportanceTier } from '../map/importance';
import {
    IMPORTANCE_HOT_MIN_SECONDS,
    IMPORTANCE_HOT_MIN_SPEAKERS,
    IMPORTANCE_MINOR_MAX_SECONDS,
    IMPORTANCE_MINOR_MAX_SPEAKERS,
} from '../map/constants';

describe('deriveImportanceTier', () => {
    it('marks undiscussed subjects as minor', () => {
        expect(deriveImportanceTier(0, 0)).toBe('minor');
    });

    it('marks subjects at the minor ceiling as minor', () => {
        expect(deriveImportanceTier(IMPORTANCE_MINOR_MAX_SECONDS, IMPORTANCE_MINOR_MAX_SPEAKERS)).toBe('minor');
    });

    it('promotes to normal just above the minor seconds ceiling', () => {
        expect(deriveImportanceTier(IMPORTANCE_MINOR_MAX_SECONDS + 1, IMPORTANCE_MINOR_MAX_SPEAKERS)).toBe('normal');
    });

    it('promotes to normal when speaker count exceeds the minor ceiling', () => {
        expect(deriveImportanceTier(0, IMPORTANCE_MINOR_MAX_SPEAKERS + 1)).toBe('normal');
    });

    it('stays normal just below the hot thresholds', () => {
        expect(deriveImportanceTier(IMPORTANCE_HOT_MIN_SECONDS - 1, IMPORTANCE_HOT_MIN_SPEAKERS - 1)).toBe('normal');
    });

    it('becomes hot at the discussion-seconds threshold', () => {
        expect(deriveImportanceTier(IMPORTANCE_HOT_MIN_SECONDS, 0)).toBe('hot');
    });

    it('becomes hot at the speaker-count threshold even with little time', () => {
        expect(deriveImportanceTier(0, IMPORTANCE_HOT_MIN_SPEAKERS)).toBe('hot');
    });
});
