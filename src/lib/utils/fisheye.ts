export type FisheyeMode = 'focus' | 'context';

const FOCUS_RADIUS = 1;

/**
 * Maps a distance-from-center to a render mode.
 * Three segments get the focus treatment: the active segment plus one on
 * either side. Everything else renders in the compact context mode.
 */
export function fisheyeModeForDistance(distance: number): FisheyeMode {
    return Math.abs(distance) <= FOCUS_RADIUS ? 'focus' : 'context';
}
