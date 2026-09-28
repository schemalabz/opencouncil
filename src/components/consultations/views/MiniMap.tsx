"use client";

import { useMemo } from "react";
import Map, { type MapFeature } from "@/components/map/map";
import type { Location } from "@/lib/types/onboarding";
import type { AddressLookupResult, NearbyItem } from "../addressLookup";

/** The phone's small map on "your street": the address, the street sides at it, and the zone. */
export default function MiniMap({ address, items, zone }: { address: Location; items: NearbyItem[]; zone: AddressLookupResult['zone'] }) {
    const features = useMemo<MapFeature[]>(() => {
        const list: MapFeature[] = [];
        if (zone) {
            list.push({ id: zone.geometry.id, geometry: zone.geojson, properties: { interactive: false }, style: { fillColor: zone.geoSet.color, fillOpacity: 0.06, strokeColor: zone.geoSet.color, strokeWidth: 2, label: '' } });
        }
        for (const item of items) {
            list.push({ id: item.geometry.id, geometry: item.geojson, properties: { interactive: false }, style: { fillColor: item.geoSet.color, fillOpacity: 0.85, strokeColor: '#111827', strokeWidth: 2, label: '' } });
        }
        list.push({ id: 'address', geometry: { type: 'Point', coordinates: address.coordinates }, properties: { interactive: false }, style: { fillColor: '#C2410C', fillOpacity: 1, strokeColor: '#ffffff', strokeWidth: 9, label: '' } });
        return list;
    }, [address, items, zone]);

    const zoomTo = useMemo<GeoJSON.Geometry>(() => ({
        type: 'GeometryCollection',
        geometries: [
            { type: 'Point', coordinates: address.coordinates },
            ...items.map((item) => item.geojson),
        ],
    }), [address, items]);

    return (
        <div className="h-56 w-full bg-stone-200" aria-label={`Χάρτης γύρω από ${address.text}`} role="img">
            <Map
                center={address.coordinates}
                zoom={17}
                pitch={0}
                animateRotation={false}
                cooperativeGestures
                showStreetLabels
                features={features}
                zoomToGeometry={zoomTo}
                zoomPadding={36}
                className="h-full w-full"
            />
        </div>
    );
}
