import { MapFeature } from "@/components/map/map";
import { Location } from "@/lib/types/onboarding";
import { DerivedGeometry, GeoSetData, StaticGeometry } from "./types";

// Helper function to create a circular polygon buffer around a point
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

// Helper function to compute derived geometry
export function computeDerivedGeometry(derivedGeometry: DerivedGeometry, allGeoSets: GeoSetData[]): GeoJSON.Geometry | null {
    const { derivedFrom } = derivedGeometry;

    if (derivedFrom.operation === 'buffer') {
        const sourceGeoSet = allGeoSets.find(gs => gs.id === derivedFrom.sourceGeoSetId);

        if (!sourceGeoSet) {
            console.warn(`Source GeoSet not found: ${derivedFrom.sourceGeoSetId}`);
            return null;
        }

        // Convert radius to meters
        const radiusInMeters = derivedFrom.units === 'kilometers' ? derivedFrom.radius * 1000 : derivedFrom.radius;

        // For buffer operations, we'll create individual circles for each point
        // and combine them into a MultiPolygon for simplicity
        const polygons: number[][][][] = [];

        sourceGeoSet.geometries.forEach(geometry => {
            if (geometry.type === 'point') {
                const staticGeometry = geometry as StaticGeometry;
                if (staticGeometry.geojson && staticGeometry.geojson.type === 'Point') {
                    const circle = createCircleBuffer(
                        staticGeometry.geojson.coordinates as [number, number],
                        radiusInMeters
                    );
                    polygons.push(circle.coordinates);
                }
            }
        });

        if (polygons.length === 0) {
            return null;
        }

        // Return as MultiPolygon if we have multiple circles, or Polygon if just one
        if (polygons.length === 1) {
            return {
                type: 'Polygon',
                coordinates: polygons[0]
            };
        } else {
            return {
                type: 'MultiPolygon',
                coordinates: polygons
            };
        }
    }

    // TODO: Implement difference operation
    if (derivedFrom.operation === 'difference') {
        console.warn('Difference operation not yet implemented');
        return null;
    }

    return null;
}

// Helper function to create line features between selected locations
export function createLocationLineFeatures(locations: Location[]): MapFeature[] {
    if (locations.length === 0) return [];

    const lineFeatures: MapFeature[] = [];

    // Create lines between consecutive locations (only if we have 2 or more)
    if (locations.length >= 2) {
        for (let i = 0; i < locations.length - 1; i++) {
            const startLocation = locations[i];
            const endLocation = locations[i + 1];

            const lineGeometry: GeoJSON.LineString = {
                type: 'LineString',
                coordinates: [
                    startLocation.coordinates,
                    endLocation.coordinates
                ]
            };

            lineFeatures.push({
                id: `location-line-${i}`,
                geometry: lineGeometry,
                properties: {
                    type: 'location-line',
                    startLocation: startLocation.text,
                    endLocation: endLocation.text,
                    segmentIndex: i
                },
                style: {
                    strokeColor: '#EF4444', // Red color for visibility
                    strokeWidth: 3,
                    fillOpacity: 0 // Lines don't need fill
                }
            });
        }
    }

    // Create point features for each location (works for single or multiple locations)
    locations.forEach((location, index) => {
        lineFeatures.push({
            id: `location-point-${index}`,
            geometry: {
                type: 'Point',
                coordinates: location.coordinates
            },
            properties: {
                type: 'location-point',
                locationText: location.text,
                locationIndex: index,
                isSingleLocation: locations.length === 1
            },
            style: {
                fillColor: '#EF4444',
                fillOpacity: 0.9, // Slightly more opaque for better visibility
                strokeColor: '#B91C1C',
                strokeWidth: locations.length === 1 ? 12 : 10, // Bigger for single location, large for multiple
                label: locations.length === 1 ? '📍' : `${index + 1}` // Pin emoji for single, numbers for multiple
            }
        });
    });

    return lineFeatures;
} 