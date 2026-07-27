export type GeometryBounds = {
    bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number } | null;
    center: [number, number];
};

/**
 * Calculates bounds and center from a GeoJSON geometry.
 * Supports Point, Polygon, MultiPolygon, and GeometryCollection.
 */
export function calculateGeometryBounds(geometry: any): GeometryBounds {
    const DEFAULT_RETURN: GeometryBounds = {
        bounds: null,
        center: [23.7275, 37.9838] // Default to Athens
    };

    if (!geometry) {
        console.log('[Location] No geometry available, using default coordinates');
        return DEFAULT_RETURN;
    }

    try {
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        // Check for supported geometry types
        if (!['Point', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(geometry.type)) {
            console.warn(`[Location] Unsupported geometry type: ${geometry.type}, using default coordinates`);
            return DEFAULT_RETURN;
        }

        const processCoordinates = (coords: number[][]) => {
            coords.forEach(point => {
                const [lng, lat] = point;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
        };

        const processGeometry = (geom: any) => {
            if (geom.type === 'Polygon') {
                processCoordinates(geom.coordinates[0]);
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach((polygon: number[][][]) => {
                    processCoordinates(polygon[0]);
                });
            } else if (geom.type === 'Point') {
                const [lng, lat] = geom.coordinates;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            }
        };

        if (geometry.type === 'GeometryCollection') {
            geometry.geometries.forEach(processGeometry);
        } else {
            processGeometry(geometry);
        }

        const bounds = {
            minLng,
            maxLng,
            minLat,
            maxLat
        };

        const center: [number, number] = [
            (minLng + maxLng) / 2,
            (minLat + maxLat) / 2
        ];

        return { bounds, center };
    } catch (error) {
        console.error('[Location] Error calculating geometry bounds:', error);
        return DEFAULT_RETURN;
    }
}

/**
 * Calculates center coordinates and zoom level from a GeoJSON geometry.
 * Useful for setting initial map view to fit a geometry.
 */
export function calculateMapView(geometry: GeoJSON.Geometry): { center: [number, number]; zoom: number } {
    const { bounds, center } = calculateGeometryBounds(geometry);

    let zoom = 10;
    if (bounds) {
        const lngDiff = bounds.maxLng - bounds.minLng;
        const latDiff = bounds.maxLat - bounds.minLat;
        const maxDiff = Math.max(lngDiff, latDiff);
        zoom = Math.max(8, Math.min(13, 11 - Math.log2(maxDiff * 111))); // 111km per degree
    }

    return { center, zoom };
}

/**
 * Create a circular polygon approximation around a center point.
 * Uses Haversine-based offsets to generate a 64-point polygon.
 */
export function createCircleBuffer(center: [number, number], radiusInMeters: number): GeoJSON.Polygon {
    const earthRadius = 6371000; // Earth's radius in meters
    const lat = center[1] * Math.PI / 180; // Convert to radians
    const lng = center[0] * Math.PI / 180;

    const points: [number, number][] = [];
    const numPoints = 64; // Number of points to create the circle

    for (let i = 0; i < numPoints; i++) {
        const angle = (i * 360 / numPoints) * Math.PI / 180;

        // Calculate offset in radians
        const dLat = radiusInMeters * Math.cos(angle) / earthRadius;
        const dLng = radiusInMeters * Math.sin(angle) / (earthRadius * Math.cos(lat));

        // Convert back to degrees
        const newLat = (lat + dLat) * 180 / Math.PI;
        const newLng = (lng + dLng) * 180 / Math.PI;

        points.push([newLng, newLat]);
    }

    // Close the polygon by adding the first point at the end
    points.push(points[0]);

    return {
        type: 'Polygon',
        coordinates: [points]
    };
}

// Base32 alphabet used by the standard geohash algorithm (excludes a, i, l, o).
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode a [lng, lat] coordinate into a geohash string of the given precision.
 * Implements the standard geohash algorithm (https://en.wikipedia.org/wiki/Geohash).
 * Precision is the number of characters (each character adds ~5 bits of resolution);
 * precision 6 yields cells of roughly 1.2km × 0.6km.
 */
export function encodeGeohash([lng, lat]: [number, number], precision = 6): string {
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let hash = '';
    let bits = 0;
    let bitCount = 0;
    let even = true; // alternate between longitude (even) and latitude (odd)

    while (hash.length < precision) {
        if (even) {
            const mid = (lngMin + lngMax) / 2;
            if (lng >= mid) {
                bits = (bits << 1) | 1;
                lngMin = mid;
            } else {
                bits = bits << 1;
                lngMax = mid;
            }
        } else {
            const mid = (latMin + latMax) / 2;
            if (lat >= mid) {
                bits = (bits << 1) | 1;
                latMin = mid;
            } else {
                bits = bits << 1;
                latMax = mid;
            }
        }

        even = !even;

        if (++bitCount === 5) {
            hash += GEOHASH_BASE32[bits];
            bits = 0;
            bitCount = 0;
        }
    }

    return hash;
}

/**
 * Decode a geohash back to the center [lng, lat] of the cell it represents.
 * Throws on characters outside the geohash base-32 alphabet.
 */
export function decodeGeohashToCenter(geohash: string): [number, number] {
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let even = true; // alternate between longitude (even) and latitude (odd)

    for (const char of geohash.toLowerCase()) {
        const value = GEOHASH_BASE32.indexOf(char);
        if (value === -1) throw new Error(`Invalid geohash character: ${char}`);
        for (let bit = 4; bit >= 0; bit--) {
            const isSet = (value >> bit) & 1;
            if (even) {
                const mid = (lngMin + lngMax) / 2;
                if (isSet) lngMin = mid; else lngMax = mid;
            } else {
                const mid = (latMin + latMax) / 2;
                if (isSet) latMin = mid; else latMax = mid;
            }
            even = !even;
        }
    }

    return [(lngMin + lngMax) / 2, (latMin + latMax) / 2];
}

/** True when `value` is a syntactically valid geohash of the expected precision (length). */
export function isValidGeohash(value: string, precision = 6): boolean {
    if (value.length !== precision) return false;
    for (const char of value.toLowerCase()) {
        if (!GEOHASH_BASE32.includes(char)) return false;
    }
    return true;
}

/**
 * Calculate the great-circle distance between two [lng, lat] points using the Haversine formula.
 * Returns distance in meters.
 */
export function haversineDistance(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Ray-casting test against one linear ring. Treats coordinates as planar, which is fine at a
 *  municipality's scale. */
function pointInRing([lng, lat]: [number, number], ring: GeoJSON.Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        // Does the ring's edge straddle the ray's latitude, and lie to the right of the point?
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** A polygon's outer ring minus its holes. */
function pointInPolygonRings(point: [number, number], rings: GeoJSON.Position[][]): boolean {
    if (!rings.length || !pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

/**
 * Whether a [lng, lat] point falls inside a Polygon or MultiPolygon. The client-side counterpart
 * of PostGIS's ST_Covers, for deciding containment against geometry already in the payload rather
 * than paying a round trip. Any other geometry type is not an area, so nothing contains the point.
 */
export function isPointInGeometry(point: [number, number], geometry: GeoJSON.Geometry): boolean {
    if (geometry.type === 'Polygon') return pointInPolygonRings(point, geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some((rings) => pointInPolygonRings(point, rings));
    }
    return false;
}

/**
 * Whether a [lng, lat] centre falls inside any of the given δήμος boundaries — i.e. sits in a
 * municipality OpenCouncil covers. Takes the geometries structurally (anything with a `geometry`)
 * rather than a landing type, so this generic geo helper doesn't depend on the landing layer.
 */
export function isInSupportedMunicipality(
    center: [number, number],
    cities: { geometry: GeoJSON.Geometry | null }[],
): boolean {
    return cities.some((c) => c.geometry != null && isPointInGeometry(center, c.geometry));
}
