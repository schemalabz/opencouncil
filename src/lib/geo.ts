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
        const SUPPORTED_TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
        if (!SUPPORTED_TYPES.includes(geometry.type)) {
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
            } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
                processCoordinates(geom.coordinates);
            } else if (geom.type === 'MultiLineString') {
                geom.coordinates.forEach((line: number[][]) => {
                    processCoordinates(line);
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

/**
 * Greece bounding ranges used to detect legacy [lat, lng]-swapped coordinates.
 * Latitude (34–42.5) and longitude (19–30) ranges are disjoint, so a point
 * within Greece can be classified unambiguously.
 */
export const GREECE_LAT_RANGE: [number, number] = [34, 42.5];
export const GREECE_LNG_RANGE: [number, number] = [19, 30];

/**
 * Returns [lng, lat], swapping the input when it looks like a legacy
 * [lat, lng] pair within Greece. Coordinates outside both ranges are
 * returned unchanged. See Location ingestion history: most stored rows
 * were inserted with swapped axis order.
 */
export function normalizeLngLat(coords: [number, number]): [number, number] {
    const [first, second] = coords;
    const looksLikeLat = first >= GREECE_LAT_RANGE[0] && first <= GREECE_LAT_RANGE[1];
    const looksLikeLng = second >= GREECE_LNG_RANGE[0] && second <= GREECE_LNG_RANGE[1];
    if (looksLikeLat && looksLikeLng) {
        return [second, first];
    }
    return coords;
}

type Position = number[];

function mapPositions(coords: unknown, fn: (pos: Position) => Position): unknown {
    if (!Array.isArray(coords)) return coords;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        return fn(coords as Position);
    }
    return coords.map(c => mapPositions(c, fn));
}

/**
 * Recursively normalizes every position of a GeoJSON geometry through
 * normalizeLngLat. Returns a new geometry; the input is not mutated.
 */
export function normalizeGeometryCoordinates<T extends GeoJSON.Geometry>(geometry: T): T {
    if (geometry.type === 'GeometryCollection') {
        return {
            ...geometry,
            geometries: geometry.geometries.map(g => normalizeGeometryCoordinates(g)),
        } as T;
    }
    const coordinates = mapPositions(geometry.coordinates, pos => {
        const [lng, lat] = normalizeLngLat([pos[0], pos[1]]);
        return [lng, lat, ...pos.slice(2)];
    }) as typeof geometry.coordinates;
    return { ...geometry, coordinates } as T;
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
