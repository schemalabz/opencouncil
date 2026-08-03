/**
 * Parsing/normalization for pasted city-boundary GeoJSON.
 *
 * Accepts what people actually copy out of common tools (geojson.io, QGIS,
 * Overpass/OSM exports): a bare Geometry, a Feature, or a FeatureCollection.
 * Everything is reduced to a single Polygon or MultiPolygon in WGS84 —
 * multiple polygonal features merge into one MultiPolygon, non-polygonal
 * geometries are ignored (an export often carries stray points/labels).
 *
 * Shared by the CityForm boundary editor (live validation + preview) and the
 * cities API routes (server-side validation before the PostGIS write), so the
 * two can never diverge on what counts as a valid boundary.
 */

export type BoundaryParseError = 'invalidJson' | 'noPolygon' | 'invalidCoordinates';

export type BoundaryParseResult =
    | { ok: true; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }
    | { ok: false; error: BoundaryParseError };

type Position = [number, number];

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Validates one linear ring and returns it closed (GeoJSON requires first === last). */
function normalizeRing(ring: unknown): Position[] | null {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const positions: Position[] = [];
    for (const position of ring) {
        if (!Array.isArray(position) || !isFiniteNumber(position[0]) || !isFiniteNumber(position[1])) return null;
        const [lng, lat] = position;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
        // Extra dimensions (altitude) are dropped.
        positions.push([lng, lat]);
    }
    const [first] = positions;
    const last = positions[positions.length - 1];
    // Auto-close: hand-assembled rings frequently omit the closing position.
    if (first[0] !== last[0] || first[1] !== last[1]) positions.push([first[0], first[1]]);
    // A closed ring needs at least 4 positions (triangle + closure).
    return positions.length >= 4 ? positions : null;
}

/** Validates a Polygon's coordinates (outer ring + holes), or null if malformed. */
function normalizePolygonCoordinates(coordinates: unknown): Position[][] | null {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
    const rings: Position[][] = [];
    for (const ring of coordinates) {
        const normalized = normalizeRing(ring);
        if (!normalized) return null;
        rings.push(normalized);
    }
    return rings;
}

/** Collects the polygons of a single Geometry object into `into`. Returns false on malformed coordinates. */
function collectPolygons(geometry: unknown, into: Position[][][]): boolean {
    if (typeof geometry !== 'object' || geometry === null) return true;
    const { type, coordinates, geometries } = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
    if (type === 'Polygon') {
        const polygon = normalizePolygonCoordinates(coordinates);
        if (!polygon) return false;
        into.push(polygon);
        return true;
    }
    if (type === 'MultiPolygon') {
        if (!Array.isArray(coordinates)) return false;
        for (const polygonCoordinates of coordinates) {
            const polygon = normalizePolygonCoordinates(polygonCoordinates);
            if (!polygon) return false;
            into.push(polygon);
        }
        return true;
    }
    if (type === 'GeometryCollection' && Array.isArray(geometries)) {
        return geometries.every((g) => collectPolygons(g, into));
    }
    // Non-polygonal geometry: ignored, not an error.
    return true;
}

/**
 * Parses pasted GeoJSON text into a normalized city boundary.
 * Never throws — malformed input maps to a typed error code the form can translate.
 */
export function parseBoundaryInput(input: string): BoundaryParseResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(input);
    } catch {
        return { ok: false, error: 'invalidJson' };
    }
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'invalidJson' };

    const root = parsed as { type?: unknown; features?: unknown; geometry?: unknown };
    const polygons: Position[][][] = [];
    let wellFormed = true;

    if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
        wellFormed = root.features.every((feature) => {
            if (typeof feature !== 'object' || feature === null) return true;
            return collectPolygons((feature as { geometry?: unknown }).geometry, polygons);
        });
    } else if (root.type === 'Feature') {
        wellFormed = collectPolygons(root.geometry, polygons);
    } else {
        wellFormed = collectPolygons(root, polygons);
    }

    if (!wellFormed) return { ok: false, error: 'invalidCoordinates' };
    if (polygons.length === 0) return { ok: false, error: 'noPolygon' };
    if (polygons.length === 1) return { ok: true, geometry: { type: 'Polygon', coordinates: polygons[0] } };
    return { ok: true, geometry: { type: 'MultiPolygon', coordinates: polygons } };
}
