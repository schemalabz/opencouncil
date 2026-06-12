import {
    IMPORTANCE_HOT_MIN_SECONDS,
    IMPORTANCE_HOT_MIN_SPEAKERS,
    IMPORTANCE_MINOR_MAX_SECONDS,
    IMPORTANCE_MINOR_MAX_SPEAKERS,
} from './constants';
import type { ImportanceTier } from './types';

/**
 * Derives how prominently a subject should render on the map from how much
 * it was actually discussed. Heavily-discussed subjects ('hot') get large
 * icon pins; procedural, barely-discussed subjects ('minor') shrink to dots.
 */
export function deriveImportanceTier(discussionTimeSeconds: number, speakerCount: number): ImportanceTier {
    if (discussionTimeSeconds >= IMPORTANCE_HOT_MIN_SECONDS || speakerCount >= IMPORTANCE_HOT_MIN_SPEAKERS) {
        return 'hot';
    }
    if (discussionTimeSeconds <= IMPORTANCE_MINOR_MAX_SECONDS && speakerCount <= IMPORTANCE_MINOR_MAX_SPEAKERS) {
        return 'minor';
    }
    return 'normal';
}
