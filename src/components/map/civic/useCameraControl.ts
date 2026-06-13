import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import { calculateGeometryBounds } from '@/lib/geo';
import type { MapSubject } from '@/lib/map/types';
import type { CivicMapCamera, CivicMapPadding } from './types';

const CAMERA_INTRO_ZOOM_OFFSET = 0.6;
const CAMERA_INTRO_DURATION_MS = 600;
const CAMERA_REFIT_DURATION_MS = 600;
const DEFAULT_CAMERA_PADDING = 48;

export function toMapboxPadding(padding: CivicMapPadding | undefined): number | mapboxgl.PaddingOptions {
    return padding ?? DEFAULT_CAMERA_PADDING;
}

export function boundsFromSubjects(subjects: MapSubject[]): mapboxgl.LngLatBoundsLike | null {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const subject of subjects) {
        if (!subject.anchor) continue;
        const [lng, lat] = subject.anchor;
        // Junk geocodes (a handful of rows) must not drag the fit across the globe.
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 85 || Math.abs(lng) > 180) continue;
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    }
    if (minLng > maxLng) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
}

export function boundsFromGeometry(geometry: GeoJSON.Geometry): mapboxgl.LngLatBoundsLike | null {
    const { bounds } = calculateGeometryBounds(geometry);
    if (!bounds) return null;
    return [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]];
}

/**
 * Fits the camera to camera.fitTo once the style loads (waiting for subjects
 * when fitting to them), with a single short ease-in as the load moment —
 * and re-fits when fitTo changes identity. Later subject updates (filter
 * changes) deliberately leave the camera alone.
 */
export function useCameraControl(
    map: mapboxgl.Map | null,
    isLoaded: boolean,
    options: {
        camera: CivicMapCamera | undefined;
        subjects: MapSubject[];
        reducedMotion: boolean;
        intro: boolean;
        paddingRef: React.MutableRefObject<number | mapboxgl.PaddingOptions>;
        initialCenter: [number, number];
        initialZoom: number;
    },
): void {
    const lastFitRef = useRef<CivicMapCamera['fitTo']>(undefined);
    const subjectsRef = useRef(options.subjects);
    subjectsRef.current = options.subjects;
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const fitTo = options.camera?.fitTo;
    const waitingForSubjects = fitTo === 'subjects' && options.subjects.length === 0;

    useEffect(() => {
        if (!map || !isLoaded || !fitTo || waitingForSubjects) return;
        if (lastFitRef.current === fitTo) return;

        const isFirstFit = lastFitRef.current === undefined;

        // When mapbox's hash option restored a camera deep-link, the map sits
        // somewhere other than our initial camera — honor it over the first
        // fit. (Comparing cameras, rather than sniffing location.hash, stays
        // correct under StrictMode's double mount, where the first map
        // instance writes its own camera into the hash.)
        if (isFirstFit && optionsRef.current.camera?.urlHash) {
            const center = map.getCenter();
            const [initialLng, initialLat] = optionsRef.current.initialCenter;
            const movedByHash =
                Math.abs(map.getZoom() - optionsRef.current.initialZoom) > 0.05 ||
                Math.abs(center.lng - initialLng) > 0.01 ||
                Math.abs(center.lat - initialLat) > 0.01;
            if (movedByHash) {
                lastFitRef.current = fitTo;
                return;
            }
        }

        const bounds = fitTo === 'subjects'
            ? boundsFromSubjects(subjectsRef.current)
            : boundsFromGeometry(fitTo);
        if (!bounds) return;

        lastFitRef.current = fitTo;
        const { reducedMotion, intro, paddingRef } = optionsRef.current;
        const padding = paddingRef.current;

        if (isFirstFit) {
            if (intro && !reducedMotion) {
                // The one sanctioned flourish: land slightly wide, then one
                // short ease into the proper fit while content settles.
                const target = map.cameraForBounds(bounds, { padding });
                if (target?.center && typeof target.zoom === 'number') {
                    map.jumpTo({ center: target.center, zoom: Math.max(target.zoom - CAMERA_INTRO_ZOOM_OFFSET, 0), padding });
                    map.easeTo({ center: target.center, zoom: target.zoom, padding, duration: CAMERA_INTRO_DURATION_MS });
                    return;
                }
            }
            map.fitBounds(bounds, { padding, duration: 0 });
            return;
        }

        map.fitBounds(bounds, { padding, duration: reducedMotion ? 0 : CAMERA_REFIT_DURATION_MS });
    }, [map, isLoaded, fitTo, waitingForSubjects]);
}
