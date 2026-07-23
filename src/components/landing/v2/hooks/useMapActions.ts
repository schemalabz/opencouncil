import { useCallback, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { DEFAULT_MAP_STYLE, SATELLITE_MAP_STYLE } from '@/components/map/constants';
import { captureLanding, captureLandingAction } from '@/lib/landing/analytics';
import { EXPLAIN_LNGLAT, SUBJECT_FOCUS_ZOOM, type FlyTarget } from '@/lib/landing/landingCore';
import { isValidLngLat } from '@/lib/landing/landingData';
import type { LatLng } from '@/lib/google-maps';

type Args = {
    /** the live Mapbox instance (null until the map is ready) */
    mapInstance: MapboxMap | null;
    /** current layout — offsets the camera right of the floating list on desktop */
    isMobile: boolean;
    /** realm-resolved initial camera framing (getRealmDefaultMapView(realm)) */
    defaultView: { center: [number, number]; zoom: number };
};

/**
 * The map's imperative camera actions and the state they own: the geolocation dot, a geocoded
 * address point, a pending fly-to target, and the basemap (street ⟷ satellite) with its
 * preserved camera.
 */
export function useMapActions({ mapInstance, isMobile, defaultView }: Args) {
    // Browser-geolocation dot (from the "locate me" control).
    const [geo, setGeo] = useState<LatLng | null>(null);
    // The last "locate me" attempt failed (denied permission / timeout) → drives an error tooltip.
    const [geoError, setGeoError] = useState(false);
    // A geocoded address search → a point marker on the map (cleared on a new search).
    const [addressPoint, setAddressPoint] = useState<LatLng | null>(null);
    // A pending fly-to (point or a municipality's bounds) consumed by the <Map>.
    const [flyTo, setFlyTo] = useState<FlyTarget>(null);
    // Basemap (street ⟷ satellite). Toggling remounts the map with the camera preserved.
    const [mapStyle, setMapStyle] = useState(DEFAULT_MAP_STYLE);
    const cameraRef = useRef<{ center: [number, number]; zoom: number }>({
        center: defaultView.center,
        zoom: defaultView.zoom,
    });
    const satellite = mapStyle === SATELLITE_MAP_STYLE;

    const toggleMapStyle = () => {
        if (mapInstance) {
            const c = mapInstance.getCenter();
            cameraRef.current = { center: [c.lng, c.lat], zoom: mapInstance.getZoom() };
        }
        setMapStyle((s) => (s === SATELLITE_MAP_STYLE ? DEFAULT_MAP_STYLE : SATELLITE_MAP_STYLE));
    };

    // Bumped per locate() call so only the latest request's callback wins (rapid clicks otherwise
    // race — an older failure could flag an error beside a map a newer request already moved).
    const locateReqRef = useRef(0);
    const locate = () => {
        setGeoError(false);
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setGeoError(true);
            return;
        }
        captureLandingAction('locate', {});
        const reqId = ++locateReqRef.current;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (reqId !== locateReqRef.current) return;
                captureLanding('locate_result', { status: 'granted' });
                const { latitude: lat, longitude: lng } = pos.coords;
                setGeo({ lat, lng });
                setFlyTo({ type: 'Point', coordinates: [lng, lat] });
            },
            (err) => {
                if (reqId !== locateReqRef.current) return;
                // PERMISSION_DENIED (1) is a distinct signal from timeouts/unavailability.
                captureLanding('locate_result', { status: err.code === 1 ? 'denied' : 'error' });
                console.warn('Geolocation failed:', err.code, err.message);
                setGeoError(true);
            },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    };
    // Stable identity so the tooltip's auto-dismiss timer isn't restarted on every parent render.
    const dismissGeoError = useCallback(() => setGeoError(false), []);

    // Geocode a typed address and fly to it (Enter on an address-style query).
    const locateAddress = (q: string) => {
        if (!q.trim()) return;
        fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((res: { lng?: number; lat?: number } | null) => {
                if (res && res.lng != null && res.lat != null && isValidLngLat(res.lng, res.lat)) {
                    setAddressPoint({ lat: res.lat, lng: res.lng });
                    setFlyTo({ type: 'Point', coordinates: [res.lng, res.lat] });
                }
            });
    };

    const zoomIn = () => mapInstance?.zoomIn();
    const zoomOut = () => mapInstance?.zoomOut();

    // Center the OpenCouncil location — the info card's / map badge's "view location" action.
    // Centers like a subject (desktop offsets it right to clear the floating list).
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
        geoError,
        dismissGeoError,
        locateAddress,
        zoomIn,
        zoomOut,
        showExplainLocation,
    };
}
