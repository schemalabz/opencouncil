import { isPointInGeometry } from '@/lib/geo';
import type { MapViewport } from './landingData';

/** How far from the centre the ring samples sit, as a fraction of the viewport's span. */
const RING_SPREAD = 0.2;

/** The centre sample's weight. The eight ring samples weigh one each, so a neighbour has to cover
 *  most of the ring before it can outweigh the δήμος under the centre. */
const CENTER_WEIGHT = 3;

/**
 * The covered δήμος the viewport is looking at, resolved from the boundaries the map already holds.
 *
 * Runs on the client on every move, so the result needs no request and is never stale after a
 * pan. Samples the centre and a ring of eight points around it. The centre has the highest weight,
 * because it is the point the user looks at. The ring lets a δήμος that covers most of the middle
 * of the view win over a neighbour that contains only the centre. On a tie, the δήμος under the
 * centre wins. Returns null when no boundary contains any sample.
 */
export function pickViewportMunicipality<T extends { geometry: GeoJSON.Geometry | null }>(
    view: MapViewport,
    municipalities: T[],
): T | null {
    const dx = (view.e - view.w) * RING_SPREAD;
    const dy = (view.n - view.s) * RING_SPREAD;
    const center: [number, number] = [view.clng, view.clat];
    const ring: [number, number][] = [];
    for (const i of [-1, 0, 1]) {
        for (const j of [-1, 0, 1]) {
            if (i !== 0 || j !== 0) ring.push([view.clng + i * dx, view.clat + j * dy]);
        }
    }

    let best: T | null = null;
    let bestScore = 0;
    let bestHasCenter = false;
    for (const municipality of municipalities) {
        const geometry = municipality.geometry;
        if (!geometry) continue;
        const hasCenter = isPointInGeometry(center, geometry);
        let score = hasCenter ? CENTER_WEIGHT : 0;
        for (const point of ring) if (isPointInGeometry(point, geometry)) score += 1;
        if (score > bestScore || (score === bestScore && hasCenter && !bestHasCenter)) {
            best = municipality;
            bestScore = score;
            bestHasCenter = hasCenter;
        }
    }
    return best;
}
