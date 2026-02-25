import { SubjectWithRelations } from "../db/subject";

export const SUBJECT_POINT_COLOR = '#E57373'; // A nice red color that contrasts with the blue city polygons

export function subjectToMapFeature(subject: SubjectWithRelations) {
    if (!subject.location?.coordinates) return null;

    return {
        id: subject.id,
        geometry: {
            type: 'Point',
            coordinates: [subject.location.coordinates.y, subject.location.coordinates.x]
        },
        properties: {
            subjectId: subject.id,
            name: subject.name
        },
        style: {
            fillColor: SUBJECT_POINT_COLOR,
            fillOpacity: 0.6,
            strokeColor: SUBJECT_POINT_COLOR,
            strokeWidth: 6,
            label: subject.name
        }
    };
}

export type GeometryBounds = {
    bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number } | null;
    center: [number, number];
};

/**
 * Minimal interface for GeoJSON geometries.
 * Uses optional coordinates to support GeometryCollection and other types.
 */
export interface MinimalGeometry {
    type: string;
    coordinates?: any;
    geometries?: MinimalGeometry[];
}

/**
 * Calculates bounds and center from a GeoJSON geometry
 * @param geometry The GeoJSON geometry to process
 */
export function calculateGeometryBounds(geometry: MinimalGeometry | null | undefined): GeometryBounds {
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
        if (!['Point', 'Polygon', 'MultiPolygon'].includes(geometry.type)) {
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

        if (geometry.type === 'Polygon') {
            processCoordinates(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach((polygon: number[][][]) => {
                processCoordinates(polygon[0]);
            });
        } else if (geometry.type === 'Point') {
            const [lng, lat] = geometry.coordinates;
            minLng = maxLng = lng;
            minLat = maxLat = lat;
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
