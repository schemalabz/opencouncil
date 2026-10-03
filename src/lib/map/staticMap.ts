import { env } from '@/env.mjs';

/**
 * Mapbox Static Images with features drawn over the map. The interactive
 * map's custom style does not render in the Static Images API, so every
 * static map uses a standard Mapbox style.
 */
export const STATIC_MAP_STYLE = 'mapbox/light-v11';

// Max URL length for Mapbox Static Images API
const MAX_URL_LENGTH = 8192;

/** A feature to draw: the interactive map's shape, so the same features feed both. */
export interface StaticMapFeature {
    geometry: { type: string; coordinates?: unknown };
    style?: {
        fillColor?: string;
        fillOpacity?: number;
        strokeColor?: string;
        strokeWidth?: number;
        strokeOpacity?: number;
    };
}

/** Where the image looks: fitted to the overlay, a centre and a zoom, or a bounding box. */
export type StaticMapPosition =
    | 'auto'
    | { center: [number, number]; zoom: number }
    | { bbox: [number, number, number, number] };

type Ring = number[][];

/**
 * Simplify a coordinate ring by sampling every Nth point.
 * Ensures the ring stays closed and has at least 4 points.
 */
function simplifyRing(ring: Ring, maxPoints: number): Ring {
    if (ring.length <= maxPoints) return ring;
    const step = Math.max(1, Math.floor((ring.length - 1) / (maxPoints - 1)));
    const simplified: Ring = [];
    for (let i = 0; i < ring.length - 1; i += step) {
        simplified.push(ring[i].map(c => Math.round(c * 10000) / 10000));
    }
    simplified.push(simplified[0]);
    return simplified;
}

function simplifyGeometry(geometry: StaticMapFeature['geometry'], maxPoints: number): StaticMapFeature['geometry'] {
    if (geometry.type === 'Polygon') {
        return {
            type: 'Polygon',
            coordinates: (geometry.coordinates as Ring[]).map(ring => simplifyRing(ring, maxPoints)),
        };
    }
    if (geometry.type === 'MultiPolygon') {
        const polygons = geometry.coordinates as Ring[][];
        const total = polygons.reduce((sum, polygon) => sum + polygon.reduce((points, ring) => points + ring.length, 0), 0);
        // The budget is shared by ring size. An even split starved the one large
        // ring, such as a municipality's main island, to feed islets that need four
        // points each. Under the budget, every ring keeps all its points.
        return {
            type: 'MultiPolygon',
            coordinates: polygons.map(polygon =>
                polygon.map(ring => simplifyRing(ring, Math.max(4, Math.floor((maxPoints * ring.length) / total)))),
            ),
        };
    }
    return geometry;
}

/**
 * Convert feature styles to simplestyle-spec properties for Mapbox Static API.
 * Points use marker-* properties, polygons use fill/stroke.
 */
function toSimplestyle(feature: StaticMapFeature): Record<string, string | number> {
    if (feature.geometry.type === 'Point') {
        return {
            'marker-color': feature.style?.fillColor ?? '#4263EB',
            'marker-size': 'small',
        };
    }
    const props: Record<string, string | number> = {};
    if (feature.style?.fillColor) props['fill'] = feature.style.fillColor;
    if (feature.style?.fillOpacity != null) props['fill-opacity'] = feature.style.fillOpacity;
    if (feature.style?.strokeColor) props['stroke'] = feature.style.strokeColor;
    if (feature.style?.strokeWidth != null) props['stroke-width'] = feature.style.strokeWidth;
    if (feature.style?.strokeOpacity != null) props['stroke-opacity'] = feature.style.strokeOpacity;
    return props;
}

function positionPath(position: StaticMapPosition): string {
    if (position === 'auto') return 'auto';
    if ('center' in position) return `${position.center[0]},${position.center[1]},${position.zoom},0`;
    return `[${position.bbox.join(',')}]`;
}

/**
 * A Static Images URL with the polygons and points drawn as one GeoJSON
 * overlay. Geometry is thinned until the URL fits Mapbox's limit; null when
 * there is nothing to draw or even the thinnest version does not fit.
 * `padding` applies only to `auto` and a bounding box, as Mapbox defines it.
 */
export function staticMapOverlayUrl({
    features,
    position,
    width,
    height,
    padding,
}: {
    features: StaticMapFeature[];
    position: StaticMapPosition;
    width: number;
    height: number;
    padding?: number;
}): string | null {
    const token = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    const validFeatures = features.filter(f =>
        f.geometry?.type === 'Polygon' ||
        f.geometry?.type === 'MultiPolygon' ||
        f.geometry?.type === 'Point'
    );
    if (validFeatures.length === 0) return null;

    const geojsonFeatures = validFeatures.map(f => ({
        type: 'Feature' as const,
        properties: toSimplestyle(f),
        geometry: f.geometry,
    }));
    const paddingParam = padding != null && (position === 'auto' || 'bbox' in position) ? `&padding=${padding}` : '';

    // Try progressively simpler geometries until URL fits
    for (const maxPoints of [200, 100, 50, 25]) {
        const collection = {
            type: 'FeatureCollection',
            features: geojsonFeatures.map(f => ({
                ...f,
                geometry: simplifyGeometry(f.geometry, maxPoints),
            })),
        };

        const encoded = encodeURIComponent(JSON.stringify(collection));
        const url = `https://api.mapbox.com/styles/v1/${STATIC_MAP_STYLE}/static/geojson(${encoded})/${positionPath(position)}/${width}x${height}@2x?access_token=${token}${paddingParam}`;

        if (url.length <= MAX_URL_LENGTH) {
            return url;
        }
    }
    return null;
}
