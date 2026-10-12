import { createCircleBuffer } from "@/lib/geo";
import type { BufferOperation, DerivedGeometry, GeoSetData, StaticGeometry } from "./types";

/** The shape of a derived geometry, computed from the geosets it is derived from. */
export function computeDerivedGeometry(derivedGeometry: DerivedGeometry, allGeoSets: GeoSetData[]): GeoJSON.Geometry | null {
    const { derivedFrom } = derivedGeometry;

    if (derivedFrom.operation === 'buffer') {
        const bufferOp = derivedFrom as BufferOperation;
        const sourceGeoSet = allGeoSets.find(gs => gs.id === bufferOp.sourceGeoSetId);

        if (!sourceGeoSet) {
            console.warn(`Source GeoSet not found: ${bufferOp.sourceGeoSetId}`);
            return null;
        }

        // Convert radius to meters
        const radiusInMeters = bufferOp.units === 'kilometers' ? bufferOp.radius * 1000 : bufferOp.radius;

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
