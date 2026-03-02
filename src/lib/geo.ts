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
