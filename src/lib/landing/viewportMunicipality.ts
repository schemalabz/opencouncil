import { calculateGeometryBounds, isPointInGeometry, type GeometryBounds } from '@/lib/geo';
import type { MapViewport } from './landingData';

/** How far from the centre the ring samples sit, as a fraction of the viewport's span. */
const RING_SPREAD = 0.2;

/** The centre sample's weight. The eight ring samples weigh one each, so a neighbour has to cover
 *  most of the ring before it can outweigh the δήμος under the centre. */
const CENTER_WEIGHT = 3;

/**
 * How much of the view a δήμος must take up before the view counts as looking at it. The width or
 * the height is enough on its own, because a δήμος that is long in one direction still fills the
 * screen. A δήμος under this share is something the view contains, not something the view is on.
 *
 * A fixed zoom cannot do this job. Δήμος Σπάρτης fills a desktop screen at zoom 9.7 and Δήμος
 * Βριλησσίων at zoom 13.9, and a phone screen fits both about two levels lower.
 */
const MIN_VIEW_SHARE = 1 / 3;

/** Boundary boxes, kept per geometry object. The boundaries stay the same for the whole session,
 *  and this runs on every map move. */
const boundsCache = new WeakMap<GeoJSON.Geometry, GeometryBounds['bounds']>();

function boundsOf(geometry: GeoJSON.Geometry): GeometryBounds['bounds'] {
    const cached = boundsCache.get(geometry);
    if (cached !== undefined) return cached;
    const { bounds } = calculateGeometryBounds(geometry);
    boundsCache.set(geometry, bounds);
    return bounds;
}

/** Whether the δήμος covers MIN_VIEW_SHARE of the view, along the width or along the height. */
function fillsView(view: MapViewport, geometry: GeoJSON.Geometry): boolean {
    const bounds = boundsOf(geometry);
    if (!bounds) return false;
    const lngShare = (bounds.maxLng - bounds.minLng) / (view.e - view.w);
    const latShare = (bounds.maxLat - bounds.minLat) / (view.n - view.s);
    return Math.max(lngShare, latShare) >= MIN_VIEW_SHARE;
}

/**
 * The covered δήμος the viewport is looking at, resolved from the boundaries the map already holds.
 *
 * Runs on the client on every move, so the result needs no request and is never stale after a
 * pan. Only a δήμος that fills MIN_VIEW_SHARE of the view is a candidate, which keeps the
 * country-level view from naming the one δήμος under the middle of the screen.
 *
 * Between the candidates, samples the centre and a ring of eight points around it. The centre has
 * the highest weight, because it is the point the user looks at. The ring lets a δήμος that covers
 * most of the middle of the view win over a neighbour that contains only the centre. On a tie, the
 * δήμος under the centre wins. Returns null when no candidate contains any sample.
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
        if (!geometry || !fillsView(view, geometry)) continue;
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
