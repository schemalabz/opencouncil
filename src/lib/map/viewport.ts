import type { MapSubject } from './types';

export interface ViewportBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

/**
 * Returns the subjects whose anchor lies inside the viewport. Computed over
 * the already-loaded subject set (a few thousand at most) — cheaper and more
 * correct than queryRenderedFeatures, which misses points absorbed into
 * clusters. Antimeridian-crossing viewports are not handled (Greece-only data).
 */
export function filterSubjectsInBounds(subjects: MapSubject[], bounds: ViewportBounds): MapSubject[] {
    return subjects.filter(subject => {
        const [lng, lat] = subject.anchor;
        return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
    });
}
