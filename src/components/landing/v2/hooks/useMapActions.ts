import { useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { DEFAULT_MAP_STYLE, SATELLITE_MAP_STYLE } from '@/components/map/map';
import { DEFAULT_VIEW, EXPLAIN_LNGLAT, SUBJECT_FOCUS_ZOOM, type FlyTarget } from '../landingCore';

type Args = {
    /** the live Mapbox instance (null until the map is ready) */
    mapInstance: MapboxMap | null;
    /** current layout — offsets the camera right of the floating list on desktop */
    isMobile: boolean;
};

/**
 * The map's imperative camera actions and the small pieces of state they own: the
 * geolocation dot, a geocoded address point, a pending fly-to target, and the basemap
 * (street ⟷ satellite) with its preserved camera. Splitting these out keeps LandingV2
 * focused on wiring and the marker/popup effects.
 */
export function useMapActions({ mapInstance, isMobile }: Args) {
    // Browser-geolocation dot (from the "locate me" control).
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    // A geocoded address search → a point marker on the map (cleared on a new search).
    const [addressPoint, setAddressPoint] = useState<{ lat: number; lng: number } | null>(null);
    // A pending fly-to (point or a municipality's bounds) consumed by the <Map>.
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);
    // Basemap (street ⟷ satellite). Toggling remounts the map with the camera preserved.
    const [mapStyle, setMapStyle] = useState(DEFAULT_MAP_STYLE);
    const cameraRef = useRef<{ center: [number, number]; zoom: number }>({
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
    });
    const satellite = mapStyle === SATELLITE_MAP_STYLE;

    const toggleMapStyle = () => {
        if (mapInstance) {
            const c = mapInstance.getCenter();
            cameraRef.current = { center: [c.lng, c.lat], zoom: mapInstance.getZoom() };
        }
        setMapStyle((s) => (s === SATELLITE_MAP_STYLE ? DEFAULT_MAP_STYLE : SATELLITE_MAP_STYLE));
    };

    const locate = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setGeo({ lat, lng });
                setFlyTo({ type: 'Point', coordinates: [lng, lat] });
            },
            () => {
                // denied/unavailable — leave the map where it is
            },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    };

    // Geocode a typed address and fly the map to it (used when Enter is pressed on an
    // address-style search query that isn't a category/municipality).
    const locateAddress = (q: string) => {
        if (!q.trim()) return;
        fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((res: { lng?: number; lat?: number } | null) => {
                if (res && typeof res.lng === 'number' && typeof res.lat === 'number') {
                    setAddressPoint({ lat: res.lat, lng: res.lng });
                    setFlyTo({ type: 'Point', coordinates: [res.lng, res.lat] });
                }
            });
    };

    const zoomIn = () => mapInstance?.zoomIn();
    const zoomOut = () => mapInstance?.zoomOut();

    // Center the OpenCouncil location (Κων/νου Σμολένσκη 22, Αθήνα) — the info card's and
    // the map badge's "view location" action. Centers like a subject (desktop offsets it
    // right of center to clear the floating list).
    const showExplainLocation = () => {
        if (mapInstance) {
            mapInstance.easeTo({
                center: EXPLAIN_LNGLAT,
                zoom: Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM),
                duration: 600,
                offset: isMobile ? [0, 0] : [210, 0],
            });
        } else {
            setFlyTo({ type: 'Point', coordinates: EXPLAIN_LNGLAT });
        }
    };

    return {
        geo,
        addressPoint,
        setAddressPoint,
        flyTo,
        setFlyTo,
        mapStyle,
        satellite,
        cameraRef,
        toggleMapStyle,
        locate,
        locateAddress,
        zoomIn,
        zoomOut,
        showExplainLocation,
    };
}
