"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { cn } from '@/lib/utils';
import { isWebGLSupported } from '@/lib/webgl';
import MapFallback from '../MapFallback';
import MapErrorBoundary from '../MapErrorBoundary';
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM } from '@/lib/map/constants';
import type { MapMunicipality, MapOverlay, MapReferenceMarker, MapSubject } from '@/lib/map/types';
import { useMapInstance, usePrefersReducedMotion } from './useMapInstance';
import { boundsFromGeometry, toMapboxPadding, useCameraControl } from './useCameraControl';
import { useVisibleSubjects, toViewportBounds } from './useVisibleSubjects';
import {
    attachMunicipalitiesLayer,
    BOUNDARY_FADE_END_ZOOM,
    MUNICIPALITIES_FILL_LAYER_ID,
    type MunicipalitiesLayerHandle,
} from './municipalitiesLayer';
import { attachSubjectsLayer, SUBJECTS_HALO_LAYER_ID, topicsFromSubjects, type SubjectsLayerHandle } from './subjectsLayer';
import { attachOverlaysLayer, type OverlaysLayerHandle } from './overlaysLayer';
import { createDonutMarkerPool, type DonutMarkerPool } from './donutMarkerPool';
import { createSpiderfier, type Spiderfier } from './spiderfier';
import { anchorKeyOf } from '@/lib/map/spiderfy';
import { DEFAULT_MARKER_OPTIONS, type CivicMapHandle, type CivicMapPadding, type CivicMapProps } from './types';

const FLY_TO_DURATION_MS = 800;
const FLY_TO_MIN_ZOOM = 14;

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
        onSubjectSelect: props.onSubjectSelect,
        onSubjectHover: props.onSubjectHover,
    });
    useEffect(() => {
        callbacksRef.current = {
            onMunicipalityClick: props.onMunicipalityClick,
            onMoveEnd: props.onMoveEnd,
            onMapReady: props.onMapReady,
            onSubjectSelect: props.onSubjectSelect,
            onSubjectHover: props.onSubjectHover,
        };
    });

    const municipalitiesById = useMemo(
        () => new Map((props.municipalities ?? []).map(municipality => [municipality.id, municipality])),
        [props.municipalities],
    );
    const municipalitiesByIdRef = useRef(municipalitiesById);
    municipalitiesByIdRef.current = municipalitiesById;

    const subjectsById = useMemo(
        () => new Map(props.subjects.map(subject => [subject.id, subject])),
        [props.subjects],
    );
    const subjectsByIdRef = useRef(subjectsById);
    subjectsByIdRef.current = subjectsById;
    const subjectsRef = useRef(props.subjects);
    subjectsRef.current = props.subjects;

    // Subjects sharing the exact same spot (~0.1m) — the spiderfier's groups
    const subjectsByAnchor = useMemo(() => {
        const groups = new Map<string, MapSubject[]>();
        for (const subject of props.subjects) {
            const key = anchorKeyOf(subject.anchor);
            const group = groups.get(key);
            if (group) {
                group.push(subject);
            } else {
                groups.set(key, [subject]);
            }
        }
        return groups;
    }, [props.subjects]);
    const subjectsByAnchorRef = useRef(subjectsByAnchor);
    subjectsByAnchorRef.current = subjectsByAnchor;

    // Marker options are read once at attach — pages configure them per
    // surface, not per render.
    const markerOptionsRef = useRef({ ...DEFAULT_MARKER_OPTIONS, ...props.markerOptions });
    const clusterAriaLabelRef = useRef(props.labels?.clusterAria);
    clusterAriaLabelRef.current = props.labels?.clusterAria;

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
            beforeId: SUBJECTS_HALO_LAYER_ID,
        });
        return () => {
            muniHandleRef.current?.destroy();
            muniHandleRef.current = null;
        };
    }, [map, isLoaded, hasMunicipalities, interactive]);
    useEffect(() => {
        if (props.municipalities) muniHandleRef.current?.update(props.municipalities);
    }, [props.municipalities]);

    // Quiet styled geometries: page-provided overlays + the context boundary
    const overlays = useMemo<MapOverlay[]>(() => {
        const list = [...(props.overlays ?? [])];
        if (props.contextBoundary) {
            list.push({
                id: '__context-boundary',
                geometry: props.contextBoundary,
                style: { strokeColor: '#1c1917', strokeWidth: 1.2, strokeOpacity: 0.35, fillOpacity: 0 },
            });
        }
        return list;
    }, [props.overlays, props.contextBoundary]);
    const overlaysHandleRef = useRef<OverlaysLayerHandle | null>(null);
    const overlaysRef = useRef(overlays);
    overlaysRef.current = overlays;
    useEffect(() => {
        if (!map || !isLoaded || overlaysHandleRef.current) return;
        overlaysHandleRef.current = attachOverlaysLayer(map, overlaysRef.current, { beforeId: SUBJECTS_HALO_LAYER_ID });
        return () => {
            overlaysHandleRef.current?.destroy();
            overlaysHandleRef.current = null;
        };
    }, [map, isLoaded]);
    useEffect(() => {
        overlaysHandleRef.current?.update(overlays);
    }, [overlays]);

    // Subjects: clustered source + pins/dots layers + donut marker pool
    const subjectsHandleRef = useRef<SubjectsLayerHandle | null>(null);
    const donutPoolRef = useRef<DonutMarkerPool | null>(null);

    // Spiderfier: co-located subjects fan out so each stays selectable
    const spiderfierRef = useRef<Spiderfier | null>(null);
    const closeSpiderfier = useCallback(() => {
        if (spiderfierRef.current?.isOpen()) {
            spiderfierRef.current.close();
            subjectsHandleRef.current?.setHiddenAnchorKey(null);
        }
    }, []);
    const openSpiderfier = useCallback((group: MapSubject[], anchor: [number, number]) => {
        if (!spiderfierRef.current) return;
        subjectsHandleRef.current?.setHiddenAnchorKey(anchorKeyOf(anchor));
        spiderfierRef.current.open(group, anchor);
    }, []);
    useEffect(() => {
        if (!map || !isLoaded) return;
        const markerOptions = markerOptionsRef.current;
        subjectsHandleRef.current = attachSubjectsLayer(map, subjectsRef.current, {
            ...markerOptions,
            interactive,
            onHover: subjectId => callbacksRef.current.onSubjectHover?.(subjectId),
        });
        if (interactive && markerOptions.spiderfy) {
            spiderfierRef.current = createSpiderfier(map, {
                reducedMotion,
                onSelect: subject => {
                    closeSpiderfier();
                    callbacksRef.current.onSubjectSelect?.(subject);
                },
                onHover: subjectId => callbacksRef.current.onSubjectHover?.(subjectId),
            });
        }
        if (markerOptions.clusterMode === 'donut') {
            donutPoolRef.current = createDonutMarkerPool(map, {
                topics: topicsFromSubjects(subjectsRef.current),
                clusterAriaLabel: count => clusterAriaLabelRef.current?.(count) ?? `${count}`,
                reducedMotion,
                clusterMaxZoom: markerOptions.clusterMaxZoom,
                onUnexpandable: (subjectIds, lngLat) => {
                    const group = subjectIds
                        .map(id => subjectsByIdRef.current.get(id))
                        .filter((subject): subject is MapSubject => Boolean(subject));
                    const sharedAnchors = new Set(group.map(subject => anchorKeyOf(subject.anchor)));
                    const pinsZoom = markerOptions.clusterMaxZoom + 1;

                    // One shared spot → settle the camera there, then fan out.
                    if (markerOptions.spiderfy && interactive && group.length > 1 && sharedAnchors.size === 1) {
                        const anchor = group[0].anchor;
                        const center = map.getCenter();
                        const needsMove = map.getZoom() < pinsZoom - 0.05 ||
                            Math.abs(center.lng - anchor[0]) > 0.0005 ||
                            Math.abs(center.lat - anchor[1]) > 0.0005;
                        if (needsMove) {
                            map.once('moveend', () => openSpiderfier(group, anchor));
                            map.easeTo({
                                center: anchor,
                                zoom: Math.max(map.getZoom(), pinsZoom),
                                padding: paddingRef.current,
                                duration: reducedMotion ? 0 : 600,
                            });
                        } else {
                            openSpiderfier(group, anchor);
                        }
                        return;
                    }
                    // Distinct-but-close points: jump past the clustering
                    // ceiling and let individual pins take over.
                    map.easeTo({
                        center: lngLat,
                        zoom: pinsZoom + 0.2,
                        padding: paddingRef.current,
                        duration: reducedMotion ? 0 : 600,
                    });
                },
            });
        }
        return () => {
            spiderfierRef.current?.destroy();
            spiderfierRef.current = null;
            donutPoolRef.current?.destroy();
            donutPoolRef.current = null;
            subjectsHandleRef.current?.destroy();
            subjectsHandleRef.current = null;
        };
        // reducedMotion is intentionally captured at attach time
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, isLoaded, interactive]);
    useEffect(() => {
        closeSpiderfier();
        subjectsHandleRef.current?.update(props.subjects);
        donutPoolRef.current?.setTopics(topicsFromSubjects(props.subjects));
    }, [props.subjects, closeSpiderfier]);

    // Zooming re-arranges clusters under the fan — fold it back in.
    useEffect(() => {
        if (!map || !isLoaded) return;
        const onZoomStart = () => closeSpiderfier();
        map.on('zoomstart', onZoomStart);
        return () => {
            map.off('zoomstart', onZoomStart);
        };
    }, [map, isLoaded, closeSpiderfier]);

    // Selection (panel click or map click): highlight + gentle camera focus
    const selectedSubject = props.selectedSubjectId ? subjectsById.get(props.selectedSubjectId) ?? null : null;
    useEffect(() => {
        if (!map || !isLoaded) return;
        subjectsHandleRef.current?.setSelected(selectedSubject);
        if (!selectedSubject || props.flyToSelected === false || !interactive) return;

        const [lng, lat] = selectedSubject.anchor;
        const bounds = map.getBounds();
        const inView = Boolean(bounds && lng >= bounds.getWest() && lng <= bounds.getEast() &&
            lat >= bounds.getSouth() && lat <= bounds.getNorth());
        // Already on screen at street level → just recenter. Anything else
        // (off-screen, or hidden inside a cluster at low zoom) → fly in.
        if (inView && map.getZoom() >= 11) {
            map.easeTo({ center: selectedSubject.anchor, padding: paddingRef.current, duration: reducedMotion ? 0 : 300 });
        } else {
            map.flyTo({
                center: selectedSubject.anchor,
                zoom: Math.max(map.getZoom(), FLY_TO_MIN_ZOOM),
                padding: paddingRef.current,
                duration: reducedMotion ? 0 : FLY_TO_DURATION_MS,
                essential: true,
            });
        }
    }, [map, isLoaded, selectedSubject, props.flyToSelected, interactive, reducedMotion]);

    // External hover (panel rows)
    useEffect(() => {
        if (!map || !isLoaded) return;
        subjectsHandleRef.current?.setHovered(props.hoveredSubjectId ?? null);
    }, [map, isLoaded, props.hoveredSubjectId]);

    // Labeled reference dots (search/geolocate results, user-picked locations)
    const referenceMarkers = useMemo<MapReferenceMarker[]>(() => {
        const list = [...(props.referenceMarkers ?? [])];
        if (props.highlightPoint) {
            list.push({ id: '__highlight', coordinates: props.highlightPoint });
        }
        return list;
    }, [props.referenceMarkers, props.highlightPoint]);
    useEffect(() => {
        if (!map || !isLoaded || referenceMarkers.length === 0) return;
        const markers = referenceMarkers
            .filter(marker => Number.isFinite(marker.coordinates[0]) && Number.isFinite(marker.coordinates[1]))
            .map(definition => {
                const color = definition.color ?? '#0c0a09';
                const element = document.createElement('div');
                element.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;';
                element.innerHTML =
                    `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #ffffff;` +
                    `box-shadow:0 0 0 2px ${color}4d, 0 1px 3px rgb(0 0 0 / 0.3)"></div>` +
                    (definition.label
                        ? `<div style="font-size:12px;font-weight:600;color:#1c1917;white-space:nowrap;` +
                          `text-shadow:0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff">${definition.label.replace(/</g, '&lt;')}</div>`
                        : '');
                return new mapboxgl.Marker({ element, anchor: definition.label ? 'top' : 'center' })
                    .setLngLat(definition.coordinates)
                    .addTo(map);
            });
        return () => {
            for (const marker of markers) marker.remove();
        };
    }, [map, isLoaded, referenceMarkers]);

    // Unified click resolution: subjects (8px hit slop) win over
    // municipalities; empty clicks clear the selection.
    useEffect(() => {
        if (!map || !isLoaded || !interactive) return;
        const onClick = (event: mapboxgl.MapMouseEvent) => {
            // An open fan treats any map click as "dismiss" (badge clicks
            // don't reach the canvas).
            if (spiderfierRef.current?.isOpen()) {
                closeSpiderfier();
                return;
            }
            const subjectLayers = subjectsHandleRef.current?.hitTestLayerIds() ?? [];
            if (subjectLayers.length > 0) {
                const { x, y } = event.point;
                const hits = map.queryRenderedFeatures(
                    [[x - 8, y - 8], [x + 8, y + 8]],
                    { layers: subjectLayers },
                );
                const hit = hits[0];
                const hitId = hit?.id ?? hit?.properties?.id;
                if (hitId != null) {
                    const subject = subjectsByIdRef.current.get(String(hitId)) ?? null;
                    if (subject && markerOptionsRef.current.spiderfy) {
                        const group = subjectsByAnchorRef.current.get(anchorKeyOf(subject.anchor));
                        if (group && group.length > 1) {
                            openSpiderfier(group, subject.anchor);
                            return;
                        }
                    }
                    callbacksRef.current.onSubjectSelect?.(subject);
                    return;
                }
            }
            if (map.getLayer(MUNICIPALITIES_FILL_LAYER_ID) && map.getZoom() < BOUNDARY_FADE_END_ZOOM) {
                const muniHit = map.queryRenderedFeatures(event.point, { layers: [MUNICIPALITIES_FILL_LAYER_ID] })[0];
                if (muniHit?.id != null) {
                    const municipality = municipalitiesByIdRef.current.get(String(muniHit.id));
                    if (municipality) {
                        callbacksRef.current.onMunicipalityClick?.(municipality);
                        return;
                    }
                }
            }
            callbacksRef.current.onSubjectSelect?.(null);
        };
        map.on('click', onClick);
        return () => {
            map.off('click', onClick);
        };
    }, [map, isLoaded, interactive]);

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
            zoomBy(delta) {
                map.zoomTo(map.getZoom() + delta, { duration: reducedMotion ? 0 : 300 });
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
