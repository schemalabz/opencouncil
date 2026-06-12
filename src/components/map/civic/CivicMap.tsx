"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { cn } from '@/lib/utils';
import { isWebGLSupported } from '@/lib/webgl';
import MapFallback from '../MapFallback';
import MapErrorBoundary from '../MapErrorBoundary';
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM } from '@/lib/map/constants';
import type { MapMunicipality, MapSubject } from '@/lib/map/types';
import { useMapInstance, usePrefersReducedMotion } from './useMapInstance';
import { boundsFromGeometry, toMapboxPadding, useCameraControl } from './useCameraControl';
import { useVisibleSubjects, toViewportBounds } from './useVisibleSubjects';
import { attachMunicipalitiesLayer, type MunicipalitiesLayerHandle } from './municipalitiesLayer';
import type { CivicMapHandle, CivicMapPadding, CivicMapProps } from './types';

const CONTEXT_SOURCE_ID = 'civic-context-boundary';
const CONTEXT_LINE_LAYER_ID = 'civic-context-boundary-line';

const FLY_TO_DURATION_MS = 800;
const FLY_TO_MIN_ZOOM = 14;

function contextBoundaryData(geometry: GeoJSON.Geometry | null | undefined): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: geometry ? [{ type: 'Feature', geometry, properties: {} }] : [],
    };
}

function CivicMapInner(props: CivicMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const reducedMotion = usePrefersReducedMotion();
    const interactive = props.interactive !== false;

    const { map, isLoaded } = useMapInstance(containerRef, {
        initialCenter: props.camera?.initialCenter ?? MAP_DEFAULT_CENTER,
        initialZoom: props.camera?.initialZoom ?? MAP_DEFAULT_ZOOM,
        maxZoom: props.camera?.maxZoom ?? MAP_MAX_ZOOM,
        interactive,
        cooperativeGestures: props.cooperativeGestures ?? false,
        urlHash: props.camera?.urlHash ?? false,
    });

    // Callbacks live in refs so map listeners register once and never go stale.
    const callbacksRef = useRef({
        onMunicipalityClick: props.onMunicipalityClick,
        onMoveEnd: props.onMoveEnd,
        onMapReady: props.onMapReady,
    });
    useEffect(() => {
        callbacksRef.current = {
            onMunicipalityClick: props.onMunicipalityClick,
            onMoveEnd: props.onMoveEnd,
            onMapReady: props.onMapReady,
        };
    });

    const municipalitiesById = useMemo(
        () => new Map((props.municipalities ?? []).map(municipality => [municipality.id, municipality])),
        [props.municipalities],
    );
    const municipalitiesByIdRef = useRef(municipalitiesById);
    municipalitiesByIdRef.current = municipalitiesById;

    // Camera padding shared by every programmatic move; pages update it via
    // the handle when their chrome changes (e.g. mobile drawer snaps).
    const paddingRef = useRef<number | mapboxgl.PaddingOptions>(toMapboxPadding(props.camera?.padding));
    useEffect(() => {
        paddingRef.current = toMapboxPadding(props.camera?.padding);
    }, [props.camera?.padding]);

    // Municipalities layer
    const muniHandleRef = useRef<MunicipalitiesLayerHandle | null>(null);
    const hasMunicipalities = (props.municipalities?.length ?? 0) > 0;
    useEffect(() => {
        if (!map || !isLoaded || !hasMunicipalities || muniHandleRef.current) return;
        muniHandleRef.current = attachMunicipalitiesLayer(map, [...municipalitiesByIdRef.current.values()], {
            interactive,
            onClick: municipalityId => {
                const municipality = municipalitiesByIdRef.current.get(municipalityId);
                if (municipality) callbacksRef.current.onMunicipalityClick?.(municipality);
            },
        });
        return () => {
            muniHandleRef.current?.destroy();
            muniHandleRef.current = null;
        };
    }, [map, isLoaded, hasMunicipalities, interactive]);
    useEffect(() => {
        if (props.municipalities) muniHandleRef.current?.update(props.municipalities);
    }, [props.municipalities]);

    // Context boundary (meeting pages: the city outline)
    useEffect(() => {
        if (!map || !isLoaded) return;
        if (!map.getSource(CONTEXT_SOURCE_ID)) {
            map.addSource(CONTEXT_SOURCE_ID, { type: 'geojson', data: contextBoundaryData(props.contextBoundary) });
            map.addLayer({
                id: CONTEXT_LINE_LAYER_ID,
                type: 'line',
                source: CONTEXT_SOURCE_ID,
                paint: {
                    'line-color': '#1c1917',
                    'line-width': 1.2,
                    'line-opacity': 0.35,
                },
            });
        } else {
            const source = map.getSource(CONTEXT_SOURCE_ID) as mapboxgl.GeoJSONSource;
            source.setData(contextBoundaryData(props.contextBoundary));
        }
    }, [map, isLoaded, props.contextBoundary]);

    useCameraControl(map, isLoaded, {
        camera: props.camera,
        subjects: props.subjects,
        reducedMotion,
        intro: interactive,
        paddingRef,
        initialCenter: props.camera?.initialCenter ?? MAP_DEFAULT_CENTER,
        initialZoom: props.camera?.initialZoom ?? MAP_DEFAULT_ZOOM,
    });

    useVisibleSubjects(map, isLoaded, props.subjects, props.onVisibleSubjectsChange);

    // moveend reporting
    useEffect(() => {
        if (!map || !isLoaded) return;
        const onMoveEnd = () => {
            const callback = callbacksRef.current.onMoveEnd;
            if (!callback) return;
            const bounds = map.getBounds();
            if (!bounds) return;
            const center = map.getCenter();
            callback({ center: [center.lng, center.lat], zoom: map.getZoom(), bounds: toViewportBounds(bounds) });
        };
        map.on('moveend', onMoveEnd);
        return () => {
            map.off('moveend', onMoveEnd);
        };
    }, [map, isLoaded]);

    // Imperative handle for page-level controls
    const handle = useMemo<CivicMapHandle | null>(() => {
        if (!map) return null;
        return {
            flyTo(center, zoom) {
                map.flyTo({
                    center,
                    zoom: zoom ?? Math.max(map.getZoom(), FLY_TO_MIN_ZOOM),
                    padding: paddingRef.current,
                    duration: reducedMotion ? 0 : FLY_TO_DURATION_MS,
                    essential: true,
                });
            },
            fitGeometry(geometry, padding?: CivicMapPadding) {
                const bounds = boundsFromGeometry(geometry);
                if (!bounds) return;
                map.fitBounds(bounds, {
                    padding: padding !== undefined ? padding : paddingRef.current,
                    duration: reducedMotion ? 0 : FLY_TO_DURATION_MS,
                });
            },
            getBounds() {
                const bounds = map.getBounds();
                return bounds ? toViewportBounds(bounds) : null;
            },
            setPadding(padding: CivicMapPadding) {
                paddingRef.current = toMapboxPadding(padding);
            },
        };
    }, [map, reducedMotion]);

    useEffect(() => {
        if (handle && isLoaded) callbacksRef.current.onMapReady?.(handle);
    }, [handle, isLoaded]);

    return (
        <div className={cn('relative overflow-hidden bg-muted', props.className)}>
            {/* mapbox's own stylesheet forces position:relative on this node,
                so it sizes via h-full rather than absolute insets */}
            <div
                ref={containerRef}
                className="h-full w-full"
                role="region"
                aria-label={props.ariaLabel}
            />
            {props.children ? (
                <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
                    {props.children}
                </div>
            ) : null}
        </div>
    );
}

const FALLBACK_SUBJECT_CAP = 60;

// MapFallback renders via the Static Images API and needs concrete
// coordinates — GeometryCollections are skipped.
type FallbackGeometry = Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>;
type FallbackFeature = { geometry: FallbackGeometry; style?: Record<string, string | number> };

function buildFallbackFeatures(
    subjects: MapSubject[],
    municipalities: MapMunicipality[] | undefined,
    contextBoundary: GeoJSON.Geometry | null | undefined,
): FallbackFeature[] {
    const features: FallbackFeature[] = [];
    const boundaryStyle = { strokeColor: '#1c1917', strokeWidth: 1, strokeOpacity: 0.5, fillOpacity: 0 };
    for (const municipality of municipalities ?? []) {
        if (!municipality.geometry || municipality.geometry.type === 'GeometryCollection') continue;
        features.push({ geometry: municipality.geometry, style: boundaryStyle });
    }
    if (contextBoundary && contextBoundary.type !== 'GeometryCollection') {
        features.push({ geometry: contextBoundary, style: boundaryStyle });
    }
    for (const subject of subjects.slice(0, FALLBACK_SUBJECT_CAP)) {
        features.push({
            geometry: { type: 'Point', coordinates: subject.anchor },
            style: { fillColor: subject.topicColor, fillOpacity: 0.85 },
        });
    }
    return features;
}

/**
 * The shared OpenCouncil map: subjects (clustered, importance-scaled pins)
 * over a municipalities layer, with WebGL/static fallback. Props-driven —
 * pages fetch data and own all surrounding chrome via the children overlay.
 */
export default function CivicMap(props: CivicMapProps) {
    const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

    useEffect(() => {
        setWebglSupported(isWebGLSupported());
    }, []);

    // Needed by both the no-WebGL fallback and the error boundary's fallback.
    const fallbackFeatures = useMemo(
        () => (webglSupported === null
            ? []
            : buildFallbackFeatures(props.subjects, props.municipalities, props.contextBoundary)),
        [webglSupported, props.subjects, props.municipalities, props.contextBoundary],
    );

    if (webglSupported === null) {
        return <div className={cn('bg-muted', props.className)} />;
    }

    if (!webglSupported) {
        return <MapFallback className={props.className} features={fallbackFeatures} />;
    }

    return (
        <MapErrorBoundary className={props.className} features={fallbackFeatures}>
            <CivicMapInner {...props} />
        </MapErrorBoundary>
    );
}
