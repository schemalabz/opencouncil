import type { ReactNode } from 'react';
import { calculateGeometryBounds } from '@/lib/geo';

/**
 * Web Mercator's y, so the outline has the shape the map draws it in.
 *
 * In degrees, because the x of this projection is the longitude itself: the
 * two axes must carry one unit, or the outline comes out flattened.
 */
function mercatorY(lat: number): number {
    const clamped = Math.max(-85.05, Math.min(85.05, lat));
    return (Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * 180) / Math.PI;
}

/** Every outer and inner ring of a Polygon or a MultiPolygon; anything else has no outline to draw. */
function ringsOf(geometry: GeoJSON.Geometry): number[][][] {
    if (geometry.type === 'Polygon') return geometry.coordinates;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
    if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(ringsOf);
    return [];
}

/**
 * A municipality's boundary, as one SVG path inside its box.
 *
 * The petition's second column is the place a reader is asking for, and on the
 * page a map draws it. An image cannot load a map, so it draws the boundary
 * the map would draw over — the shape is the municipality's own, and a
 * municipality that is not covered yet almost never has a seal to show instead.
 *
 * `null` for a municipality with no boundary stored, which the caller then
 * falls back from. The path is fitted to the box and centred in it, so a long
 * municipality and a round one both fill it.
 */
export function boundaryPath(geometry: GeoJSON.Geometry | null | undefined, width: number, height: number, pad = 0): ReactNode {
    if (!geometry) return null;
    const { bounds } = calculateGeometryBounds(geometry);
    const rings = ringsOf(geometry).filter(ring => ring.length >= 3);
    if (!bounds || rings.length === 0) return null;

    // The box's own top-left, in projected units. Mercator's y grows north and
    // the box's grows down, so the north edge is what a y is measured from.
    const west = bounds.minLng;
    const north = mercatorY(bounds.maxLat);
    const span = Math.max(bounds.maxLng - bounds.minLng, 1e-9);
    const rise = Math.max(north - mercatorY(bounds.minLat), 1e-9);
    // One scale for both axes, so the outline keeps its proportions.
    const scale = Math.min((width - pad * 2) / span, (height - pad * 2) / rise);
    const dx = (width - span * scale) / 2;
    const dy = (height - rise * scale) / 2;
    const at = (lng: number, lat: number) => `${((lng - west) * scale + dx).toFixed(1)},${((north - mercatorY(lat)) * scale + dy).toFixed(1)}`;

    const d = rings
        .map(ring => `M${ring.map(([lng, lat]) => at(lng, lat)).join('L')}Z`)
        .join('');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
            <path d={d} fill="rgba(255,102,0,0.10)" stroke="#ff6600" strokeWidth={2} strokeLinejoin="round" fillRule="evenodd" />
        </svg>
    );
}
