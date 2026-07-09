import { useMemo } from 'react';
import type { MapFeature } from '@/components/map/map';
import type { LatLng } from '@/lib/google-maps';
import type { ClickedMunicipality, LandingMapCity } from '@/lib/landing/landingData';

type Args = {
    /** geolocation puck */
    geo: LatLng | null;
    /** searched-address marker */
    addressPoint: LatLng | null;
    /** the municipality chosen in the filters (single-select), or null */
    filterCityId: string | null;
    /** boundary geometry per filtered city (cached) */
    cityGeometries: Record<string, GeoJSON.Geometry>;
    /** an out-of-network municipality the user clicked on the map */
    clickedMunicipality: ClickedMunicipality | null;
    /** cooperating municipalities (for the orange OC outlines) */
    mapCities: LandingMapCity[];
};

/**
 * The `<Map>` feature layer: orange outlines for OC municipalities, a blue-gray overlay for
 * the filtered δήμος, a purple shade for a clicked out-of-network one, and the geolocation /
 * searched-address dots. Subject pins are imperative HTML markers, not part of this layer.
 */
export function useMapFeatures({
    geo,
    addressPoint,
    filterCityId,
    cityGeometries,
    clickedMunicipality,
    mapCities,
}: Args): MapFeature[] {
    return useMemo(() => {
        const list: MapFeature[] = [];
        // Orange outlines for every OC municipality — non-interactive, hidden once one is filtered.
        if (!filterCityId) {
            for (const c of mapCities) {
                if (!c.geometry) continue;
                list.push({
                    id: `__oc-border__${c.id}`,
                    geometry: c.geometry,
                    properties: { featureType: 'city', officialSupport: false, interactive: false },
                    style: {
                        fillColor: 'hsl(24, 100%, 50%)',
                        fillOpacity: 0.03,
                        strokeColor: 'hsl(24, 100%, 50%)',
                        strokeWidth: 1.5,
                        strokeOpacity: 0.9,
                    },
                });
            }
        }
        // Blue-gray overlay over the filtered municipality. officialSupport:false keeps the
        // map's built-in hover from clearing the fill on supported cities.
        const cityGeom = filterCityId ? cityGeometries[filterCityId] : null;
        if (cityGeom) {
            list.push({
                id: `__city__${filterCityId}`,
                geometry: cityGeom,
                properties: { featureType: 'city', officialSupport: false },
                style: {
                    fillColor: 'hsl(212, 50%, 76%)',
                    fillOpacity: 0.22,
                    strokeColor: 'hsl(212, 45%, 58%)',
                    strokeWidth: 1.5,
                    strokeOpacity: 0.85,
                },
            });
        }
        // A clicked out-of-network municipality — shaded purple, distinct from the orange
        // OC borders and the blue filter selection.
        if (clickedMunicipality) {
            list.push({
                id: `__clicked-city__${clickedMunicipality.id}`,
                geometry: clickedMunicipality.geometry,
                properties: { featureType: 'city', officialSupport: false },
                style: {
                    fillColor: 'hsl(280, 65%, 60%)',
                    fillOpacity: 0.2,
                    strokeColor: 'hsl(280, 65%, 60%)',
                    strokeWidth: 1.5,
                    strokeOpacity: 0.9,
                },
            });
        }
        if (geo) {
            list.push({
                id: '__geo__',
                geometry: { type: 'Point', coordinates: [geo.lng, geo.lat] },
                properties: { kind: 'geo' },
                style: { fillColor: '#2A6FDB', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 8, strokeOpacity: 1 },
            });
        }
        // Searched-address marker — an orange dot at the geocoded location.
        if (addressPoint) {
            list.push({
                id: '__address__',
                geometry: { type: 'Point', coordinates: [addressPoint.lng, addressPoint.lat] },
                properties: { kind: 'address' },
                style: { fillColor: 'hsl(24, 100%, 50%)', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 7, strokeOpacity: 1 },
            });
        }
        return list;
    }, [geo, addressPoint, filterCityId, cityGeometries, clickedMunicipality, mapCities]);
}
