import { distanceToGeometry, isPointInGeometry } from "@/lib/geo";
import type { AddressLookupConfig, GeoSetData, Geometry, StaticGeometry } from "./types";

export const DEFAULT_ADDRESS_LOOKUP: Required<Pick<AddressLookupConfig, 'nearbyRadiusMeters' | 'pointRadiusMeters'>> = {
    nearbyRadiusMeters: 120,
    pointRadiusMeters: 500,
};

export type ResolvedAddressLookupConfig = AddressLookupConfig & typeof DEFAULT_ADDRESS_LOOKUP;

export interface NearbyItem {
    geometry: Geometry;
    geoSet: GeoSetData;
    distance: number;
}

export interface NearbyGroup {
    geoSet: GeoSetData;
    items: NearbyItem[];
}

export interface AddressLookupResult {
    /** The zone containing the address, when a zone geoset is configured and one matches. */
    zone: { geometry: Geometry; geoSet: GeoSetData } | null;
    zoneConfigured: boolean;
    /** Area geometries within `nearbyRadiusMeters`, one group per geoset, nearest group first. */
    areaGroups: NearbyGroup[];
    /** Point geometries within `pointRadiusMeters`, nearest first. */
    points: NearbyItem[];
    config: ResolvedAddressLookupConfig;
}

/** The GeoJSON a static geometry renders with: an admin edit wins over the regulation file. */
export function resolveStaticGeoJSON(
    geometry: Geometry,
    savedGeometries?: Record<string, GeoJSON.Geometry>
): GeoJSON.Geometry | null {
    const saved = savedGeometries?.[geometry.id];
    if (saved) return saved;
    if (geometry.type === 'derived') return null;
    return (geometry as StaticGeometry).geojson ?? null;
}

function isArea(geojson: GeoJSON.Geometry): boolean {
    return geojson.type === 'Polygon' || geojson.type === 'MultiPolygon';
}

export function resolveAddressLookupConfig(config?: AddressLookupConfig): ResolvedAddressLookupConfig {
    return {
        ...config,
        nearbyRadiusMeters: config?.nearbyRadiusMeters ?? DEFAULT_ADDRESS_LOOKUP.nearbyRadiusMeters,
        pointRadiusMeters: config?.pointRadiusMeters ?? DEFAULT_ADDRESS_LOOKUP.pointRadiusMeters,
    };
}

export function formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)}μ`;
    return `${(meters / 1000).toFixed(1)}χλμ`;
}

/**
 * What the map should say about a searched address: the zone it falls in, the area geometries
 * (parking strips, communities, ...) around it and the point geometries near it.
 */
export function computeAddressLookup(
    point: [number, number],
    geoSets: GeoSetData[],
    config?: AddressLookupConfig,
    savedGeometries?: Record<string, GeoJSON.Geometry>
): AddressLookupResult {
    const resolved = resolveAddressLookupConfig(config);
    const zoneGeoSet = resolved.zoneGeoSetId ? geoSets.find((gs) => gs.id === resolved.zoneGeoSetId) : undefined;

    let zone: AddressLookupResult['zone'] = null;
    if (zoneGeoSet) {
        const hit = zoneGeoSet.geometries.find((g) => {
            const geojson = resolveStaticGeoJSON(g, savedGeometries);
            return geojson ? isPointInGeometry(point, geojson) : false;
        });
        if (hit) zone = { geometry: hit, geoSet: zoneGeoSet };
    }

    const areaGeoSets = resolved.nearbyGeoSetIds
        ? resolved.nearbyGeoSetIds
            .map((id) => geoSets.find((gs) => gs.id === id))
            .filter((gs): gs is GeoSetData => !!gs)
        : geoSets.filter((gs) => gs.id !== zoneGeoSet?.id && gs.geometries.some((g) => {
            const geojson = resolveStaticGeoJSON(g, savedGeometries);
            return geojson ? isArea(geojson) : false;
        }));

    const areaGroups: NearbyGroup[] = [];
    for (const geoSet of areaGeoSets) {
        const items: NearbyItem[] = [];
        for (const geometry of geoSet.geometries) {
            const geojson = resolveStaticGeoJSON(geometry, savedGeometries);
            if (!geojson || !isArea(geojson)) continue;
            const distance = distanceToGeometry(point, geojson);
            if (distance <= resolved.nearbyRadiusMeters) items.push({ geometry, geoSet, distance });
        }
        if (items.length === 0) continue;
        items.sort((a, b) => a.distance - b.distance);
        areaGroups.push({ geoSet, items });
    }
    areaGroups.sort((a, b) => a.items[0].distance - b.items[0].distance);

    const points: NearbyItem[] = [];
    for (const geoSet of geoSets) {
        for (const geometry of geoSet.geometries) {
            const geojson = resolveStaticGeoJSON(geometry, savedGeometries);
            if (!geojson || geojson.type !== 'Point') continue;
            const distance = distanceToGeometry(point, geojson);
            if (distance <= resolved.pointRadiusMeters) points.push({ geometry, geoSet, distance });
        }
    }
    points.sort((a, b) => a.distance - b.distance);

    return { zone, zoneConfigured: !!zoneGeoSet, areaGroups, points, config: resolved };
}
