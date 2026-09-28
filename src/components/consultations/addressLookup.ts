import { distanceToGeometry, isPointInGeometry } from "@/lib/geo";
import type { AddressLookupConfig, GeoSetData, Geometry, StaticGeometry } from "./types";

export const DEFAULT_ADDRESS_LOOKUP: Required<Pick<AddressLookupConfig, 'streetRadiusMeters' | 'streetMaxItems' | 'nearbyRadiusMeters'>> = {
    streetRadiusMeters: 30,
    streetMaxItems: 4,
    nearbyRadiusMeters: 400,
};

export type ResolvedAddressLookupConfig = AddressLookupConfig & typeof DEFAULT_ADDRESS_LOOKUP;

export interface NearbyItem {
    geometry: Geometry;
    geoSet: GeoSetData;
    distance: number;
}

export interface AddressLookupResult {
    /** The zone containing the address, when a zone geoset is configured and one matches. */
    zone: { geometry: Geometry; geoSet: GeoSetData } | null;
    zoneConfigured: boolean;
    /** Area geometries on the reader's street: within `streetRadiusMeters`, nearest first, at most `streetMaxItems`. */
    street: NearbyItem[];
    /** The nearest geometry of each "near you" geoset within `nearbyRadiusMeters`, nearest first. */
    nearby: NearbyItem[];
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

function hasGeometryOfKind(geoSet: GeoSetData, kind: 'area' | 'point', savedGeometries?: Record<string, GeoJSON.Geometry>): boolean {
    return geoSet.geometries.some((g) => {
        const geojson = resolveStaticGeoJSON(g, savedGeometries);
        if (!geojson) return false;
        return kind === 'area' ? isArea(geojson) : geojson.type === 'Point';
    });
}

export function resolveAddressLookupConfig(config?: AddressLookupConfig): ResolvedAddressLookupConfig {
    return {
        ...config,
        streetRadiusMeters: config?.streetRadiusMeters ?? DEFAULT_ADDRESS_LOOKUP.streetRadiusMeters,
        streetMaxItems: config?.streetMaxItems ?? DEFAULT_ADDRESS_LOOKUP.streetMaxItems,
        nearbyRadiusMeters: config?.nearbyRadiusMeters ?? DEFAULT_ADDRESS_LOOKUP.nearbyRadiusMeters,
    };
}

export function formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)}μ`;
    return `${(meters / 1000).toFixed(1)}χλμ`;
}

function pickGeoSets(ids: string[] | undefined, geoSets: GeoSetData[], fallback: (gs: GeoSetData) => boolean): GeoSetData[] {
    if (!ids) return geoSets.filter(fallback);
    return ids.map((id) => geoSets.find((gs) => gs.id === id)).filter((gs): gs is GeoSetData => !!gs);
}

/**
 * What a reader needs to know about their address: the zone it falls in, what the street sides
 * right there become, and the nearest facility of each kind around it.
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

    const streetGeoSets = pickGeoSets(resolved.streetGeoSetIds, geoSets,
        (gs) => gs.id !== zoneGeoSet?.id && hasGeometryOfKind(gs, 'area', savedGeometries));
    const street: NearbyItem[] = [];
    for (const geoSet of streetGeoSets) {
        for (const geometry of geoSet.geometries) {
            const geojson = resolveStaticGeoJSON(geometry, savedGeometries);
            if (!geojson || !isArea(geojson)) continue;
            const distance = distanceToGeometry(point, geojson);
            if (distance <= resolved.streetRadiusMeters) street.push({ geometry, geoSet, distance });
        }
    }
    street.sort((a, b) => a.distance - b.distance);
    street.splice(resolved.streetMaxItems);

    const onStreet = new Set(street.map((item) => item.geometry.id));
    const nearbyGeoSets = pickGeoSets(resolved.nearbyGeoSetIds, geoSets, (gs) => hasGeometryOfKind(gs, 'point', savedGeometries));
    const nearby: NearbyItem[] = [];
    for (const geoSet of nearbyGeoSets) {
        let best: NearbyItem | null = null;
        for (const geometry of geoSet.geometries) {
            if (onStreet.has(geometry.id)) continue;
            const geojson = resolveStaticGeoJSON(geometry, savedGeometries);
            if (!geojson) continue;
            const distance = distanceToGeometry(point, geojson);
            if (distance <= resolved.nearbyRadiusMeters && (!best || distance < best.distance)) best = { geometry, geoSet, distance };
        }
        if (best) nearby.push(best);
    }
    nearby.sort((a, b) => a.distance - b.distance);

    return { zone, zoneConfigured: !!zoneGeoSet, street, nearby, config: resolved };
}
